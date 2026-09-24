import logger from "../config/logger.config";
import redisClient from "../lib/redis";

// Ephemeral current-location TTL. Refreshed on every accepted fix; a key that
// stops being refreshed expires, so its driver is no longer a valid candidate.
const DRIVER_LOCATION_TTL_SECONDS = 30;


export const addDriverLocationToRedisService = async (driverId: string, lat: number, lng: number) => {
    try {
        logger.info(`[LOCATION] GEOADD drivers driverId=${driverId} lng=${lng} lat=${lat}`);
        await redisClient.sendCommand(['GEOADD', 'drivers', lng.toString(), lat.toString(), driverId]);
        // The HTTP path only carries lat/lng; unknown metadata is stored as
        // null so every writer keeps the same canonical driver-location shape.
        const metadata = {
            latitude: lat,
            longitude: lng,
            accuracy: null,
            heading: null,
            speed: null,
            timestamp: null,
            updatedAt: Date.now()
        };
        await redisClient.set(`driver-location:${driverId}`, JSON.stringify(metadata), { EX: DRIVER_LOCATION_TTL_SECONDS });
        logger.info(`[LOCATION] Location updated for driverId=${driverId}`);
    }
    catch (error) {
        logger.error("[LOCATION] Failed to add driver location", error);
        throw error;
    }

}


export const findNearByDriversService = async (lng: number, lat: number, radius: number) => {
    try {
        logger.info(`[LOCATION] GEORADIUS query: lng=${lng}, lat=${lat}, radius=${radius}km`);
        const nearbyDrivers = await redisClient.sendCommand(['GEORADIUS', 'drivers', lng.toString(), lat.toString(), radius.toString(), 'km', 'WITHDIST', 'WITHCOORD', 'ASC']);
        logger.info(`[LOCATION] GEORADIUS result: ${JSON.stringify(nearbyDrivers)}`);
        return nearbyDrivers;
    }
    catch (error) {
        logger.error("[LOCATION] Failed to find nearby drivers", error);
        return [];
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


export const getNotifiedDriversService = async (bookingId: string) => {
    try {
        return await redisClient.sMembers(`notifiedDrivers:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to read notified drivers", error);
        return [];
    }
}

export const deleteNotifiedDriversService = async (bookingId: string) => {
    try {
        await redisClient.del(`notifiedDrivers:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to delete notified drivers", error);
    }
}

export const removeDriverLocationFromRedisService = async (driverId: string) => {
    try {
        console.log(`[LocationService] Removing driver ${driverId} from GEO and location metadata`)
        await redisClient.sendCommand(['ZREM', 'drivers', driverId]);
        await redisClient.del(`driver-location:${driverId}`);
        console.log(`[LocationService] Driver ${driverId} removed from GEO and metadata`)
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

/**
 * Read-only liveness probe for drivers still present in the GEO index. A key
 * with an expired `driver-location:<id>` TTL means the driver stopped sending
 * location fixes — treat them as stale (not eligible) even though the GEO
 * sorted-set member itself does not expire.
 */
export const isDriverLocationFresh = async (driverId: string): Promise<boolean> => {
    try {
        const data = await redisClient.get(`driver-location:${driverId}`);
        return Boolean(data);
    }
    catch (error) {
        logger.error("Failed to check driver location freshness", error);
        return false;
    }
}

// ── Per-booking search progress ────────────────────────────────────────
// `search-stage:<bookingId>` tracks which radius stage has been attempted so
// the sweep only opens the next radius once the previous attempt had a chance
// to produce an acceptance.

export const getSearchStageService = async (bookingId: string): Promise<number> => {
    try {
        const raw = await redisClient.get(`search-stage:${bookingId}`);
        const parsed = raw !== null ? parseInt(raw, 10) : NaN;
        return Number.isFinite(parsed) ? parsed : -1;
    }
    catch (error) {
        logger.error("Failed to read search stage", error);
        return -1;
    }
}

export const setSearchStageService = async (bookingId: string, stage: number) => {
    try {
        await redisClient.set(`search-stage:${bookingId}`, String(stage));
    }
    catch (error) {
        logger.error("Failed to write search stage", error);
    }
}

export const deleteSearchStageService = async (bookingId: string) => {
    try {
        await redisClient.del(`search-stage:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to delete search stage", error);
    }
}

// ── Active-ride routing maps (shared with socket-server over Redis) ──────
// These keys let the socket-server route realtime events to the right
// recipient WITHOUT touching Mongo: on every driver-location fix it resolves
// driver → active booking → passenger room entirely from Redis.

export const setDriverActiveRideService = async (driverId: string, bookingId: string) => {
    try {
        await redisClient.set(`driver-active-ride:${driverId}`, bookingId);
        logger.info(`[RIDE-MAP] driver-active-ride:${driverId} = ${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to set driver active ride", error);
    }
}

export const clearDriverActiveRideService = async (driverId: string) => {
    try {
        await redisClient.del(`driver-active-ride:${driverId}`);
        logger.info(`[RIDE-MAP] cleared driver-active-ride:${driverId}`);
    }
    catch (error) {
        logger.error("Failed to clear driver active ride", error);
    }
}

export const getDriverActiveRideBookingIdService = async (driverId: string) => {
    try {
        return await redisClient.get(`driver-active-ride:${driverId}`);
    }
    catch (error) {
        logger.error("Failed to get driver active ride", error);
        return null;
    }
}

export const setRidePassengerService = async (bookingId: string, passengerId: string) => {
    try {
        await redisClient.set(`ride-passenger:${bookingId}`, passengerId);
        logger.info(`[RIDE-MAP] ride-passenger:${bookingId} = ${passengerId}`);
    }
    catch (error) {
        logger.error("Failed to set ride passenger", error);
    }
}

export const getRidePassengerService = async (bookingId: string) => {
    try {
        return await redisClient.get(`ride-passenger:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to get ride passenger", error);
        return null;
    }
}

export const deleteRidePassengerService = async (bookingId: string) => {
    try {
        await redisClient.del(`ride-passenger:${bookingId}`);
        logger.info(`[RIDE-MAP] cleared ride-passenger:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to delete ride passenger map", error);
    }
}
