import { Response, Request } from "express";
import redisClient, { redisIdentity } from "../lib/redis";

/**
 * Credential-safe runtime diagnostics.
 *
 * Ride matching spans three processes that each read or write the shared Redis
 * state (GEO, freshness, driverId -> socketId, search stage, notified drivers).
 * When those processes are configured against different Redis instances the
 * failure is silent: the driver is genuinely online, the booking is genuinely
 * created, and the search still finds nobody. Exposing which datastore this
 * process is actually connected to makes that class of misconfiguration
 * detectable with a single unauthenticated GET instead of a log-diving exercise.
 *
 * Returns identity and liveness only. No credential, no key values, no user
 * data, and no write path.
 */
export const redisDiagnosticsHandler = async (_req: Request, res: Response) => {
    const base = {
        service: "main-api",
        role: process.env.SWEEPER_ROLE || "api",
        startedAt: process.env.SWEEPER_STARTED_AT || null,
        startedBy: process.env.SWEEPER_STARTED_BY || null,
        redis: redisIdentity,
    };

    // Prove the connection actually works from this process, and capture the
    // server-side instance identity (run_id) so two deployments pointed at the
    // same endpoint can be confirmed to be the same live instance.
    try {
        const info = await redisClient.info();
        const grab = (key: string) => info.match(new RegExp(`${key}:(\\S+)`))?.[1] ?? null;
        res.status(200).json({
            ...base,
            connected: redisClient.isReady,
            instance: {
                runId: grab("run_id"),
                role: grab("role"),
                version: grab("redis_version"),
                uptimeSeconds: Number(grab("uptime_in_seconds") ?? 0),
            },
        });
    } catch (error) {
        res.status(503).json({
            ...base,
            connected: false,
            instance: null,
            error: (error as Error).message,
        });
    }
};