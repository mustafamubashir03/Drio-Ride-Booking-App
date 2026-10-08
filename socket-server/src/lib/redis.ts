import { createClient } from "redis";
import { dbConfig } from "../config/db.config";
import logger from "../config/logger.config";
import { describeRedisUri, formatRedisIdentity } from "./redis-identity";

export const redisIdentity = describeRedisUri(dbConfig.redisUri);

const redisClient = createClient({
    url: dbConfig.redisUri,
    // node-redis negotiates RESP3 via HELLO, which Redis < 6 does not implement.
    // Local/dev instances (and the Windows build in .env) are Redis 5, so allow
    // pinning RESP2 without touching the negotiated default.
    ...(process.env.REDIS_RESP === "2" ? { RESP: 2 as const } : {}),
    socket: {
        reconnectStrategy: (retries: number) => {
            const delay = Math.min(retries * 50, 2000);
            return delay;
        }
    }
})

redisClient.on("error", (err: Error) => logger.error("Redis Client Error", err));

export async function connectRedis() {
    try {
        // Logged BEFORE connecting so a failed connection still leaves a record of
        // which datastore was attempted.
        logger.info(formatRedisIdentity("socket-server", redisIdentity));
        console.log(formatRedisIdentity("socket-server", redisIdentity));
        await redisClient.connect();
        
        // Phase 1: Redis ID logging
        const info = await redisClient.info();
        const runIdMatch = info.match(/run_id:([a-f0-9]+)/);
        const tcpPortMatch = info.match(/tcp_port:(\d+)/);
        const roleMatch = info.match(/role:(\w+)/);
        const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
        const runId = runIdMatch ? runIdMatch[1] : 'unknown';
        const tcpPort = tcpPortMatch ? tcpPortMatch[1] : 'unknown';
        const role = roleMatch ? roleMatch[1] : 'unknown';
        const uptime = uptimeMatch ? uptimeMatch[1] : '0';
        const geoCount = await redisClient.zCard('drivers');
        
        logger.info("[REDIS-ID] {service:'ws-server', run_id:'" + runId + "', tcp_port:" + tcpPort + ", role:'" + role + "', uptime_s:" + uptime + ", geoKey:'drivers', geoCount:" + geoCount + "}");
        console.log("[REDIS-ID] {service:'ws-server', run_id:'" + runId + "', tcp_port:" + tcpPort + ", role:'" + role + "', uptime_s:" + uptime + ", geoKey:'drivers', geoCount:" + geoCount + "}");
        
        logger.info("Redis connected");
    } catch (error) {
        logger.error("Failed to connect Redis", error);
        throw error;
    }
}

export async function disconnectRedis() {
    try {
        await redisClient.quit();
        logger.info("Redis disconnected");
    } catch (error) {
        logger.error("Failed to disconnect Redis", error);
        throw error;
    }
}

export default redisClient;