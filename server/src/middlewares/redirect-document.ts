/**
 * The transitional document served in place of a redirect that an intermediary
 * turned into a bodyless 200.
 *
 * Why it exists: Render's static site rewrites `/api/*` to the backend, and for
 * top-level document navigations it rewrites the upstream 3xx to 200, keeps
 * `Location`, and replaces the body with `content-length: 0`. A browser ignores
 * `Location` on a 200 and has nothing to render. So the redirect travels in the
 * body instead. See oauth-callback-fallback.middleware.ts for the full
 * diagnosis and the scope limits.
 *
 * Design: a deliberate, minimal Drio screen rather than a browser-default page.
 * Tokens are the ones already in client/src/index.css (--background #1f1f1f,
 * --card #272727, --drio-accent #e5bd97, --drio-accent-light #f7d3b2,
 * --foreground #e6e6e6, --muted-foreground #b2b2b2, --border rgba(255,255,255,
 * .08)), so this reads as part of the product.
 *
 * Constraints honoured:
 *  - No external assets, fonts, images or dependencies. Self-contained.
 *  - Works with JavaScript disabled via <meta http-equiv="refresh">; the inline
 *    script is only a faster path and is not required.
 *  - No buttons: the page has one job and leaves on its own.
 *  - The animation is a CSS transform/opacity transition and respects
 *    `prefers-reduced-motion`.
 *  - No raw target URL is printed as body text. It appears only in the link's
 *    href, in the meta refresh, and in the inline script, all escaped or
 *    JSON-encoded.
 */

export type RedirectDocumentVariant = "signed-in" | "email-verified";

type Copy = {
    headline: string;
    sub: string;
    /** Distinguishes the two variants for assistive tech. */
    status: string;
};

const COPY: Record<RedirectDocumentVariant, Copy> = {
    "signed-in": {
        headline: "You're signed in",
        sub: "Taking you back to your dashboard...",
        status: "Signed in. Redirecting to your dashboard.",
    },
    "email-verified": {
        headline: "Email verified",
        sub: "Taking you back to sign in...",
        status: "Email verified. Redirecting to sign in.",
    },
};

// Escapes for an HTML attribute or text node.
const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

export const buildRedirectDocument = (target: string, variant: RedirectDocumentVariant): string => {
    const copy = COPY[variant];
    const attr = escapeHtml(target);
    // JSON.stringify yields a valid JS string literal; escaping "<" closes off
    // an injected "</script>" without changing the URL.
    const script = JSON.stringify(target).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=${attr}">
<title>${escapeHtml(copy.headline)} &middot; Drio</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #1f1f1f;
    color: #e6e6e6;
    font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .glow {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 520px;
    height: 520px;
    margin: -260px 0 0 -260px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(229, 189, 151, 0.10), rgba(229, 189, 151, 0) 68%);
    pointer-events: none;
  }
  .card {
    position: relative;
    width: 100%;
    max-width: 400px;
    padding: 40px 32px;
    text-align: center;
    background: #272727;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.30);
  }
  .wordmark {
    display: block;
    font-family: "Raleway", ui-sans-serif, Georgia, serif;
    font-size: 30px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
    background: linear-gradient(90deg, #f7d3b2, #e5bd97);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    margin: 26px auto 20px;
    border-radius: 999px;
    background: rgba(229, 189, 151, 0.14);
    border: 1px solid rgba(229, 189, 151, 0.24);
    color: #e5bd97;
  }
  .check svg { width: 26px; height: 26px; }
  h1 {
    margin: 0 0 8px;
    font-family: "Raleway", ui-sans-serif, Georgia, serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #e6e6e6;
  }
  p { margin: 0; font-size: 14px; line-height: 1.55; color: #b2b2b2; }
  .progress {
    position: relative;
    height: 3px;
    margin: 26px auto 0;
    width: 148px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .progress span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: linear-gradient(90deg, #e5bd97, #f7d3b2);
    transform-origin: left center;
    animation: sweep 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes sweep {
    0%   { transform: translateX(-100%) scaleX(0.55); opacity: 0.5; }
    50%  { transform: translateX(0%)    scaleX(1);    opacity: 1; }
    100% { transform: translateX(100%)  scaleX(0.55); opacity: 0.5; }
  }
  .card { animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to   { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
    .progress span { animation: none; transform: none; opacity: 0.85; }
  }
  @media (max-width: 420px) {
    .card { padding: 32px 22px; border-radius: 18px; }
  }
</style>
</head>
<body>
<div class="glow" aria-hidden="true"></div>
<main class="card" role="status" aria-live="polite">
  <span class="wordmark">Drio</span>
  <span class="check" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6 9 17l-5-5"></path>
    </svg>
  </span>
  <h1>${escapeHtml(copy.headline)}</h1>
  <p>${escapeHtml(copy.sub)}</p>
  <div class="progress" aria-hidden="true"><span></span></div>
  <span class="sr-only" hidden>${escapeHtml(copy.status)}</span>
</main>
<script>window.location.replace(${script});</script>
</body>
</html>`;
};
