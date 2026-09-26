import type { NextFunction, Request, Response } from "express";
import { authConfig } from "../config/auth.config";
import logger from "../config/logger.config";
import { buildRedirectDocument, type RedirectDocumentVariant } from "./redirect-document";

/**
 * Preserves auth redirects across Render's static-site edge.
 *
 * Verified cause: Render's static site rewrites `/api/*` to this backend, and
 * for TOP-LEVEL DOCUMENT NAVIGATIONS it rewrites the upstream 3xx status to 200
 * while keeping `Location` and `Set-Cookie` and replacing the body with
 * `content-length: 0`. A browser ignores `Location` on a 200 and has nothing to
 * render, which is the blank page. The same request sent as a fetch keeps its
 * 302, a 200 response body passes through the edge byte-for-byte, the behaviour
 * is not specific to one route, and it is the same over HTTP/1.1 and HTTP/2.
 * Repointing the rewrite at a different upstream does not help, so it is a
 * property of the static-site edge itself.
 *
 * The backend cannot emit a status the edge preserves, but it can emit a 200
 * that carries the redirect in its body. For the two browser-facing auth
 * callbacks below, this converts the redirect into `200 + HTML`. The browser then
 * navigates onward, and the `Set-Cookie` headers that arrived on the same
 * response are already stored, because cookies are applied before the document
 * is parsed.
 *
 * Nothing in Better Auth is modified. Token verification, state validation, the
 * verification lifecycle, session creation and cookie attributes all run inside
 * Better Auth before this ever sees a response; this only re-packages the
 * redirect that Better Auth already decided on. It cannot turn a failure into a
 * success, because it only ever runs on a response Better Auth has already
 * produced, and it only changes the transport of that response.
 *
 * Scope, deliberately narrow:
 *  - Only `GET /api/auth/callback/*` (OAuth provider callbacks) and
 *    `GET /api/auth/verify-email` (the email verification link). Nothing else
 *    in the app is affected, and this is NOT a generic 3xx-to-HTML converter:
 *    every other route keeps real 3xx semantics for API clients.
 *  - Only a 3xx that actually carries a `Location` is converted.
 *  - The target must be an absolute http(s) URL on the configured auth origin.
 *    Anything else is logged and passed through untouched, so this can never
 *    become an open redirect.
 *
 * TEMPORARY: safe to delete wholesale once the browser-facing origin is served
 * by something that relays 3xx intact. Only this file, redirect-document.ts and
 * the single mount point in app.ts reference it.
 */

const OAUTH_CALLBACK_PREFIX = "/api/auth/callback/";
const VERIFY_EMAIL_PATH = "/api/auth/verify-email";

/**
 * Where a successful email verification lands. Fixed on purpose: the
 * destination is never built from the request's `callbackURL` parameter, so a
 * crafted link cannot steer the recipient somewhere else.
 *
 * Verification must not look like a sign-in. Better Auth's own
 * `autoSignInAfterVerification` setting decides whether a session is issued;
 * this only chooses the page shown afterwards, and the login page is the honest
 * destination for a user who now needs to authenticate.
 */
const EMAIL_VERIFIED_DESTINATION = `${authConfig.betterAuthUrl.replace(/\/+$/, "")}/login`;

type Route = "oauth-callback" | "verify-email";

const resolveRoute = (req: Request): Route | null => {
    if (req.method !== "GET") return null;
    const path = req.path;
    if (path.startsWith(OAUTH_CALLBACK_PREFIX)) return "oauth-callback";
    if (path === VERIFY_EMAIL_PATH) return "verify-email";
    return null;
};

