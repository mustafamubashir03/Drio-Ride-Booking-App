import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number,
    SOCKET_PORT: number,
    MAIN_API_URL: string
}

function loadEnv() {
    dotenv.config();
    console.log(`Environment variables loaded`);
}

loadEnv();

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT) || 5001,
    SOCKET_PORT: Number(process.env.SOCKET_PORT) || 5002,
    MAIN_API_URL: process.env.MAIN_API_URL || "http://localhost:3000",
};