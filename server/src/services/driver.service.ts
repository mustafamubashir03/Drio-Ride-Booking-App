import logger from "../config/logger.config";
import { addDriverLocationToRedisService } from "./location.service";


export const addDriverLocationService = async (driverId: string, latitude: number, longitude: number) => {
    try {
        const driver = await addDriverLocationToRedisService(driverId, latitude, longitude);
        return driver;
    }
    catch (error) {
        logger.error("Failed to update location", error);
        throw error;
    }
}