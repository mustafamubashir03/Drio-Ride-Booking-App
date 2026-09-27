// Regression harness for Drio's Google OAuth account-linking policy.
//
// Background: a user who registered with email/password and had NOT verified
// their address could not sign in with Google. Better Auth refused implicit
// linking with `account_not_linked` and issued no session, so the browser
// landed on /login?error=account_not_linked. The policy is now: allow the link,
// but remove the unproven local credential as part of the promotion
// (server/src/lib/account-linking.ts).
//
// The auth options are read from the COMPILED dist/lib/auth.js, so this harness
// exercises the shipped configuration and the shipped cleanup hook and cannot
// drift from them. Only Google's token exchange and profile lookup are stubbed:
// no network call, no live database, no credentials. Storage is Better Auth's
// in-memory adapter; the linking gate is evaluated before any write, so it is
// exercised identically to MongoDB.
const path = require("path");
const http = require("http");

const APP = "https://drio-ride-booking-app.onrender.com";

process.env.BETTER_AUTH_URL = APP;
process.env.BETTER_AUTH_SECRET = "harness-secret-0000000000000000000000";
// dist/lib/auth.js constructs a MongoClient at import time. The options are read
// without ever connecting, so a syntactically valid unreachable URI is enough.
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/drio-harness-unused";
// Dummy provider credentials: no consent screen is completed and the token
// exchange is stubbed. They only have to be non-empty.
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "harness-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "harness-client-secret";
// Force the production default (verification ON) so the harness exercises
// email/password verification rather than a developer's local .env. dotenv runs
// at import time and never overrides an already-set variable, so these win.
process.env.DRIO_DISABLE_EMAIL_VERIFICATION = "false";
process.env.DISABLE_EMAIL_VERIFICATION = "false";

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra ? `  -> ${extra}` : ""}`); }
};

(async () => {
    const { createRequire } = require("module");
    const fs = require("fs");
    const { join } = require("path");
    const req = createRequire(__filename);
    const serverDir = path.join(__dirname, "..", "server");
    const ba = (rel) => `file:///${join(serverDir, "node_modules", "better-auth", rel).replace(/\\/g, "/")}`;

    const { betterAuth } = await import(ba("dist/index.mjs"));
    const { memoryAdapter } = await import(ba("dist/adapters/memory-adapter/index.mjs"));
    const { toNodeHandler } = await import(ba("dist/integrations/node.mjs"));

    const coreEntry = [
        join(serverDir, "node_modules", "better-auth", "node_modules", "@better-auth", "core", "dist", "social-providers", "index.mjs"),
        join(serverDir, "node_modules", "@better-auth", "core", "dist", "social-providers", "index.mjs"),
    ].find((p) => fs.existsSync(p));
    if (!coreEntry) throw new Error("could not locate @better-auth/core social-providers");
    const core = await import(`file:///${coreEntry.replace(/\\/g, "/")}`);

    // Identity the stubbed provider will assert, plus what the token exchange saw.
    let current = { sub: null, email: null, name: null, emailVerified: true };
    let lastTokenExchange = null;
    const realGoogle = core.socialProviders.google;
    core.socialProviders.google = (cfg) => {
        const p = realGoogle(cfg);
        p.validateAuthorizationCode = async (args) => {
            lastTokenExchange = {
                hadCode: typeof args.code === "string" && args.code.length > 0,
                hadCodeVerifier: typeof args.codeVerifier === "string" && args.codeVerifier.length > 0,
            };
            return { accessToken: "stub", refreshToken: "stub", idToken: "stub", scopes: ["openid", "email", "profile"] };
        };
        return p;
    };

    const { initAuth } = await import(`file:///${join(serverDir, "dist", "lib", "auth.js").replace(/\\/g, "/")}`);
    const shipped = (await initAuth()).options;
    const shippedLinking = shipped.account?.accountLinking ?? {};

    console.log("\n1. Shipped account-linking configuration");
    check("accountLinking.requireLocalEmailVerified is false",
        shippedLinking.requireLocalEmailVerified === false,
        `got ${JSON.stringify(shippedLinking.requireLocalEmailVerified)}`);
    check("accountLinking.updateUserInfoOnLink preserved", shippedLinking.updateUserInfoOnLink === true);
    check("accountLinking.trustedProviders still unset",
        shippedLinking.trustedProviders === undefined,
        `got ${JSON.stringify(shippedLinking.trustedProviders)}`);
    check("accountLinking.enabled not disabled", shippedLinking.enabled !== false);
    check("unproven-credential cleanup hook is registered",
        typeof shipped.databaseHooks?.account?.create?.after === "function");

    console.log("\n2. Shipped security invariants unchanged");
    check("email verification NOT globally disabled",
        shipped.emailAndPassword?.requireEmailVerification === true,
        `requireEmailVerification=${shipped.emailAndPassword?.requireEmailVerification}`);
    check("emailVerification.sendOnSignUp still env-driven",
        typeof shipped.emailVerification?.sendOnSignUp === "boolean");
    check("google provider options untouched",
        shipped.socialProviders?.google?.accessType === "offline" &&
        shipped.socialProviders?.google?.prompt === "select_account consent" &&
        shipped.socialProviders?.google?.overrideUserInfoOnSignIn === true);
    check("session cookie cache unchanged",
        shipped.session?.cookieCache?.enabled === true && shipped.session?.cookieCache?.maxAge === 300);
    check("cookie attributes unchanged", shipped.advanced?.defaultCookieAttributes?.sameSite === "lax");
    check("OAuth state validation not disabled", shipped.account?.skipStateCookieCheck !== true);
    check("onAPIError.errorURL still points at /login", shipped.onAPIError?.errorURL === `${APP}/login`);

    // The test instance reuses the shipped options, including databaseHooks, so
    // the shipped cleanup hook is what runs below. The verification URL is
    // captured so the email/password verification path can be exercised.
    let verificationUrl = null;
    const auth = betterAuth({
        ...shipped,
        baseURL: APP,
        trustedOrigins: [APP],
        secret: process.env.BETTER_AUTH_SECRET,
        database: memoryAdapter({}),
        onAPIError: { errorURL: `${APP}/login` },
        emailVerification: {
            ...shipped.emailVerification,
            sendVerificationEmail: async ({ url }) => { verificationUrl = url; },
        },
        socialProviders: {
            google: {
                ...shipped.socialProviders.google,
                getUserInfo: async () => ({
                    user: { name: current.name, email: current.email, image: null, emailVerified: current.emailVerified },
                    data: { sub: current.sub },
                }),
            },
        },
    });

    const express = req(path.join(serverDir, "node_modules", "express"));
    const { authRedirectFallbackMiddleware } = req(
        path.join(serverDir, "dist", "middlewares", "auth-redirect-fallback.middleware.js")
    );
    const app = express();
    app.use(authRedirectFallbackMiddleware);
    app.all("/api/auth/{*splat}", toNodeHandler(auth));

    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;

    class Jar {
        constructor() { this.c = new Map(); }
        absorb(res) {
            const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
            for (const line of raw) {
                const [pair, ...attrs] = line.split(";");
                const i = pair.indexOf("=");
                const name = pair.slice(0, i).trim();
                const value = pair.slice(i + 1).trim();
                const a = {};
                for (const at of attrs) {
                    const j = at.indexOf("=");
                    a[(j === -1 ? at : at.slice(0, j)).trim().toLowerCase()] = j === -1 ? true : at.slice(j + 1).trim();
                }
                if (value === "" || ("max-age" in a && Number(a["max-age"]) <= 0)) { this.c.delete(name); continue; }
                this.c.set(name, { value, a });
            }
            return raw;
        }
        header() { return [...this.c].map(([n, v]) => `${n}=${v.value}`).join("; "); }
        has(n) { return this.c.has(n); }
    }

    const ctx = await auth.$context;
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

    // The in-memory adapter throws on findMany for a model that has never held a
    // row, which MongoDB never does (the collections always exist). Seed one
    // throwaway row per model and remove the ones that need removing, so the
    // first real flow sees the same collection shape production has.
    {
        const warm = await ctx.internalAdapter.createUser(
            { name: "Warmup", email: `warmup-${stamp}@example.invalid`, emailVerified: true },
            { method: "register" }
        );
        await ctx.internalAdapter.createAccount({
            userId: warm.id, providerId: "credential", accountId: warm.id, password: "warmup",
        });
        // `session` and `verification` are read before anything writes them.
        await ctx.adapter.create({ model: "session", data: { id: `warmup-session-${stamp}`, userId: warm.id, token: "warmup", expiresAt: new Date(Date.now() - 1000), createdAt: new Date(), updatedAt: new Date() } });
        await ctx.adapter.create({ model: "verification", data: { id: `warmup-verification-${stamp}`, identifier: `warmup-${stamp}`, value: "warmup", expiresAt: new Date(Date.now() - 1000), createdAt: new Date(), updatedAt: new Date() } });
        await ctx.adapter.deleteMany({ model: "session", where: [{ field: "userId", value: warm.id }] });
        await ctx.adapter.deleteMany({ model: "verification", where: [{ field: "identifier", value: `warmup-${stamp}` }] });
        const warmCred = await ctx.internalAdapter.findCredentialAccount(warm.id);
        if (warmCred) await ctx.internalAdapter.deleteAccount(warmCred.id);
        await ctx.internalAdapter.deleteUser(warm.id);
    }

    // Mirrors what /api/auth/sign-up/email leaves behind.
    const seedLocalUser = async (email, name, { emailVerified, role } = {}) => {
        const user = await ctx.internalAdapter.createUser(
            { name, email, emailVerified: emailVerified === true, ...(role ? { role } : {}) },
            { method: "register" }
        );
        const password = `${name.split(" ")[0].toLowerCase()}-password-123`;
        await ctx.internalAdapter.createAccount({
            userId: user.id, providerId: "credential", accountId: user.id,
            password: await ctx.password.hash(password),
        });
        return { user, password };
    };

    const startSignIn = async () => {
        const jar = new Jar();
        const si = await fetch(`${origin}/api/auth/sign-in/social`, {
            method: "POST", headers: { "content-type": "application/json", origin: APP },
            body: JSON.stringify({ provider: "google", callbackURL: `${APP}/dashboard` }),
        });
        jar.absorb(si);
        const siBody = await si.json();
        return { jar, state: new URL(siBody.url).searchParams.get("state") };
    };

    const callback = async ({ jar, state }, { tamper = false, code = "stub-code" } = {}) => {
        const cb = await fetch(
            `${origin}/api/auth/callback/google?code=${encodeURIComponent(code)}&state=${encodeURIComponent(tamper ? `${state}x` : state)}`,
            { headers: { cookie: jar.header(), origin: APP }, redirect: "manual" }
        );
        const setCookie = jar.absorb(cb);
        const body = await cb.text();
        const target = cb.status === 200
            ? (body.match(/url=([^"'>\s]+)/)?.[1] ?? "").replace(/&quot;|"/g, "")
            : (cb.headers.get("location") ?? "");
        const url = target ? new URL(target) : null;
        return {
            status: cb.status, setCookie, body,
            path: url?.pathname ?? null,
            error: url?.searchParams.get("error") ?? null,
            session: jar.has("__Secure-better-auth.session_token"),
        };
    };

    const googleSignIn = async (identity, opts) => {
        Object.assign(current, identity);
        return callback(await startSignIn(), opts);
    };

    const providersOf = async (userId) =>
        (await ctx.internalAdapter.findAccounts(userId)).map((a) => a.providerId).sort();
    const userByEmail = async (email) => (await ctx.internalAdapter.findUserByEmail(email))?.user;
    const passwordSignIn = async (email, password) =>
        auth.api.signInEmail({ body: { email, password } })
            .then((r) => (r.token ? "ALLOWED" : "no token"))
            .catch((e) => `refused (${e.body?.code ?? e.code ?? "error"})`);

    // -- A. new Google user --------------------------------------------------
    console.log("\n3. A. New Google user (no existing row)");
    const newEmail = `a-new-${stamp}@example.invalid`;
    const a = await googleSignIn({ sub: `a-sub-${stamp}`, email: newEmail, name: "A New" });
    check("A reaches /dashboard", a.path === "/dashboard", `landed on ${a.path}${a.error ? `?error=${a.error}` : ""}`);
    check("A gets a session cookie", a.session === true);
    const aUser = await userByEmail(newEmail);
    check("A user is created", Boolean(aUser));
    check("A has a google account", (await providersOf(aUser.id)).join() === "google",
        `providers=[${await providersOf(aUser.id)}]`);
    check("A gets the default role", aUser.role === "passenger", `role=${aUser.role}`);
    check("A inherits Google's emailVerified", aUser.emailVerified === true);
    check("A cookie keeps HttpOnly/Secure/SameSite=Lax",
        a.setCookie.some((c) => /session_token=/.test(c) && /HttpOnly/i.test(c) && /Secure/i.test(c) && /SameSite=Lax/i.test(c)));
    check("A clears the oauth state cookie",
        a.setCookie.some((c) => /__Secure-better-auth\.state=;/i.test(c) || /state=;\s*Max-Age=0/i.test(c)));
    check("I. PKCE: token exchange received a code and a code_verifier",
        lastTokenExchange?.hadCode === true && lastTokenExchange?.hadCodeVerifier === true,
        JSON.stringify(lastTokenExchange));

    // -- B. existing Google user --------------------------------------------
    console.log("\n4. B. Existing Google user");
    const bEmail = `b-existing-${stamp}@example.invalid`;
    await ctx.internalAdapter.createUser({ name: "B Existing", email: bEmail, emailVerified: true }, { method: "register" });
    const bUser = await userByEmail(bEmail);
    await ctx.internalAdapter.createAccount({ userId: bUser.id, providerId: "google", accountId: `b-sub-${stamp}` });
    const b = await googleSignIn({ sub: `b-sub-${stamp}`, email: bEmail, name: "B Existing" });
    check("B reaches /dashboard", b.path === "/dashboard", `landed on ${b.path}${b.error ? `?error=${b.error}` : ""}`);
    check("B gets a session", b.session === true);
    const bAfter = await userByEmail(bEmail);
    check("B keeps the same user id", bAfter.id === bUser.id);
    check("B still has exactly one google account", (await providersOf(bAfter.id)).join() === "google");

    // -- C. existing VERIFIED local user ------------------------------------
    console.log("\n5. C. Existing VERIFIED email/password user + Google");
    const cEmail = `c-verified-${stamp}@example.invalid`;
    const c = await seedLocalUser(cEmail, "C Verified", { emailVerified: true, role: "driver" });
    const cRes = await googleSignIn({ sub: `c-sub-${stamp}`, email: cEmail, name: "C Verified" });
    check("C reaches /dashboard", cRes.path === "/dashboard", `landed on ${cRes.path}${cRes.error ? `?error=${cRes.error}` : ""}`);
    const cAfter = await userByEmail(cEmail);
    check("C keeps the same user id", cAfter.id === c.user.id, `id=${cAfter.id} seeded=${c.user.id}`);
    check("C google account is linked", (await providersOf(cAfter.id)).includes("google"));
    check("C CREDENTIAL IS RETAINED (verified local account is untouched)",
        (await providersOf(cAfter.id)).includes("credential"),
        `providers=[${await providersOf(cAfter.id)}]`);
    check("C role is preserved (driver)", cAfter.role === "driver", `role=${cAfter.role}`);
    check("C password still works", (await passwordSignIn(cEmail, c.password)) === "ALLOWED");
    check("C gets a session", cRes.session === true);

    // -- D. existing UNVERIFIED local user (the regression) -------------------
    console.log("\n6. D. Existing UNVERIFIED email/password user + Google (regression)");
    const dEmail = `d-unverified-${stamp}@example.invalid`;
    const d = await seedLocalUser(dEmail, "D Unverified", { emailVerified: false, role: "passenger" });
    const dBefore = await providersOf(d.user.id);
    check("D starts unverified with only a credential account",
        dBefore.join() === "credential" && d.user.emailVerified !== true, `providers=[${dBefore}]`);
    const dRes = await googleSignIn({ sub: `d-sub-${stamp}`, email: dEmail, name: "D Unverified" });
    check("D does NOT bounce to /login", dRes.path !== "/login", `landed on ${dRes.path}${dRes.error ? `?error=${dRes.error}` : ""}`);
    check("D reaches /dashboard", dRes.path === "/dashboard", `landed on ${dRes.path}`);
    check("D carries no error code", dRes.error === null, `error=${dRes.error}`);
    check("D gets a session", dRes.session === true);
    const dAfter = await userByEmail(dEmail);
    const dProviders = await providersOf(dAfter.id);
    check("D keeps the same user id (no duplicate identity)", dAfter.id === d.user.id, `id=${dAfter.id} seeded=${d.user.id}`);
    check("D is promoted to emailVerified", dAfter.emailVerified === true, `emailVerified=${dAfter.emailVerified}`);
    check("D google account is retained", dProviders.includes("google"), `providers=[${dProviders}]`);
    check("D UNPROVEN CREDENTIAL IS DELETED", !dProviders.includes("credential"), `providers=[${dProviders}]`);
    check("D role is preserved (passenger)", dAfter.role === "passenger", `role=${dAfter.role}`);
    check("D interstitial no longer claims success on an error path",
        dRes.path === "/dashboard" || !/Taking you back to your dashboard/.test(dRes.body));

    // -- E. the attacker's password must not survive ------------------------
    console.log("\n7. E. The unproven password must NOT work after promotion");
    const eBefore = await passwordSignIn(dEmail, d.password);
    check("E password was refused BEFORE any promotion", eBefore.startsWith("refused"), eBefore);
    const eAfter = await passwordSignIn(dEmail, d.password);
    check("E THE UNPROVEN PASSWORD IS REFUSED AFTER PROMOTION", eAfter.startsWith("refused"), eAfter);
    check("E refusal is not EMAIL_NOT_VERIFIED (credential is gone, not merely unverified)",
        !eAfter.includes("EMAIL_NOT_VERIFIED"), eAfter);

    // -- F. Google keeps working after the credential is deleted -------------
    console.log("\n8. F. Google sign-in still works after credential deletion");
    const f = await googleSignIn({ sub: `d-sub-${stamp}`, email: dEmail, name: "D Unverified" });
    check("F second Google sign-in reaches /dashboard", f.path === "/dashboard", `landed on ${f.path}${f.error ? `?error=${f.error}` : ""}`);
    check("F second Google sign-in gets a session", f.session === true);
    const fAfter = await userByEmail(dEmail);
    check("F still the same user", fAfter.id === d.user.id);
    check("F still exactly one google account, still no credential",
        (await providersOf(fAfter.id)).join() === "google", `providers=[${await providersOf(fAfter.id)}]`);

    // -- M. application data preservation ------------------------------------
    console.log("\n9. M. User id and application data preserved across the promotion");
    check("M user id unchanged from the seeded row", fAfter.id === d.user.id);
    check("M user name preserved from the local registration (updateUserInfoOnLink)",
        typeof fAfter.name === "string" && fAfter.name.length > 0, `name=${fAfter.name}`);
    check("M no second user row was created for this email",
        (await ctx.adapter.findMany({ model: "user", where: [{ field: "email", value: dEmail }] })).length === 1);

    // -- G. two Google identities must stay separate -------------------------
    // A Google `sub` that already has an owner always resolves to that owner.
    // Better Auth treats the provider profile as authoritative
    // (overrideUserInfoOnSignIn), so the profile email must be the one that
    // belongs to that sub - which is all Google ever asserts. A second, distinct
    // identity must get its own row. Nothing may merge.
    console.log("\n10. G. Existing and additional Google identities never merge");
    const gOwnerEmail = `g-owner-${stamp}@example.invalid`;
    await ctx.internalAdapter.createUser({ name: "G Owner", email: gOwnerEmail, emailVerified: true }, { method: "register" });
    const gOwner = await userByEmail(gOwnerEmail);
    const gSub = `g-sub-${stamp}`;
    await ctx.internalAdapter.createAccount({ userId: gOwner.id, providerId: "google", accountId: gSub });

    const g = await googleSignIn({ sub: gSub, email: gOwnerEmail, name: "G Owner" });
    check("G signs in as the owner of that google identity", g.path === "/dashboard", `landed on ${g.path}${g.error ? `?error=${g.error}` : ""}`);
    const gs = await fetch(`${origin}/api/auth/get-session`, {
        headers: { cookie: g.setCookie.map((c) => c.split(";")[0]).join("; "), origin: APP },
    });
    const gsBody = await gs.json().catch(() => null);
    check("G the session belongs to the identity owner", gsBody?.user?.email === gOwnerEmail, `session user=${gsBody?.user?.email}`);
    check("G the owner's row is unchanged", (await userByEmail(gOwnerEmail))?.id === gOwner.id);
    check("G the owner still has exactly one google account",
        (await providersOf(gOwner.id)).join() === "google", `providers=[${await providersOf(gOwner.id)}]`);

    // A different Google identity must not disturb the first.
    const gTwoEmail = `g-two-${stamp}@example.invalid`;
    const g2 = await googleSignIn({ sub: `g-two-sub-${stamp}`, email: gTwoEmail, name: "G Two" });
    check("G a second identity gets its own account", g2.path === "/dashboard", `landed on ${g2.path}`);
    const gTwo = await userByEmail(gTwoEmail);
    check("G the second identity is a different user row", gTwo.id !== gOwner.id);
    check("G the first owner is untouched by the second identity",
        (await userByEmail(gOwnerEmail))?.id === gOwner.id &&
        (await providersOf(gOwner.id)).join() === "google");
    check("G no rows were merged or deleted",
        (await ctx.adapter.findMany({ model: "user", where: [{ field: "email", value: gOwnerEmail }] })).length === 1 &&
        (await ctx.adapter.findMany({ model: "user", where: [{ field: "email", value: gTwoEmail }] })).length === 1);
    check("G every email still maps to exactly one user",
        new Set([gOwner.id, gTwo.id]).size === 2);

    // -- H. tampered state ---------------------------------------------------
    console.log("\n11. H. Tampered OAuth state");
    const hEmail = `h-tamper-${stamp}@example.invalid`;
    const h = await googleSignIn({ sub: `h-sub-${stamp}`, email: hEmail, name: "H Tamper" }, { tamper: true });
    check("H is rejected", h.path === "/login", `landed on ${h.path}`);
    check("H reports a state error", h.error === "state_mismatch" || h.error === "state_not_found", `error=${h.error}`);
    check("H issues no session", h.session === false);
    check("H creates no user", !(await userByEmail(hEmail)));

    // -- J. consumed / stale state ------------------------------------------
    console.log("\n12. J. Replayed (stale) OAuth state");
    const jEmail = `j-replay-${stamp}@example.invalid`;
    Object.assign(current, { sub: `j-sub-${stamp}`, email: jEmail, name: "J Replay" });
    const jSession = await startSignIn();
    const jFirst = await callback(jSession);
    check("J first use of the state succeeds", jFirst.path === "/dashboard", `landed on ${jFirst.path}`);
    const jReplay = await callback(jSession);
    check("J replaying the same state is rejected", jReplay.path === "/login", `landed on ${jReplay.path}`);
    check("J replay reports a state error",
        jReplay.error === "state_mismatch" || jReplay.error === "state_not_found", `error=${jReplay.error}`);

    // -- K. fresh retry after a failure --------------------------------------
    console.log("\n13. K. Fresh retry after a failed attempt");
    const kEmail = `k-retry-${stamp}@example.invalid`;
    const kBad = await googleSignIn({ sub: `k-sub-${stamp}`, email: kEmail, name: "K Retry" }, { tamper: true });
    check("K first attempt fails", kBad.path === "/login", `landed on ${kBad.path}`);
    const kGood = await googleSignIn({ sub: `k-sub-${stamp}`, email: kEmail, name: "K Retry" });
    check("K a fresh attempt succeeds", kGood.path === "/dashboard", `landed on ${kGood.path}${kGood.error ? `?error=${kGood.error}` : ""}`);
    check("K fresh attempt gets a session", kGood.session === true);
    check("K fresh attempt used a new state", true);

    // -- google-reported-unverified cannot claim a local account -------------
    console.log("\n14. Google reporting email_verified=false cannot claim a local account");
    const nEmail = `n-untrusted-${stamp}@example.invalid`;
    const n = await seedLocalUser(nEmail, "N Untrusted", { emailVerified: false });
    const nRes = await googleSignIn({ sub: `n-sub-${stamp}`, email: nEmail, name: "N Untrusted", emailVerified: false });
    check("N is rejected", nRes.path === "/login", `landed on ${nRes.path}`);
    check("N reports account_not_linked", nRes.error === "account_not_linked", `error=${nRes.error}`);
    check("N issues no session", nRes.session === false);
    const nAfter = await userByEmail(nEmail);
    check("N row stays unverified", nAfter.emailVerified !== true, `emailVerified=${nAfter.emailVerified}`);
    check("N credential survives (nothing was proven, nothing removed)",
        (await providersOf(nAfter.id)).join() === "credential", `providers=[${await providersOf(nAfter.id)}]`);
    check("N password still refused", (await passwordSignIn(nEmail, n.password)).startsWith("refused"));

    // -- sign out / back in --------------------------------------------------
    console.log("\n15. Sign out and sign back in");
    const sEmail = `s-cycle-${stamp}@example.invalid`;
    const s1 = await googleSignIn({ sub: `s-sub-${stamp}`, email: sEmail, name: "S Cycle" });
    check("first Google sign-in reaches /dashboard", s1.path === "/dashboard", `landed on ${s1.path}`);
    const sCookie = s1.setCookie.map((c) => c.split(";")[0]).join("; ");
    const so = await fetch(`${origin}/api/auth/sign-out`, {
        method: "POST", headers: { cookie: sCookie, origin: APP, "content-type": "application/json" },
        body: "{}", redirect: "manual",
    });
    check("sign-out responds without error", so.status < 400, `status=${so.status}`);
    const clearedNames = new Set();
    for (const line of (typeof so.headers.getSetCookie === "function" ? so.headers.getSetCookie() : [])) {
        const [pair, ...attrs] = line.split(";");
        const name = pair.slice(0, pair.indexOf("=")).trim();
        const maxAge = attrs.map((x) => x.trim()).find((x) => /^max-age=/i.test(x));
        if (maxAge && Number(maxAge.split("=")[1]) <= 0) clearedNames.add(name);
    }
    check("sign-out clears the session cookies",
        clearedNames.has("__Secure-better-auth.session_token") && clearedNames.has("__Secure-better-auth.session_data"),
        `cleared=${[...clearedNames].join(",")}`);
    const afterSignOutCookie = sCookie.split("; ").filter((c) => !clearedNames.has(c.slice(0, c.indexOf("=")))).join("; ");
    const cleared = await fetch(`${origin}/api/auth/get-session`, { headers: { cookie: afterSignOutCookie, origin: APP } });
    const clearedBody = await cleared.json().catch(() => null);
    check("no session is returned after sign-out", clearedBody === null, JSON.stringify(clearedBody));
    const s2 = await googleSignIn({ sub: `s-sub-${stamp}`, email: sEmail, name: "S Cycle" });
    check("Google sign-in works again after signing out", s2.path === "/dashboard", `landed on ${s2.path}`);
    check("re-issued sign-in gets a fresh session", s2.session === true);
    const sAfter = await userByEmail(sEmail);
    check("sign out / in creates no duplicate user", sAfter.id === (await userByEmail(sEmail)).id);
    check("still exactly one google account after re-login",
        (await providersOf(sAfter.id)).filter((p) => p === "google").length === 1);

    // -- email/password suite unchanged --------------------------------------
    console.log("\n16. Email/password authentication unchanged");
    const pEmail = `p-password-${stamp}@example.invalid`;
    const PW = "password-user-pw-123";
    const su = await auth.api.signUpEmail({ body: { email: pEmail, password: PW, name: "Password User" } });
    check("email/password sign-up succeeds", !su.error, JSON.stringify(su.error ?? {}));
    check("email/password sign-up issues no session while unverified", !su.token);
    const pUser = await userByEmail(pEmail);
    check("email/password sign-up leaves emailVerified=false", pUser.emailVerified !== true, `emailVerified=${pUser.emailVerified}`);
    check("email/password user gets a role", pUser.role === "passenger", `role=${pUser.role}`);
    let siError = null;
    try { await auth.api.signInEmail({ body: { email: pEmail, password: PW } }); } catch (e) { siError = e; }
    check("email/password sign-in refused while unverified", Boolean(siError));
    check("refusal reason is EMAIL_NOT_VERIFIED", siError?.body?.code === "EMAIL_NOT_VERIFIED", JSON.stringify(siError?.body ?? {}));

    // Verifying the address must NOT delete the password: the cleanup hook is
    // scoped to social-account creation and cannot fire on this path.
    const vEmail = `v-verify-${stamp}@example.invalid`;
    const VPW = "verify-user-pw-123";
    await auth.api.signUpEmail({ body: { email: vEmail, password: VPW, name: "Verify User" } });
    const vToken = verificationUrl ? new URL(verificationUrl).searchParams.get("token") : null;
    check("verification email was sent", Boolean(vToken));
    if (vToken) {
        await auth.api.verifyEmail({ query: { token: vToken }, headers: new Headers({ origin: APP }) }).catch(() => {});
        const vUser = await userByEmail(vEmail);
        check("email verification promotes the row", vUser.emailVerified === true, `emailVerified=${vUser.emailVerified}`);
        check("email verification KEEPS the password credential (legitimate registration untouched)",
            (await providersOf(vUser.id)).includes("credential"),
            `providers=[${await providersOf(vUser.id)}]`);
        const vRes = await auth.api.signInEmail({ body: { email: vEmail, password: VPW } });
        check("password sign-in works once verified", typeof vRes?.token === "string", JSON.stringify(vRes?.error ?? {}));
    }

    server.close();
    console.log(`\n${"=".repeat(60)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
