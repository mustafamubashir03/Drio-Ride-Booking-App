import { createClient } from "redis";
import { dbConfig } from "../config/db.config";
import logger from "../config/logger.config";

const redisClient = createClient({
    url: dbConfig.redisUri,
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