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

const defaultTrustedOrigins: string[] = [];

const parseTrustedOrigins = (value: string | undefined) =>
    value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];

const configuredTrustedOrigins = Array.from(new Set([
    ...parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    ...parseTrustedOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
]));

const isLoopbackHost = (hostname: string) =>
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127\./.test(hostname);

const normalizeBaseUrl = (value: string) => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Better Auth base URL must be a valid absolute URL");
    }

    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if (
        !isHttp ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new Error("Better Auth base URL must contain only an origin");
    }

    return url.origin;
};

const configuredBetterAuthUrl = process.env.BETTER_AUTH_URL?.trim();
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
const isProduction = process.env.NODE_ENV === "production";

const betterAuthUrl = (() => {
    if (!isProduction) {
        if (!configuredBetterAuthUrl) {
            throw new Error("BETTER_AUTH_URL is required");
        }
        return normalizeBaseUrl(configuredBetterAuthUrl);
    }

    const productionUrl = [configuredBetterAuthUrl, renderExternalUrl]
        .filter((value): value is string => Boolean(value))
        .find((value) => {
            try {
                const url = new URL(value);
                return url.protocol === "https:" && !isLoopbackHost(url.hostname);
            } catch {
                return false;
            }
        });

    if (!productionUrl) {
        throw new Error("A valid HTTPS BETTER_AUTH_URL or RENDER_EXTERNAL_URL is required in production");
    }

    return normalizeBaseUrl(productionUrl);
})();

export const authConfig: AuthConfig = {
    betterAuthUrl,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    trustedOrigins: configuredTrustedOrigins.length > 0
        ? Array.from(new Set([betterAuthUrl, ...configuredTrustedOrigins]))
        : [betterAuthUrl, ...defaultTrustedOrigins],
    disableEmailVerification:
        process.env.DRIO_DISABLE_EMAIL_VERIFICATION === "true" ||
        process.env.DISABLE_EMAIL_VERIFICATION === "true",
};
