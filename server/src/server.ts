import app from './app';
import { serverConfig } from './config';
import logger from './config/logger.config';
import { connectDB, initAuth } from "./lib/auth";
import { connectMongoose } from "./lib/mongoose";
import { seedRbac } from "./lib/rbac.seed";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { SEARCH_SWEEP_INTERVAL_MS } from "./config/search.config";
import { startDriverSearchSweeper } from "./services/driver-search.service";
import http from 'http';



connectDB().then(async () => {
    await initAuth();
    await connectMongoose();
    await connectRedis();
    await seedRbac();
    // Periodic driver-search cycle: widens the dispatch radius as bookings
    // age and expires any that run out of search budget (no_driver_found).
    searchSweeper = startDriverSearchSweeper(SEARCH_SWEEP_INTERVAL_MS);

    // Surfaced by /api/v1/ping/diagnostics. A booking that expires long after
    // its search budget means this interval stopped running for a while (a
    // sleeping instance, a restart, a crash), so the boot time of the process
    // that owns the sweeper is the first thing to check.
    process.env.SWEEPER_ROLE = "api+sweeper";
    process.env.SWEEPER_STARTED_AT = new Date().toISOString();
    process.env.SWEEPER_STARTED_BY = `pid:${process.pid}`;
    logger.info(
        `[SEARCH] sweeper started pid=${process.pid} intervalMs=${SEARCH_SWEEP_INTERVAL_MS} startedAt=${process.env.SWEEPER_STARTED_AT}`,
    );
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
