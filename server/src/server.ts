import express from 'express';
import cors from 'cors';
import { serverConfig } from './config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { appErrorHandler, genericErrorHandler } from './middlewares/error.middleware';
import logger from './config/logger.config';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import placesRouter from './routers/v1/places.router';
import routesRouter from './routers/routes.router';
import { toNodeHandler } from "better-auth/node";
import { auth, connectDB, client } from "./lib/auth";
import { connectMongoose } from "./lib/mongoose";
import { seedRbac } from "./lib/rbac.seed";
import { Server } from 'socket.io';
import http from 'http'
import { initSocket } from './utils/sockets/socket';

const app = express();
const server = http.createServer(app)
const io = new Server(server)

const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
    origin(origin, callback) {
        if (!origin || localhostOrigin.test(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Better Auth must be mounted before express.json() so it can parse its own body.
app.all("/api/auth/{*splat}", toNodeHandler(auth));

app.use(express.json());

app.use(attachCorrelationIdMiddleware);
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);
app.use('/api/places', placesRouter);
app.use('/api/routes', routesRouter);

app.get("/api/health/auth", async (_req, res) => {
    try {
        const mongodb = client.db();
        const users = await mongodb.collection("user").countDocuments();
        const sessions = await mongodb.collection("session").countDocuments();
        const accounts = await mongodb.collection("account").countDocuments();
        res.json({
            status: "ok",
            collections: {
                users,
                sessions,
                accounts,
            },
        });
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: (err as Error).message,
        });
    }
});

app.use(appErrorHandler);
app.use(genericErrorHandler);

connectDB().then(async () => {
    await connectMongoose();
    await seedRbac();
    app.listen(serverConfig.PORT, () => {
        logger.info(`Server is running on http://localhost:${serverConfig.PORT}`);
        logger.info(`Press Ctrl+C to stop the server.`);
    });
    server.listen(serverConfig.SOCKET_PORT, () => {
        logger.info(`Socket server is running on http://localhost:${serverConfig.SOCKET_PORT}`)
    })
    initSocket(io)
}).catch((err) => {
    logger.error("Failed to start server", { error: (err as Error).message });
    process.exit(1);
});