import { createClient } from "redis";
import { dbConfig } from "../config/db.config";
import logger from "../config/logger.config";

const redisClient = createClient({
    url: dbConfig.redisUri,
    socket: {
        reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 50, 2000);
            return delay;
        }
    }
})

redisClient.on("error", (err) => console.log("Redis Client Error", err));

export async function connectRedis() {
    try {
        await redisClient.connect();
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