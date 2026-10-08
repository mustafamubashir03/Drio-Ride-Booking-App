import { Response, Request } from "express";
import redisClient, { redisIdentity } from "../lib/redis";

/**
 * Credential-safe runtime diagnostics.
 *
 * This process owns driver GEO, freshness and the driverId -> socketId mapping,
 * all of which the main API reads back during matching. If it is pointed at a
 * different Redis than the API/sweeper, matching silently finds no drivers
 * while every driver looks perfectly online. Exposing the connected datastore
 * makes that a single unauthenticated GET to compare across deployments.
 *
 * Identity and liveness only: no credential, no key values, no user data,
 * no write path.
 */
export const redisDiagnosticsHandler = async (_req: Request, res: Response) => {
    const base = {
        service: "socket-server",
        redis: redisIdentity,
    };

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