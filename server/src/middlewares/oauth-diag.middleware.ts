import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { authConfig } from "../config/auth.config";
import logger from "../config/logger.config";

/**
 * TEMPORARY OAuth diagnostics. Safe to delete wholesale: nothing outside this
 * file and the two mount points imports it.
 *
 * Design constraints:
 *  - Never logs a secret, an OAuth `code`, a cookie value, or the OAuth state.
 *    Only presence flags, lengths, cookie names/attributes, status codes and
 *    sanitized URLs.
 *  - Sits at the HTTP boundary, so it observes Better Auth without patching the
 *    dependency and without changing any Better Auth setting or behaviour.
 *  - `stateFingerprint` is a truncated SHA-256 of the state, which is what makes
 *    a first callback distinguishable from a replay of the same state.
 */

const AUTH_PREFIX = "/api/auth/";
const STATE_COOKIE = "better-auth.state";
const SESSION_COOKIE = "better-auth.session_token";

// Query parameters that must never reach the log.
const REDACTED_PARAMS = new Set([
    "code",
    "state",
    "code_challenge",
    "code_verifier",
    "access_token",
    "refresh_token",
    "id_token",
    "token",
    "password",
]);

export const fingerprint = (value: string | undefined | null): string | undefined =>
    value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 12) : undefined;

/** Strips every sensitive query parameter, keeping the readable parts. */
export const sanitizeUrl = (raw: string | undefined | null): string | undefined => {
    if (!raw) return raw ?? undefined;
    try {
        const u = new URL(raw, "http://placeholder.invalid");
        let changed = false;
        for (const key of [...u.searchParams.keys()]) {
            if (REDACTED_PARAMS.has(key)) {
                u.searchParams.set(key, "REDACTED");
                changed = true;
            }
        }
        const rendered = u.toString();
        return changed ? rendered.replace("http://placeholder.invalid", "") : raw;
    } catch {
        return "<unparseable url>";
    }
};

type CookieFacts = {
    name: string;
    maxAge?: string;
    path?: string;
    domain?: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: string;
    valueLength: number;
};

/** Cookie name + attributes + value LENGTH only. Values are never returned. */
export const describeSetCookie = (raw: string): CookieFacts => {
    const [pair, ...attrs] = raw.split(";");
    const eq = pair.indexOf("=");
    const name = eq >= 0 ? pair.slice(0, eq).trim() : pair.trim();
    const value = eq >= 0 ? pair.slice(eq + 1) : "";
    const get = (key: string) => {
        const hit = attrs.find((a) => a.trim().toLowerCase().startsWith(`${key}=`));
        return hit ? hit.split("=").slice(1).join("=").trim() : undefined;
    };
    return {
        name,
        valueLength: value.length,
        maxAge: get("max-age"),
        path: get("path"),
        domain: get("domain"),
        secure: attrs.some((a) => a.trim().toLowerCase() === "secure"),
        httpOnly: attrs.some((a) => a.trim().toLowerCase() === "httponly"),
        sameSite: get("samesite"),
    };
};

const cookieNames = (req: Request): string[] =>
    (req.headers.cookie || "")
        .split(";")
        .map((c) => c.split("=")[0].trim())
        .filter(Boolean);

const isCallback = (p: string) => p.startsWith(`${AUTH_PREFIX}callback/`);
const isSocialSignIn = (p: string, m: string) => p === `${AUTH_PREFIX}sign-in/social` && m === "POST";

let configLogged = false;

/** One block per process, emitted after Better Auth is initialised. */
export const logOAuthDiagConfig = (): void => {
    if (configLogged) return;
    configLogged = true;

    const googleClientIdSet = Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
    const googleSecretSet = Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
    const verificationDisabled =
        process.env.DRIO_DISABLE_EMAIL_VERIFICATION === "true" ||
        process.env.DISABLE_EMAIL_VERIFICATION === "true";

    logger.info("OAUTH-DIAG CONFIG", {
        event: "OAUTH-DIAG[CONFIG]",
        nodeEnv: process.env.NODE_ENV,
        isVercelFunction: Boolean(process.env.VERCEL),
        nodeVersion: process.version,
        runtime: process.env.VERCEL ? "vercel-function" : "node-server",

        serverBetterAuthUrl: authConfig.betterAuthUrl,
        // Present only if someone put a Vite var in the server env. The server
        // never reads it; recorded so its absence/presence is not a mystery.
        serverEnvHasViteBetterAuthUrl: Boolean(process.env.VITE_BETTER_AUTH_URL?.trim()),
        trustedOrigins: authConfig.trustedOrigins,

        google: {
            clientIdConfigured: googleClientIdSet,
            clientSecretConfigured: googleSecretSet,
            // Literals in src/lib/auth.ts; echoed here for convenience.
            accessType: "offline",
            prompt: "select_account consent",
            overrideUserInfoOnSignIn: true,
            // Read from socialProviders.google.options, which auth.ts does NOT
            // set, so the session gate in link-account.mjs is skipped.
            providerRequireEmailVerification: "undefined (not set in auth.ts)",
        },
        emailAndPassword: {
            requireEmailVerification: !verificationDisabled,
            disableEmailVerificationFlag: verificationDisabled,
        },
        database: {
            adapter: "mongodbAdapter",
            verificationStorage: "database (collection: verification, key: identifier)",
            secondaryStorageConfigured: false,
        },
        secrets: {
            betterAuthSecretConfigured: Boolean(authConfig.betterAuthSecret),
            mongoUriConfigured: Boolean(process.env.MONGO_URI?.trim()),
        },
    });
};

