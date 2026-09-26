import { MongoClient } from "mongodb";
import { getMongo } from "../utils/db/getMongo";
import { authConfig } from "../config/auth.config";
import logger from "../config/logger.config";
import { sendMail } from "./mailer";
import { initRbac, getAccessControl, getDefaultRoles, DEFAULT_ROLE, ADMIN_ROLES } from "./rbac";

const mongoURL = getMongo();

export const client = new MongoClient(mongoURL as string);

export async function connectDB() {
    try {
        await client.connect();
        logger.info("Connected to MongoDB");
        const db = client.db();
        const collections = await db.listCollections().toArray();
        logger.info(`MongoDB collections: ${collections.map(c => c.name).join(", ") || "(none yet)"}`);
        const [users, sessions, accounts] = await Promise.all([
            db.collection("user").countDocuments(),
            db.collection("session").countDocuments(),
            db.collection("account").countDocuments(),
        ]);
        logger.info("Better Auth MongoDB records", { users, sessions, accounts });
    } catch (err) {
        logger.error("Failed to connect to MongoDB", { error: (err as Error).message });
        throw err;
    }
}

const db = client.db();

// better-auth publishes ESM only (dist/index.mjs), so requiring it from this
// CommonJS build throws ERR_REQUIRE_ESM on runtimes without require(esm). Its
// entrypoints are reached through native dynamic imports instead, which means
// the instance is built by initAuth() rather than at import time. Both
// entrypoints await initAuth() during bootstrap, before any request is served.
async function buildAuth() {
    const [{ betterAuth }, { mongodbAdapter }, { createAccessControl, admin }] = await Promise.all([
        import("better-auth"),
        import("better-auth/adapters/mongodb"),
        import("better-auth/plugins"),
    ]);

    initRbac(createAccessControl);

    return betterAuth({
        baseURL: authConfig.betterAuthUrl,
        trustedOrigins: authConfig.trustedOrigins,
        onAPIError: {
            // Auth failures (expired or mismatched OAuth state, cancelled
            // consent, unverified email) used to land on "/?error=...", which
            // the SPA immediately redirected to /dashboard and then /login,
            // discarding the reason and leaving the user on a blank-feeling
            // page. Send them to the login route with the code preserved so
            // the UI can explain what happened. Derived from BETTER_AUTH_URL,
            // which is already the frontend origin for this deployment.
            errorURL: `${authConfig.betterAuthUrl.replace(/\/+$/, "")}/login`,
            // Fallback only, used if errorURL is ever absent. The stock page
            // references a --background variable it never defines and carries
            // no branding, so a failure could render as an empty dark page.
            // These are the existing Drio tokens; no new palette is introduced.
            customizeDefaultErrorPage: {
                colors: {
                    background: "#282828",
                    foreground: "#e6e6e6",
                    primary: "#e5bd97",
                    primaryForeground: "#282828",
                    mutedForeground: "#b2b2b2",
                    border: "rgba(255, 255, 255, 0.08)",
                    destructive: "#f87171",
                    gridColor: "rgba(255, 255, 255, 0.05)",
                    cardBackground: "#3b3b3b",
                    cornerBorder: "rgba(255, 255, 255, 0.08)",
                },
                font: {
                    defaultFamily:
                        "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                },
            },
        },
        database: mongodbAdapter(db, {
            client,
        }),
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 8,
            requireEmailVerification: !authConfig.disableEmailVerification,
            // Only takes effect when email verification is off: with verification
            // required Better Auth never issues a session at sign-up.
            autoSignIn: true,
        },
        emailVerification: {
            sendOnSignUp: !authConfig.disableEmailVerification,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
                await sendMail({
                    to: user.email,
                    subject: "Verify your Drio email",
                    html: `
                        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#1a1a1c;border-radius:16px;color:#f0ece6">
                            <p style="font-family:Georgia,serif;font-size:28px;font-weight:700;margin:0 0 16px">Drio</p>
                            <h1 style="font-size:20px;margin:0 0 8px">Verify your email address</h1>
                            <p style="font-size:14px;color:#a1a1a6;line-height:1.6;margin:0 0 24px">
                                Thanks for joining Drio. Confirm this is your email to start booking premium rides.
                            </p>
                            <a href="${url}" style="display:inline-block;background:#d4a574;color:#1a1a1c;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;font-size:14px">
                                Verify email
                            </a>
                            <p style="font-size:12px;color:#8a8680;line-height:1.5;margin-top:24px">
                                If the button doesn't work, open this link:<br/>
                                <span style="color:#d4a574;word-break:break-all">${url}</span>
                            </p>
                        </div>
                    `,
                });
                logger.info("Verification email sent", { email: user.email });
            },
        },
        account: {
            accountLinking: {
                updateUserInfoOnLink: true,
            },
        },
        socialProviders: {
            google: {
                clientId: authConfig.googleClientId,
                clientSecret: authConfig.googleClientSecret,
                accessType: "offline",
                prompt: "select_account consent",
                overrideUserInfoOnSignIn: true,
            },
        },
        plugins: [
            admin({
                defaultRole: DEFAULT_ROLE,
                adminRoles: ADMIN_ROLES,
                ac: getAccessControl(),
                roles: getDefaultRoles(),
            }),
        ],
        session: {
            cookieCache: {
                enabled: true,
                maxAge: 60 * 5, // 5 minutes
                strategy: "jwt",
            },
        },
        advanced: {
            defaultCookieAttributes: {
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
            },
        },
    });
}

type AuthInstance = Awaited<ReturnType<typeof buildAuth>>;

let authInstance: AuthInstance | undefined;

export const getAuth = (): AuthInstance => {
    if (!authInstance) {
        throw new Error("Better Auth is not initialized: await initAuth() before using auth");
    }
    return authInstance;
};

export async function initAuth(): Promise<AuthInstance> {
    if (authInstance) return authInstance;

    authInstance = await buildAuth();

    logger.info("Better Auth initialized", { baseURL: authConfig.betterAuthUrl });

    return authInstance;
}
