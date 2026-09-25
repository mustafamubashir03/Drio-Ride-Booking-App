import express from 'express';
import cors from 'cors';
import { serverConfig } from './config';
import { authConfig } from './config/auth.config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { appErrorHandler, genericErrorHandler } from './middlewares/error.middleware';
import logger from './config/logger.config';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import { logForwardedClientIpMiddleware } from './middlewares/client-ip.middleware';
import placesRouter from './routers/v1/places.router';
import routesRouter from './routers/routes.router';
import { toNodeHandler } from "better-auth/node";
import { auth, connectDB, client } from "./lib/auth";
import { connectMongoose } from "./lib/mongoose";
import { seedRbac } from "./lib/rbac.seed";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { SEARCH_SWEEP_INTERVAL_MS } from "./config/search.config";
import { startDriverSearchSweeper } from "./services/driver-search.service";
import http from 'http';



const app = express();


const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) return true;
    return authConfig.trustedOrigins.some((trustedOrigin) => {
        if (!trustedOrigin.includes("*")) return trustedOrigin === origin;
        const [prefix, suffix] = trustedOrigin.split("*", 2);
        return origin.startsWith(prefix) && origin.endsWith(suffix);
    });
};

app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Log the shape of the forwarded-IP chain before Better Auth rate limiting so
// a shared fallback bucket can be traced to the exact proxy hops.
app.use(logForwardedClientIpMiddleware);

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
    await connectRedis();
    await seedRbac();
    // Periodic driver-search cycle: widens the dispatch radius as bookings
    // age and expires any that run out of search budget (no_driver_found).
    searchSweeper = startDriverSearchSweeper(SEARCH_SWEEP_INTERVAL_MS);
    // Capture the http.Server so we can close it gracefully on shutdown.
    server = app.listen(serverConfig.PORT, "0.0.0.0", () => {
        logger.info(`Server is running on port ${serverConfig.PORT}`);
        logger.info(`Press Ctrl+C to stop the server.`);
    });
}).catch((err) => {
    logger.error("Failed to start server", { error: (err as Error).message });
    process.exit(1);
});

let server: http.Server | undefined;
let searchSweeper: NodeJS.Timeout | undefined;
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
        logger.error("Graceful shutdown timed out, forcing exit.");
        process.exit(1);
    }, 5000);
    forceExit.unref();

    (async () => {
        try {
            await disconnectRedis();
        } catch (err) {
            logger.error("Failed to disconnect Redis during shutdown", { error: (err as Error).message });
        }
        if (server) {
            server.close(() => {
                logger.info("HTTP server closed.");
                if (searchSweeper) clearInterval(searchSweeper);
                clearTimeout(forceExit);
                process.exit(0);
            });
        } else {
            clearTimeout(forceExit);
            process.exit(0);
        }
    })();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// SIGUSR2: parent (nodemon) notifies us on restart/'rs'.
process.on('SIGUSR2', shutdown);