type Captured = { status?: number; headers: Record<string, string | string[]> };

/**
 * Express middleware mounted immediately before the Better Auth handler.
 * Observes only; never mutates the request, the response, or any header.
 */
export const oauthDiagMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || "";
    if (!path.startsWith(AUTH_PREFIX)) {
        next();
        return;
    }

    const requestId = crypto.randomBytes(6).toString("hex");
    const startedAt = Date.now();
    const isCb = isCallback(path);
    const isInit = isSocialSignIn(path, req.method);

    if (!isCb && !isInit) {
        next();
        return;
    }

    const captured: Captured = { headers: {} };

    // Record status + headers without altering what Better Auth emits.
    const originalWriteHead = res.writeHead.bind(res);
    (res as unknown as { writeHead: Response["writeHead"] }).writeHead = ((...args: unknown[]) => {
        const [maybeStatus, maybeMessage, maybeHeaders] = args as [
            number | undefined,
            unknown,
            Record<string, unknown> | undefined,
        ];
        if (typeof maybeStatus === "number") captured.status = maybeStatus;
        const headerSource =
            maybeHeaders && typeof maybeHeaders === "object"
                ? maybeHeaders
                : typeof maybeMessage === "object" && maybeMessage !== null
                  ? (maybeMessage as Record<string, unknown>)
                  : undefined;
        if (headerSource) {
            for (const [k, v] of Object.entries(headerSource)) {
                if (v !== undefined) captured.headers[k.toLowerCase()] = String(v);
            }
        }
        return originalWriteHead(...(args as Parameters<Response["writeHead"]>));
    }) as Response["writeHead"];

    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = ((name: string, value: string | number | readonly string[]) => {
        captured.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
        return originalSetHeader(name, value as string | number | readonly string[]);
    }) as Response["setHeader"];

    if (isInit) {
        logInit(req);
    } else {
        logCallbackStart(req, requestId);
    }

    res.on("finish", () => {
        const setCookieHeader = captured.headers["set-cookie"];
        const locationRaw = captured.headers["location"];
        const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;
        const rawCookies: string[] = [];
        if (Array.isArray(setCookieHeader)) rawCookies.push(...setCookieHeader);
        else if (typeof setCookieHeader === "string") {
            // A joined value loses cookie boundaries; re-split conservatively on
            // the ", " that precedes a new name= token.
            rawCookies.push(...setCookieHeader.split(/,\s*(?=[^;=]+=[^;]*;)/));
        }
        const cookies = rawCookies.map(describeSetCookie);
        const sessionCookie = cookies.find((c) => c.name.includes(SESSION_COOKIE));
        const stateCookie = cookies.find((c) => c.name.includes(STATE_COOKIE));

        if (isInit) {
            const params = safeParams(location);
            logger.info("OAUTH-DIAG INIT", {
                event: "OAUTH-DIAG[INIT]",
                requestId,
                method: req.method,
                path,
                provider: "google",
                requestOrigin: req.headers.origin,
                requestHost: req.headers.host,
                referer: req.headers.referer,
                runtimeBetterAuthUrl: authConfig.betterAuthUrl,
                responseStatus: captured.status,
                generatedRedirectUri: params.redirect_uri,
                googleAuthorizeHost: safeHost(location),
                stateCookieIssued: Boolean(stateCookie),
                stateCookieName: stateCookie?.name,
                stateCookieMaxAge: stateCookie?.maxAge,
                stateCookieSecure: stateCookie?.secure,
                stateCookieHttpOnly: stateCookie?.httpOnly,
                stateCookieSameSite: stateCookie?.sameSite,
                stateCookiePath: stateCookie?.path,
                stateCookieDomain: stateCookie?.domain ?? "(absent - host-only)",
                stateCookieValueLength: stateCookie?.valueLength,
                stateFingerprint: params.stateFingerprint,
                totalDurationMs: Date.now() - startedAt,
            });
        } else {
            const sanitizedLocation = sanitizeUrl(location);
            const errorCode = safeErrorCode(location);
            const sentCookies = cookieNames(req);
            const sentStateCookie = sentCookies.find((n) => n.includes(STATE_COOKIE));
            const sentSessionCookie = sentCookies.find((n) => n.includes(SESSION_COOKIE));

            logger.info("OAUTH-DIAG CALLBACK-COOKIES", {
                event: "OAUTH-DIAG[CALLBACK-COOKIES]",
                requestId,
                allCookieNames: sentCookies,
                stateCookieSent: Boolean(sentStateCookie),
                stateCookieName: sentStateCookie,
                sessionCookieSent: Boolean(sentSessionCookie),
            });

            logger.info("OAUTH-DIAG CALLBACK-RESPONSE", {
                event: "OAUTH-DIAG[CALLBACK-RESPONSE]",
                requestId,
                responseStatus: captured.status,
                location: sanitizedLocation,
                setCookieCount: cookies.length,
                sessionCookieIssued: Boolean(sessionCookie),
                cookies,
            });

            // Derived, and explicitly labelled as derived: whether the state
            // record was found cannot be observed from outside Better Auth, but
            // the response determines it unambiguously.
            const verificationFound = !errorCode;
            const tokenExchangeReached = Boolean(sessionCookie) || !errorCode;
            logger.info("OAUTH-DIAG CALLBACK-END", {
                event: "OAUTH-DIAG[CALLBACK-END]",
                requestId,
                provider: "google",
                errorCode: errorCode ?? "(none)",
                verificationFound,
                verificationFoundSource: "derived from response error code",
                tokenExchangeReached,
                tokenExchangeReachedSource:
                    "derived: a session cookie or a clean redirect is only reachable after the Google token exchange",
                sessionCreationCalled: Boolean(sessionCookie),
                sessionCreationSucceeded: Boolean(sessionCookie),
                sessionCookieIssued: Boolean(sessionCookie),
                redirectLocation: sanitizedLocation,
                stateCookieClearedByServer: cookies.some((c) => c.name.includes(STATE_COOKIE) && c.maxAge === "0"),
                totalDurationMs: Date.now() - startedAt,
            });
        }
    });

    next();
};

