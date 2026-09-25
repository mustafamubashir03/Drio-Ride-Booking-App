import type { IncomingMessage, ServerResponse } from 'http';
import app from './app';
import logger from './config/logger.config';
import { connectDB, initAuth } from "./lib/auth";
import { connectMongoose } from "./lib/mongoose";
import { seedRbac } from "./lib/rbac.seed";
import { connectRedis } from "./lib/redis";

// Vercel function entrypoint: the same Express app that src/server.ts serves
// through app.listen(), wrapped in a per-instance lazy bootstrap. Render keeps
// node dist/server.js; Vercel keeps this file (compiled to dist/vercel.js and
// re-exported from api/index.js).
//
// Deliberately absent here, because they belong to the long-lived process:
//   - app.listen()               -> Vercel owns the HTTP listener
//   - startDriverSearchSweeper()  -> a per-invocation interval would multiply;
//                                     the Render web service still owns this job
//   - SIGINT/SIGTERM shutdown     -> instances are recycled, not signalled
let bootstrap: Promise<void> | undefined;

const ensureReady = () => {
    if (!bootstrap) {
        bootstrap = (async () => {
            await initAuth();
            await connectDB();
            await connectMongoose();
            await connectRedis();
            await seedRbac();
        })().catch((err) => {
            // Drop the cached rejection so a later cold invocation can retry
            // instead of replaying the failure for the life of the instance.
            bootstrap = undefined;
            throw err;
        });
    }
    return bootstrap;
};

const handler = async (req: IncomingMessage, res: ServerResponse) => {
    try {
        await ensureReady();
    } catch (err) {
        logger.error("Vercel function bootstrap failed", { error: (err as Error).message });
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, message: "Service Unavailable" }));
        return;
    }

    app(req, res);
};

export default handler;
