import express from 'express';
import cors from 'cors';
import { authConfig } from './config/auth.config';
import v1Router from './routers/v1/index.router';
import v2Router from './routers/v2/index.router';
import { appErrorHandler, genericErrorHandler } from './middlewares/error.middleware';
import { authRedirectFallbackMiddleware } from './middlewares/auth-redirect-fallback.middleware';
import { attachCorrelationIdMiddleware } from './middlewares/correlation.middleware';
import { logForwardedClientIpMiddleware } from './middlewares/client-ip.middleware';
import placesRouter from './routers/v1/places.router';
import routesRouter from './routers/routes.router';
import { maybeRunSearchSweep } from './services/driver-search.service';
import type { toNodeHandler as toNodeHandlerFactory } from "better-auth/node" with { "resolution-mode": "import" };
import { getAuth, client } from "./lib/auth";



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
// better-auth/node is ESM-only, so the handler is resolved on first use rather
// than at import time. initAuth() has already run by then: both entrypoints await
// it before the app starts serving, and a failure here is forwarded to the error
// handlers below rather than thrown at require time.
type AuthNodeHandler = ReturnType<typeof toNodeHandlerFactory>;

let authNodeHandler: AuthNodeHandler | undefined;

const resolveAuthNodeHandler = async (): Promise<AuthNodeHandler> => {
    if (!authNodeHandler) {
        const { toNodeHandler } = await import("better-auth/node");
        authNodeHandler = toNodeHandler(getAuth());
    }
    return authNodeHandler;
};

// TEMPORARY: Render's static-site edge rewrites a browser-facing auth redirect
// to a bodyless 200 on top-level navigations, which leaves the user on a blank
// page. This carries the same redirect in the body so the navigation still
// lands on its target, with Better Auth's Set-Cookie headers untouched.
// Mounted before the auth handler and scoped by the middleware to
// GET /api/auth/callback/* and GET /api/auth/verify-email only.
// Remove together with auth-redirect-fallback.middleware.ts and redirect-document.ts.
app.use(authRedirectFallbackMiddleware);

app.all("/api/auth/{*splat}", (req, res, next) => {
    resolveAuthNodeHandler()
        .then((handler) => handler(req, res))
        .catch(next);
});

app.use(express.json());

app.use(attachCorrelationIdMiddleware);

/**
 * Drive the search sweep from real traffic as well as from the sweeper interval.
 *
 * Search correctness does not depend on this (the ladder is derived from booking
 * age), but it makes progression prompt and guarantees terminal resolution even
 * if the Render sweeper is frozen by the platform: the passenger polls its
 * bookings every few seconds while searching, so that polling is a reliable
 * heartbeat.
 *
 * NOTE the path matching: this middleware is mounted at the app root, so
 * `req.path` is the FULL path (`/api/v1/passenger/bookings`), not the path
 * relative to the v1 router. The previous version compared against
 * "/passenger" and therefore never matched anything - the traffic trigger was
 * dead code and every search depended solely on the Render interval.
 *
 * Deliberately not awaited: dispatch latency must never depend on a sweep.
 */
app.use((req, res, next) => {
    if (/^\/api\/v\d\/(passenger|driver)(\/|$)/.test(req.path)) {
        void maybeRunSearchSweep(`traffic:${req.method}`);
    }
    next();
});

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
