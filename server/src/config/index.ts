import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number
    SOCKET_SERVER_URL: string
    SOCKET_BRIDGE_SECRET: string
}

function loadEnv() {
    dotenv.config();
    console.log(`Environment variables loaded`);
}

loadEnv();

const requireUrl = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value.replace(/\/+$/, "");
};

const socketBridgeSecret = process.env.SOCKET_BRIDGE_SECRET?.trim() || "";
if (process.env.NODE_ENV === "production" && !socketBridgeSecret) {
    throw new Error("SOCKET_BRIDGE_SECRET is required in production");
}

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT) || 3000,
    SOCKET_SERVER_URL: requireUrl("SOCKET_SERVER_URL"),
    SOCKET_BRIDGE_SECRET: socketBridgeSecret,
};