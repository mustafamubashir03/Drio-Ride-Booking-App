import logger from "../config/logger.config";
import redisClient from "../lib/redis";

/**
 * Redis-only ride-routing maps (Redis keeps the socket-server free of Mongo).
 *
 * The main API writes these keys:
 *   - driver-active-ride:<driverId>   → bookingId   (on assign/confirm; DEL on terminal)
 *   - ride-passenger:<bookingId>      → passengerId (on booking creation)
 *
 * The socket-server reads them to route realtime events to the correct room.
 */
export const getDriverActiveRide = async (driverId: string): Promise<string | null> => {
    try {
        return await redisClient.get(`driver-active-ride:${driverId}`);
    }
    catch (error) {
        logger.error("Failed to get driver active ride", error);
        return null;
    }
};

export const getRidePassenger = async (bookingId: string): Promise<string | null> => {
    try {
        return await redisClient.get(`ride-passenger:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to get ride passenger", error);
        return null;
    }
};

export const passengerRoom = (passengerId: string) => `passenger:${passengerId}`;