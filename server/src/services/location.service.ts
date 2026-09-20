import logger from "../config/logger.config";
import redisClient from "../lib/redis";


export const addDriverLocationToRedisService = async (driverId: string, lat: number, lng: number) => {
    try {
        await redisClient.sendCommand(['GEOADD', 'drivers', lng.toString(), lat.toString(), driverId]);
    }
    catch (error) {
        logger.error("Failed to add driver location", error);
        throw error;
    }

}


export const findNearByDriversService = async (lng: number, lat: number, radius: number) => {
    try {
        const nearbyDrivers = await redisClient.sendCommand(['GEORADIUS', 'drivers', lng.toString(), lat.toString(), radius.toString(), 'km', 'WITHDIST', 'WITHCOORD']);
        return nearbyDrivers;
    }
    catch (error) {
        logger.error("Failed to find nearby drivers", error);
        return [];
    }
}


export const setDriverSocket = async (driverId: string, socketId: string) => {
    try {
        await redisClient.set(`driver:${driverId}`, socketId);
    }
    catch (error) {
        logger.error("Failed to set driver socket", error);
        return;
    }
}


export const getDriverSocket = async (driverId: string) => {
    try {
        const socketId = await redisClient.get(`driver:${driverId}`);
        if (!socketId) {
            return null;
        }
        return socketId;
    }
    catch (error) {
        logger.error("Failed to get driver socket", error);
        return null;
    }
}


export const removeDriverSocket = async (driverId: string) => {
    try {
        await redisClient.del(`driver:${driverId}`);
    }
    catch (error) {
        logger.error("Failed to remove driver socket", error);
        return;
    }
}

export const removeDriverBySocket = async (socketId: string) => {
    try {
        const driverId = await redisClient.get(`driver:${socketId}`)
        if (driverId) {
            await redisClient.del(`driver:${socketId}`)
        }
    }
    catch (error) {
        logger.error("Failed to remove driver by socket", error);
        return;
    }
}
