import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number,
    SOCKET_PORT: number,
    MAIN_API_URL: string,
    BIND_HOST: string,
    TRUSTED_ORIGINS: string[],
}

function loadEnv() {
    dotenv.config();
    console.log(`Environment variables loaded`);
}

const parseOrigins = (value: string | undefined) =>
    value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];

const defaultTrustedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
];

loadEnv();

const configuredOrigins = parseOrigins(
    process.env.TRUSTED_ORIGINS ||
    process.env.SOCKET_TRUSTED_ORIGINS ||
    process.env.BETTER_AUTH_TRUSTED_ORIGINS,
);

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT) || 5001,
    SOCKET_PORT: Number(process.env.SOCKET_PORT) || 5002,
    MAIN_API_URL: process.env.MAIN_API_URL || "http://localhost:3000",
    BIND_HOST: process.env.BIND_HOST || "0.0.0.0",
    TRUSTED_ORIGINS: configuredOrigins.length > 0
        ? configuredOrigins
        : defaultTrustedOrigins,
};
