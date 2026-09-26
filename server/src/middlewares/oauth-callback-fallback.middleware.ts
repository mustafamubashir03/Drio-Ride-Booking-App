import type { NextFunction, Request, Response } from "express";
import { authConfig } from "../config/auth.config";
import logger from "../config/logger.config";

/**
 * Preserves the OAuth callback redirect across Render's static-site edge.
 *
 * Verified cause (see the probes summarised below): Render's static site
 * rewrites `/api/*` to the Vercel backend, and for TOP-LEVEL DOCUMENT
 * NAVIGATIONS it rewrites the upstream 3xx status to 200 while keeping the
 * `Location` and `Set-Cookie` headers and replacing the body with
 * `content-length: 0`. A browser ignores `Location` on a 200 and has nothing to
 * render, which is the blank callback page. The same request sent as a fetch
 * (`Sec-Fetch-Mode: cors`) keeps its 302, and a 200 response body passes through
 * the edge byte-for-byte, so only the status line is being rewritten.
 *
 * The backend cannot emit a status the edge preserves, but it CAN emit a 200
 * that carries a redirect in its body. So for the OAuth callback only, this
 * converts Better Auth's own redirect response into `200 + HTML` containing a
 * meta refresh and a `location.replace`. The browser then navigates to the
 * intended URL, and the `Set-Cookie` headers that were already on the response
 * are stored first, because they arrive in the same response.
 *
 * This does NOT touch Better Auth. State creation, state validation, the
 * verification lifecycle, the token exchange, session creation and cookie
 * attributes are all untouched: those all happen upstream of this middleware and
 * their headers are forwarded verbatim. Nothing here is weakened; only the
 * transport that carries an already-decided redirect is adapted.
 *
 * Deliberate constraints:
 *  - Scoped to GET `/api/auth/callback/*`. No other route, method or path is
 *    affected, so API clients keep real 3xx semantics.
 *  - Only a 3xx that actually carries a `Location` is converted.
 *  - The target must be an absolute http(s) URL on the configured auth origin.
 *    Anything else is passed through untouched rather than reflected, so this
 *    can never become an open redirect.
 *  - If the response has already been sent, nothing is attempted.
 *
 * TEMPORARY: safe to delete wholesale once the browser-facing callback no longer
 * passes through Render's static-site edge (i.e. once the frontend origin is
 * served by something that relays 3xx intact). Only this file and the single
 * mount point in app.ts import it.
 */

const CALLBACK_PREFIX = "/api/auth/callback/";

// Escapes for both an HTML attribute and a JS string literal context.
const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/**
 * Only same-origin absolute http(s) URLs are honoured. Returning null makes the
 * caller leave the original 3xx alone, which is the safe default.
 */
const resolveCallbackTarget = (location: string): URL | null => {
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

const buildRedirectDocument = (target: string): string => {
    const attr = escapeHtml(target);
    // JSON.stringify produces a valid JS string literal and escapes quotes and
    // backslashes; the extra angle-bracket escaping closes off a "</script>".
    const script = JSON.stringify(target).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${attr}">
<title>Signing you in</title>
</head>
<body>
<p>Taking you to <a href="${attr}">your dashboard</a>&hellip;</p>
<script>window.location.replace(${script});</script>
</body>
</html>`;
};

export const oauthCallbackRedirectFallbackMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (req.method !== "GET") return next();
    if (!req.path.startsWith(CALLBACK_PREFIX)) return next();

    const originalWriteHead = res.writeHead.bind(res);
    const originalEnd = res.end.bind(res);

    // The rendered document is computed once, in writeHead, because that is the
    // only point at which the status and Content-Length are still both mutable.
    // end() then only has to emit the bytes.
    let pendingBody: string | undefined;

    // better-call writes headers with setHeader, assigns res.statusCode, then
    // calls res.writeHead(status). Both arguments forms are handled because
    // Node accepts writeHead(status) and writeHead(status, headers).
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
            const target = resolveCallbackTarget(location);
            if (target) {
                const html = buildRedirectDocument(target.toString());
                // Rewrite the status the edge preserves, and carry the redirect
                // in the body instead. Set-Cookie headers already set on the
                // response are left completely alone.
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader("Content-Length", Buffer.byteLength(html, "utf-8"));
                res.removeHeader("Location");
                pendingBody = html;
                return originalWriteHead.call(res, 200);
            }
            logger.warn("OAuth callback redirect target rejected; passing 3xx through unchanged", {
                origin: new URL(location, "http://placeholder.invalid").origin,
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
    // runs, which is exactly why the body has to be emitted here rather than
    // being appended to the original arguments.
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
