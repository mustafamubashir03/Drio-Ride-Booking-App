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
app.use(cors({ origin: serverConfig.TRUSTED_ORIGINS, credentials: true }))

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

// Socket.IO is attached to the API server unless a distinct SOCKET_PORT is configured
const socketServer: http.Server | null = serverConfig.SPLIT_SOCKET_SERVER
    ? http.createServer(app)
    : null;

const ioTarget = socketServer ?? httpServer;

export const io = new Server(ioTarget, {
  cors: {
    origin: serverConfig.TRUSTED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
})

initSocket(io)

function listen(server: http.Server, port: number, label: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
            server.removeListener('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            console.log(`${label} listening on port ${port}`);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen({ port, host: serverConfig.BIND_HOST, reuseAddr: true });
    });
}

function closeServer(server: http.Server | null): Promise<void> {
    if (!server || !server.listening) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
}

async function start() {
    // Connect to Redis first
    await connectRedis();
    console.log("Redis connected");

    const { PORT, SOCKET_PORT, SPLIT_SOCKET_SERVER } = serverConfig;

    await listen(httpServer, PORT, 'HTTP API server');

    if (SPLIT_SOCKET_SERVER && socketServer && SOCKET_PORT) {
        await listen(socketServer, SOCKET_PORT, 'Socket.IO server');
    } else {
        console.log(`Socket.IO attached to HTTP API server on port ${PORT}`);
    }
}

start().catch((err) => {
    console.error("Failed to start server:", err);
    disconnectRedis().catch(() => undefined);
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
        // Close Socket.IO first (it also closes the HTTP server it is attached to), then the API server.
        io.close();
        await Promise.all([closeServer(httpServer), closeServer(socketServer)]);
        if (serverConfig.SPLIT_SOCKET_SERVER) {
            console.log("[socket-server] HTTP + Socket servers closed.");
        } else {
            console.log("[socket-server] HTTP server closed.");
        }
        clearTimeout(forceExit);
        process.exit(0);
    })();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// SIGUSR2: parent (nodemon) notifies us on restart/'rs'.
process.on('SIGUSR2', shutdown);
