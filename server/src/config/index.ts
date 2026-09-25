import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number
    SOCKET_SERVER_URL: string
}

function loadEnv() {
    dotenv.config();
    console.log(`Environment variables loaded`);
}

loadEnv();

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT) || 3000,
    SOCKET_SERVER_URL: (process.env.SOCKET_SERVER_URL?.trim() || "http://localhost:5001").replace(/\/+$/, ""),
};