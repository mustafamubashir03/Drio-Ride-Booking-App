import express from 'express';
import { serverConfig } from './config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { appErrorHandler, genericErrorHandler } from './middlewares/error.middleware';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import http from 'http'
import { Server } from 'socket.io';
import { initSocket } from './socket';
import cors from 'cors';
import { connectRedis, disconnectRedis } from './lib/redis';

const app = express();
app.use(express.json())
app.use(cors())

/**
 * Registering all the routers and their corresponding routes with out app server object.
 */

app.use(attachCorrelationIdMiddleware);
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);


/**
 * Add the error handler middleware
 */

app.use(appErrorHandler);
app.use(genericErrorHandler);

// HTTP API server
const httpServer = http.createServer(app)

// Socket.IO server
const socketServer = http.createServer(app)
export const io = new Server(socketServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
})

initSocket(io)

async function start() {
    // Connect to Redis first
    await connectRedis();
    console.log("Redis connected");

    // Start HTTP API server
    const PORT = serverConfig.PORT || 3001;
    const SOCKET_PORT = serverConfig.SOCKET_PORT || 3002;

    httpServer.listen({ port: PORT, host: '0.0.0.0', reuseAddr: true }, () => {
        console.log(`HTTP API Server is running on http://localhost:${PORT}`)
    })

    httpServer.on('error', (err: Error) => {
        console.error(`HTTP Server error:`, err)
    })

    socketServer.listen({ port: SOCKET_PORT, host: '0.0.0.0', reuseAddr: true }, () => {
        console.log(`Socket.IO Server is running on http://localhost:${SOCKET_PORT}`)
    })

    socketServer.on('error', (err: Error) => {
        console.error(`Socket Server error:`, err)
    })
}

start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
})

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[socket-server] Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        console.error("[socket-server] Graceful shutdown timed out, forcing exit.");
        process.exit(1);
    }, 5000);
    forceExit.unref();

    (async () => {
        try {
            await disconnectRedis();
        } catch (err) {
            console.error("[socket-server] Failed to disconnect Redis during shutdown:", err);
        }
        // Close Socket.IO first (also closes its underlying HTTP server), then the HTTP API server.
        io.close();
        const closeHttp = new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        const closeSocket = new Promise<void>((resolve) => {
            socketServer.close(() => resolve());
        });
        Promise.all([closeHttp, closeSocket]).then(() => {
            console.log("[socket-server] HTTP + Socket servers closed.");
            clearTimeout(forceExit);
            process.exit(0);
        });
    })();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// SIGUSR2: parent (nodemon) notifies us on restart/'rs'.
process.on('SIGUSR2', shutdown);