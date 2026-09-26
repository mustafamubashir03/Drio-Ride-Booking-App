import type { Request, Response, NextFunction } from "express";

/**
 * Ensures 3xx redirect responses from Better Auth endpoints include an HTML fallback
 * body containing <meta http-equiv="refresh"> and <script>window.location.href</script>.
 *
 * Why this is necessary:
 * The browser-facing application runs on Render as a static site (`drio-ride-booking-app`),
 * which rewrites `/api/*` requests to Vercel (`drio-main-server.vercel.app`).
 * For top-level document navigations (such as OAuth callback GET requests), Render's static
 * site rewrite engine converts HTTP 3xx redirect statuses (like 302 Found) to status 200 OK.
 *
 * Browsers ignore the `Location` response header when the HTTP status code is 200 OK.
 * By embedding an HTML redirect payload in the response body, the browser receives and
 * stores all `Set-Cookie` session headers, and then immediately executes the client-side
 * JavaScript / meta refresh redirect to land on `/dashboard` (or the intended redirect URL).
 */
export const oauthRedirectHtmlFallbackMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    let redirectLocation: string | undefined;

    // Intercept res.setHeader to catch Location header if set
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function (name: string, value: string | number | readonly string[]) {
        if (typeof name === "string" && name.toLowerCase() === "location") {
            redirectLocation = Array.isArray(value) ? String(value[0]) : String(value);
        }
        return originalSetHeader(name, value as any);
    };

    // Intercept res.writeHead to catch status code & Location header
    const originalWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = function (...args: any[]) {
        const headers = args.length > 1 && typeof args[1] === "object" ? args[1] : (typeof args[2] === "object" ? args[2] : undefined);
        if (headers) {
            for (const [k, v] of Object.entries(headers)) {
                if (k.toLowerCase() === "location") {
                    redirectLocation = Array.isArray(v) ? String(v[0]) : String(v);
                }
            }
        }
        return originalWriteHead(...(args as [any, ...any[]]));
    };

    // Intercept res.end to write the HTML fallback if redirecting
    const originalEnd = res.end.bind(res);
    (res as any).end = function (chunk?: any, encoding?: any, cb?: any) {
        const status = res.statusCode;
        if (status >= 300 && status < 400 && redirectLocation) {
            const escapedUrl = redirectLocation.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const jsonUrl = JSON.stringify(redirectLocation);
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${escapedUrl}">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="${escapedUrl}">${escapedUrl}</a>...</p>
  <script>window.location.href = ${jsonUrl};</script>
</body>
</html>`;

            originalSetHeader("Content-Type", "text/html; charset=utf-8");
            originalSetHeader("Content-Length", String(Buffer.byteLength(html, "utf-8")));

            return originalEnd(html, "utf-8", cb);
        }
        return originalEnd(chunk, encoding, cb);
    };

    next();
};
