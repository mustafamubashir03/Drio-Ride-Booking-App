import express from 'express';
import cors from 'cors';
import { authConfig } from './config/auth.config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { appErrorHandler, genericErrorHandler } from './middlewares/error.middleware';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import { logForwardedClientIpMiddleware } from './middlewares/client-ip.middleware';
import placesRouter from './routers/v1/places.router';
import routesRouter from './routers/routes.router';
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./lib/auth";



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

app.get("/", (_req, res) => {
    res.json({
        service: "drio-server",
        runtime: process.env.VERCEL ? "vercel-function" : "node-server",
    });
});

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

export default app;