/** Same-origin absolute http(s) URLs only. null means "do not touch it". */
const resolveSameOriginTarget = (location: string): URL | null => {
    let url: URL;
    try {
        url = new URL(location);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    let allowedOrigin: string;
    try {
        allowedOrigin = new URL(authConfig.betterAuthUrl).origin;
    } catch {
        return null;
    }
    return url.origin === allowedOrigin ? url : null;
};

/**
 * Picks the destination and the copy for a given route.
 *
 * For `verify-email` a success is any redirect Better Auth made WITHOUT an
 * `error` query parameter, because `redirectOnError` in
 * better-auth/dist/api/routes/email-verification.mjs always appends
 * `?error=<code>`. A success therefore becomes the fixed login destination; a
 * failure keeps Better Auth's own destination, including its error code, so the
 * frontend still receives and can display the reason.
 */
const resolvePresentation = (
    route: Route,
    location: string
): { target: string; variant: RedirectDocumentVariant } | null => {
    const sameOrigin = resolveSameOriginTarget(location);
    if (!sameOrigin) return null;

    if (route === "verify-email") {
        if (sameOrigin.searchParams.has("error")) {
            return { target: sameOrigin.toString(), variant: "email-verified" };
        }
        return { target: EMAIL_VERIFIED_DESTINATION, variant: "email-verified" };
    }

    return { target: sameOrigin.toString(), variant: "signed-in" };
};

export const authRedirectFallbackMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const route = resolveRoute(req);
    if (!route) return next();

    const originalWriteHead = res.writeHead.bind(res);
    const originalEnd = res.end.bind(res);

    // The document is built in writeHead, the only point at which the status and
    // Content-Length are both still mutable. end() then only emits the bytes.
    let pendingBody: string | undefined;

    // better-call writes headers with setHeader, assigns res.statusCode, then
    // calls res.writeHead(status). Both argument forms are handled because Node
    // accepts writeHead(status) and writeHead(status, headers).
    (res as Response & { writeHead: Response["writeHead"] }).writeHead = function (
        this: Response,
        ...args: Parameters<Response["writeHead"]>
    ) {
        const status = typeof args[0] === "number" ? args[0] : res.statusCode;
        const headerArg =
            typeof args[1] === "object" && args[1] !== null ? args[1] : undefined;
        const location = (res.getHeader("location") as string | undefined) ??
            (headerArg && typeof headerArg === "object"
                ? ((headerArg as Record<string, unknown>).location as string | undefined)
                : undefined);

        if (status >= 300 && status < 400 && location) {
            const presentation = resolvePresentation(route, location);
            if (presentation) {
                const html = buildRedirectDocument(presentation.target, presentation.variant);
                // Rewrite the status the edge preserves and carry the redirect in
                // the body. Set-Cookie headers already on the response, including
                // their Secure/HttpOnly/SameSite attributes, are left alone.
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Content-Length", Buffer.byteLength(html, "utf-8"));
                res.removeHeader("Location");
                pendingBody = html;
                return originalWriteHead.call(res, 200);
            }
            logger.warn("Auth callback redirect target rejected; passing 3xx through unchanged", {
                route,
                status,
                locationOrigin: (() => {
                    try {
                        return new URL(location, "http://placeholder.invalid").origin;
                    } catch {
                        return "<unparseable>";
                    }
                })(),
                allowedOrigin: (() => {
                    try {
                        return new URL(authConfig.betterAuthUrl).origin;
                    } catch {
                        return "<unparseable>";
                    }
                })(),
            });
        }
        return (originalWriteHead as (...a: unknown[]) => Response).apply(res, args as unknown[]);
    } as Response["writeHead"];

    // writeHead has already flushed the status line and headers by the time end()
    // runs, which is why the body is emitted here rather than appended.
    (res as Response & { end: Response["end"] }).end = function (
        this: Response,
        ...args: Parameters<Response["end"]>
    ) {
        if (pendingBody !== undefined) {
            const html = pendingBody;
            pendingBody = undefined;
            return (originalEnd as (...a: unknown[]) => Response).call(res, html, "utf-8");
        }
        return (originalEnd as (...a: unknown[]) => Response).apply(res, args as unknown[]);
    } as Response["end"];

    next();
};
