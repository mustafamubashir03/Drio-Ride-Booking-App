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

// ── Driver socket registry (written by socket-server, read here) ────────
// `driver-socket` is a hash of driverId -> socketId, written by the
// socket-server when a driver completes `driver-login` and removed on
// disconnect. The main API only reads it, so dispatch can tell "this driver is
// reachable right now" apart from "this driver has a recent GPS fix", which is
// the difference between a radius stage that advances and one that stalls.

const DRIVER_SOCKET_KEY = "driver-socket";

/** Batch read: one round trip for a whole radius stage instead of N. */
export const getDriverSocketIdsService = async (driverIds: string[]): Promise<string[]> => {
    if (driverIds.length === 0) return [];
    try {
        const socketIds = await redisClient.hmGet(DRIVER_SOCKET_KEY, driverIds);
        return socketIds.filter((id): id is string => Boolean(id));
    }
    catch (error) {
        logger.error("[RIDE-MAP] failed to batch-read driver-socket", error);
        return [];
    }
};

/**
 * Drop GEO members that no longer have a freshness key.
 *
 * `driver-location:<id>` carries a short TTL, so once a driver stops streaming
 * their GEO member becomes permanently unreferenced - the sorted set never
 * shrinks on its own. That is how a user who operated as a driver once (and is
 * currently only a passenger) stayed in the index and showed up in
 * `geoCandidates` for later bookings. Eligibility filtering already refused to
 * notify them, so this was never a wrong-dispatch bug, but the index grew
 * without bound and the candidate counts in the logs were misleading.
 *
 * Deliberately additive and self-limiting: it removes only members with no
 * freshness key, in bounded batches, one member at a time. It never clears the
 * whole GEO set, so a live driver can never be removed by this path.
 */
export const reapStaleGeoMembersService = async (limit = 50): Promise<number> => {
    let removed = 0;
    try {
        const members = await redisClient.zRange("drivers", 0, limit * 4 - 1);
        if (members.length === 0) return 0;
        // One batched read instead of one EXISTS per member. The previous
        // round-trip-per-member version could issue >200 sequential calls to a
        // remote Redis, holding the search-sweep lock for many seconds, which
        // starved the very searches the reaper was meant to keep healthy.
        const flags = await redisClient.mGet(members.map((m) => `driver-location:${m}`));
        const stale = members.filter((_, i) => !flags[i]);
        if (stale.length === 0) return 0;
        // ZREM is variadic: one call, bounded to the limit.
        const doomed = stale.slice(0, limit);
        await redisClient.zRem("drivers", doomed);
        removed = doomed.length;
        logger.info(`[GEO] reaped stale members count=${removed} ids=${JSON.stringify(doomed)}`);
    }
    catch (error) {
        logger.error("[GEO] stale member reaper failed", error);
    }
    return removed;
};

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
        await redisClient.del(`search-progress:${bookingId}`);
    }
    catch (error) {
        logger.error("Failed to delete search stage", error);
    }
}

/**
 * The radius actually queried for the current stage.
 *
 * Persisted alongside the stage so the bookings API can report real search
 * progress. The socket already streams this to the passenger, but if the
 * passenger socket is down or reconnects late the radius indicator would stay
 * on "Searching" while the backend had already widened - so the UI was showing
 * something the backend was not doing. This gives the poll the same numbers the
 * search actually used instead of the frontend inventing them.
 */
export const setSearchProgressService = async (
    bookingId: string,
    stage: number,
    radiusKm: number,
) => {
    try {
        await redisClient.set(
            `search-progress:${bookingId}`,
            JSON.stringify({ stage, radiusKm }),
            { EX: 300 },
        );
    }
    catch (error) {
        logger.error("Failed to write search progress", error);
    }
}

export const getSearchProgressService = async (
    bookingId: string,
): Promise<{ stage: number; radiusKm: number } | null> => {
    try {
        const raw = await redisClient.get(`search-progress:${bookingId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { stage?: unknown; radiusKm?: unknown };
        if (typeof parsed.stage !== "number" || typeof parsed.radiusKm !== "number") {
            return null;
        }
        return { stage: parsed.stage, radiusKm: parsed.radiusKm };
    }
    catch (error) {
        logger.error("Failed to read search progress", error);
        return null;
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

// ── Search sweep lock ─────────────────────────────────────────────────────
//
// Booking creation (Vercel) and the search sweeper (Render) are two processes
// that can both decide to advance a search. Without a lock they can compute the
// same eligible-driver list concurrently and both notify the same driver, so the
// lock makes "one sweep at a time" a real guarantee instead of a hope.
//
// It also lets any process safely *drive* a sweep on request, which is what
// keeps searches progressing when the dedicated sweeper process is not running.

const SEARCH_SWEEP_LOCK_KEY = "search-sweep:lock";

const RELEASE_LOCK_IF_OWNER_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Returns true when this caller now owns the sweep lock. */
export const acquireSearchSweepLockService = async (
    owner: string,
    ttlMs: number,
): Promise<boolean> => {
    try {
        const result = await redisClient.set(SEARCH_SWEEP_LOCK_KEY, owner, {
            NX: true,
            PX: ttlMs,
        });
        return result === "OK";
    }
    catch (error) {
        // A Redis failure must not wedge matching: let the caller proceed and
        // rely on the notified-driver dedup set for safety.
        logger.error("[SEARCH] failed to acquire sweep lock", error);
        return true;
    }
};

/** Releases only if still owned, so a slow sweep cannot free a newer one's lock. */
export const releaseSearchSweepLockService = async (owner: string): Promise<void> => {
    try {
        await redisClient.eval(RELEASE_LOCK_IF_OWNER_SCRIPT, {
            keys: [SEARCH_SWEEP_LOCK_KEY],
            arguments: [owner],
        });
    }
    catch (error) {
        logger.error("[SEARCH] failed to release sweep lock", error);
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
