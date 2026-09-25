import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number,
    SOCKET_PORT?: number,
    SPLIT_SOCKET_SERVER: boolean,
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

const parsePort = (value: string | undefined) => {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return undefined;
    return parsed;
};

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

const port = parsePort(process.env.PORT) ?? 5001;
const socketPort = parsePort(process.env.SOCKET_PORT);
const splitSocketServer = socketPort !== undefined && socketPort !== port;

export const serverConfig: ServerConfig = {
    PORT: port,
    SOCKET_PORT: splitSocketServer ? socketPort : undefined,
    SPLIT_SOCKET_SERVER: splitSocketServer,
    MAIN_API_URL: process.env.MAIN_API_URL || "http://localhost:3000",
    BIND_HOST: process.env.BIND_HOST || "0.0.0.0",
    TRUSTED_ORIGINS: configuredOrigins.length > 0
        ? configuredOrigins
        : defaultTrustedOrigins,
};