const logInit = (req: Request): void => {
    logger.info("OAUTH-DIAG INIT-START", {
        event: "OAUTH-DIAG[INIT-START]",
        method: req.method,
        path: req.path,
        provider: "google",
        requestOrigin: req.headers.origin,
        requestHost: req.headers.host,
        referer: req.headers.referer,
    });
};

const logCallbackStart = (req: Request, requestId: string): void => {
    const query = (req.query || {}) as Record<string, unknown>;
    const state = typeof query.state === "string" ? query.state : undefined;
    const code = typeof query.code === "string" ? query.code : undefined;
    const iss = typeof query.iss === "string" ? query.iss : undefined;

    logger.info("OAUTH-DIAG CALLBACK-START", {
        event: "OAUTH-DIAG[CALLBACK-START]",
        requestId,
        method: req.method,
        path: req.path,
        provider: req.path.split("/").pop(),
        requestHost: req.headers.host,
        requestOrigin: req.headers.origin,
        referer: req.headers.referer,
        statePresent: Boolean(state),
        stateFingerprint: fingerprint(state),
        codePresent: Boolean(code),
        codeLength: code?.length,
        iss,
    });
};

const safeParams = (location: string | undefined) => {
    let redirect_uri: string | undefined;
    let stateFingerprint: string | undefined;
    if (location) {
        try {
            const u = new URL(location, "http://placeholder.invalid");
            redirect_uri = u.searchParams.get("redirect_uri") ?? undefined;
            // The state lives only in the generated Google URL, so this is the
            // only place a fingerprint can be taken at initiation time.
            stateFingerprint = fingerprint(u.searchParams.get("state") ?? undefined);
        } catch {
            /* ignore */
        }
    }
    return { redirect_uri, stateFingerprint };
};

const safeHost = (location: string | undefined): string | undefined => {
    if (!location) return undefined;
    try {
        return new URL(location, "http://placeholder.invalid").host;
    } catch {
        return undefined;
    }
};

const safeErrorCode = (location: string | undefined): string | undefined => {
    if (!location) return undefined;
    try {
        return new URL(location, "http://placeholder.invalid").searchParams.get("error") ?? undefined;
    } catch {
        return undefined;
    }
};
