import dotenv from "dotenv";

dotenv.config();

type AuthConfig = {
    betterAuthUrl: string
    betterAuthSecret: string
    googleClientId: string
    googleClientSecret: string
    trustedOrigins: string[]
}

const defaultTrustedOrigins = [
    "http://localhost:*",
    "http://127.0.0.1:*",
];

export const authConfig: AuthConfig = {
    betterAuthUrl: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    betterAuthSecret: process.env.BETTER_AUTH_SECRET || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
        ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
        : defaultTrustedOrigins,
}