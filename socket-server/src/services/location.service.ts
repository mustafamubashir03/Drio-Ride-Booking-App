import logger from "../config/logger.config";
import redisClient from "../lib/redis";

const DRIVER_LOCATION_TTL_SECONDS = 30;

export const addDriverLocationToRedisService = async ({
    driverId,
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    timestamp,
}: {
    driverId: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number | null;
}) => {
    try {
        logger.info(`[LocationService] GEOADD drivers ${driverId} ${longitude} ${latitude}`);

        await redisClient.sendCommand(['GEOADD', 'drivers', longitude.toString(), latitude.toString(), driverId]);
        
        // Also store location freshness metadata. `timestamp` is the GPS fix
        // time reported by the client; `updatedAt` is when we accepted it.
        // The TTL makes this an ephemeral current-location key: every accepted
        // fix refreshes it, and once updates stop it expires on its own.
        const metadata = {
            latitude,
            longitude,
            accuracy,
            heading,
            speed,
            timestamp,
            updatedAt: Date.now()
        };
        await redisClient.set(`driver-location:${driverId}`, JSON.stringify(metadata), { EX: DRIVER_LOCATION_TTL_SECONDS });
        logger.info(`[LocationService] Location updated for driver ${driverId}`);
    }
    catch (error) {
        logger.error("Failed to add driver location", error);
        throw error;
    }
}


export const storeNotifiedDriversService = async (bookingId: string, driverIds: string[]) => {
    try {
        for (const driverId of driverIds) {
            const addedCount = await redisClient.sAdd(`notifiedDrivers:${bookingId}`, driverId);
            logger.info(`Added driver ${driverId} to notified list for booking ${bookingId}: result ${addedCount}`);
        }
    }
    catch (error) {
        logger.error("Failed to store notified drivers", error);
    }
}


export const removeDriverLocationFromRedisService = async (driverId: string) => {
    try {
        logger.info(`[LocationService] Removing driver ${driverId} from GEO and location metadata`);
        await redisClient.sendCommand(['ZREM', 'drivers', driverId]);
        await redisClient.del(`driver-location:${driverId}`);
        logger.info(`[LocationService] Driver ${driverId} removed from GEO and metadata`);
    }
    catch (error) {
        logger.error("Failed to remove driver location", error);
        throw error;
    }
}

export const getDriverLocationMetadata = async (driverId: string) => {
    try {
        const data = await redisClient.get(`driver-location:${driverId}`);
        if (!data) return null;
        return JSON.parse(data);
    }
    catch (error) {
        logger.error("Failed to get driver location metadata", error);
        return null;
    }
}