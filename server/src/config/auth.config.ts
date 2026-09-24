import dotenv from "dotenv";

dotenv.config();

type AuthConfig = {
    betterAuthUrl: string;
    betterAuthSecret: string;
    googleClientId: string;
    googleClientSecret: string;
    trustedOrigins: string[];
    disableEmailVerification: boolean;
};

const defaultTrustedOrigins = [
    "http://localhost:*",
    "http://127.0.0.1:*",
];

const parseTrustedOrigins = (value: string | undefined) =>
    value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];

const configuredTrustedOrigins = parseTrustedOrigins(
    process.env.BETTER_AUTH_TRUSTED_ORIGINS || process.env.TRUSTED_ORIGINS,
);

export const authConfig: AuthConfig = {
    betterAuthUrl: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    betterAuthSecret: process.env.BETTER_AUTH_SECRET || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    trustedOrigins: configuredTrustedOrigins.length > 0
        ? configuredTrustedOrigins
        : defaultTrustedOrigins,
    disableEmailVerification:
        process.env.NODE_ENV !== "production" &&
        (process.env.DRIO_DISABLE_EMAIL_VERIFICATION === "true" ||
            process.env.DISABLE_EMAIL_VERIFICATION === "true"),
};
