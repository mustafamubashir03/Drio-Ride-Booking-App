import logger from "../config/logger.config";
import { addDriverLocationToRedisService } from "./location.service";


export const addDriverLocationService = async (driverId: string, latitude: number, longitude: number) => {
    try {
        logger.info(`[DRIVER-SERVICE] addDriverLocationService: driverId=${driverId}, lat=${latitude}, lng=${longitude}`);
        const driver = await addDriverLocationToRedisService(driverId, latitude, longitude);
        logger.info(`[DRIVER-SERVICE] Location updated for driverId=${driverId}`);
        return driver;
    }
    catch (error) {
        logger.error("[DRIVER-SERVICE] Failed to update location", error);
        throw error;
    }
}