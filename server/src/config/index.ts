import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number,
    SOCKET_PORT: number
}

function loadEnv() {
    dotenv.config();
    console.log(`Environment variables loaded`);
}

loadEnv();

export const serverConfig: ServerConfig = {
    PORT: Number(process.env.PORT) || 3000,
    SOCKET_PORT: Number(process.env.SOCKET_PORT) || 3001,
};