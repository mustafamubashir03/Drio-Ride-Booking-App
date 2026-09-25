import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins";
import { getMongo } from "../utils/db/getMongo";
import { authConfig } from "../config/auth.config";
import logger from "../config/logger.config";
import { sendMail } from "./mailer";
import { accessControl, defaultRoles, DEFAULT_ROLE, ADMIN_ROLES } from "./rbac";

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

export const auth = betterAuth({
    baseURL: authConfig.betterAuthUrl,
    trustedOrigins: authConfig.trustedOrigins,
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
            ac: accessControl,
            roles: defaultRoles,
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