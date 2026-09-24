import logger from "../config/logger.config";
import { SEARCH_RADII_KM, SEARCH_STAGE_INTERVAL_MS, SEARCH_MAX_DURATION_MS } from "../config/search.config";
import {
    findPendingSearchingBookingsRepository,
    cancelBookingRepository,
} from "../repositories/booking.repository";
import {
    findNearByDriversService,
    isDriverLocationFresh,
    getDriverActiveRideBookingIdService,
    getNotifiedDriversService,
    storeNotifiedDriversService,
    deleteNotifiedDriversService,
    setSearchStageService,
    getSearchStageService,
    deleteSearchStageService,
    deleteRidePassengerService,
} from "./location.service";
import { notifyDrivers, notifyPassenger, removeRideNotification, type RideInfo } from "./notification-bridge.service";

/**
 * Driver discovery for a booking.
 *
 * Controlled expansion schedule (owned by this service, never by the client):
 *   - Stage 0: 5 km  — notified immediately at booking creation
 *   - Stage 1: 8 km  — after  SEARCH_STAGE_INTERVAL_MS
 *   - Stage 2: 12 km — after  2×SEARCH_STAGE_INTERVAL_MS
 *   - Stage 3: 15 km — after  3×SEARCH_STAGE_INTERVAL_MS
 *   - Timeout:  4×   — booking expires as cancelled / no_driver_found
 *
 * Eligibility per candidate (nearest-first via GEORADIUS … ASC):
 *   - location metadata still fresh (`driver-location:<id>` key alive),
 *   - no active ride (`driver-active-ride:<id>` key absent),
 *   - not already notified for this booking (`notifiedDrivers:<bookingId>`),
 * so each radius stage only ever pings drivers nobody has contacted yet.
 */

const firstStageFromElapsed = (elapsedMs: number) => {
    const idx = Math.floor(elapsedMs / SEARCH_STAGE_INTERVAL_MS);
    return Math.min(Math.max(idx, 0), SEARCH_RADII_KM.length - 1);
};

const parseGeoRadiusIds = (result: unknown): string[] => {
    const ids: string[] = [];
    if (Array.isArray(result)) {
        for (const item of result) {
            if (Array.isArray(item) && typeof item[0] === "string") {
                ids.push(item[0]);
            }
        }
    }
    return ids;
};

/**
 * Nearest-first eligible drivers for a given radius, skipping drivers that are
 * stale, already on a ride, or have already been notified for this booking.
 */
export const collectEligibleDriverIds = async ({
    bookingId,
    longitude,
    latitude,
    radiusKm,
}: {
    bookingId: string;
    longitude: number;
    latitude: number;
    radiusKm: number;
}): Promise<string[]> => {
    const raw = await findNearByDriversService(longitude, latitude, radiusKm);
    const nearestFirst = parseGeoRadiusIds(raw);
    if (nearestFirst.length === 0) return [];

    const already = new Set(await getNotifiedDriversService(bookingId));
    const eligible: string[] = [];
    for (const driverId of nearestFirst) {
        if (already.has(driverId)) continue;
        if (!(await isDriverLocationFresh(driverId))) continue;
        const activeRide = await getDriverActiveRideBookingIdService(driverId);
        if (activeRide) continue;
        eligible.push(driverId);
    }
    return eligible;
};

const buildRideInfo = (booking: any): RideInfo => ({
    pickup: booking.source?.displayName || booking.source?.name || "Unknown",
    destination: booking.destination?.displayName || booking.destination?.name || "Unknown",
    fare: typeof booking.fare === "number" ? booking.fare : 0,
    distance: typeof booking.distance === "number" ? booking.distance : 0,
    passengerName: booking.passenger?.name || "Passenger",
});

/**
 * Initial discovery at the smallest radius (stage 0) — runs synchronously when
 * the booking is created so nearby drivers are pinged without waiting for the
 * first sweep. Records the stage so the sweeper resumes at the next radius.
 */
export const kickoffDriverSearch = async ({
    bookingId,
    longitude,
    latitude,
    rideInfo,
}: {
    bookingId: string;
    longitude: number;
    latitude: number;
    rideInfo: RideInfo;
}) => {
    const radiusKm = SEARCH_RADII_KM[0];
    const driverIds = await collectEligibleDriverIds({ bookingId, longitude, latitude, radiusKm });
    if (driverIds.length > 0) {
        await storeNotifiedDriversService(bookingId, driverIds);
        await notifyDrivers(bookingId, driverIds, rideInfo);
    }
    await setSearchStageService(bookingId, 0);
    logger.info(`[SEARCH] kickoff bookingId=${bookingId} radius=${radiusKm}km notified=${driverIds.length}`);
    return driverIds.length;
};

const advanceStage = async (booking: any, stage: number) => {
    const bookingId = String(booking._id);
    const radiusKm = SEARCH_RADII_KM[stage];
    const driverIds = await collectEligibleDriverIds({
        bookingId,
        longitude: booking.source.longitude,
        latitude: booking.source.latitude,
        radiusKm,
    });
    if (driverIds.length > 0) {
        await storeNotifiedDriversService(bookingId, driverIds);
        await notifyDrivers(bookingId, driverIds, buildRideInfo(booking));
    }
    await setSearchStageService(bookingId, stage);
    logger.info(`[SEARCH] stage ${stage} bookingId=${bookingId} radius=${radiusKm}km notified=${driverIds.length}`);
    return driverIds.length;
};

const hasDriver = (booking: any) => Boolean(booking.driver);

/**
 * Expire a still-unclaimed booking (pending, driver: null) once the search
 * budget is exhausted. Atomic DB transition decides the winner against a
 * racing driver confirm; if a driver already claimed it nothing happens.
 */
export const expireBookingSearch = async (booking: any) => {
    const bookingId = String(booking._id);
    const passengerId = booking.passenger?._id ? String(booking.passenger._id) : null;
    if (!passengerId) {
        logger.warn(`[SEARCH] cannot expire bookingId=${bookingId}: passenger missing`);
        return null;
    }
    const updated = await cancelBookingRepository({
        bookingId,
        passengerId,
        fromStatus: "pending",
        cancelledBy: "system",
        reason: "no_driver_found",
        cancelledAt: new Date(),
    });
    if (!updated) return null; // claimed or already terminal — leave it

    const notified = await getNotifiedDriversService(bookingId);
    if (notified.length > 0) {
        await removeRideNotification(bookingId, notified);
        await deleteNotifiedDriversService(bookingId);
    }
    await deleteSearchStageService(bookingId);
    await deleteRidePassengerService(bookingId);
    await notifyPassenger({ bookingId, passengerId, status: "cancelled", driverId: null });
    logger.info(`[SEARCH] expired bookingId=${bookingId} (no_driver_found) noticed=${notified.length}`);
    return updated;
};

/**
 * One sweep over every pending, unassigned booking: expand the radius as the
 * stage budget elapses, and expire the search once the budget is exhausted.
 */
export const runDriverSearchCycle = async (): Promise<{ advanced: number; expired: number }> => {
    const bookings = await findPendingSearchingBookingsRepository();
    let advanced = 0;
    let expired = 0;

    for (const booking of bookings) {
        if (hasDriver(booking)) continue; // defensive: only driver:null qualifies
        const bookingId = String(booking._id);
        const elapsedMs = Date.now() - booking._id.getTimestamp().getTime();

        if (elapsedMs >= SEARCH_MAX_DURATION_MS) {
            const result = await expireBookingSearch(booking);
            if (result) expired++;
            continue;
        }

        const currentStage = await getSearchStageService(bookingId);
        const targetStage = firstStageFromElapsed(elapsedMs);
        if (targetStage > currentStage) {
            try {
                await advanceStage(booking, targetStage);
                advanced++;
            } catch (err) {
                logger.error(`[SEARCH] failed to advance bookingId=${bookingId}`, err);
            }
        }
    }
    if (bookings.length > 0) {
        logger.info(`[SEARCH] sweep: scanned=${bookings.length} advanced=${advanced} expired=${expired}`);
    }
    return { advanced, expired };
};

export const startDriverSearchSweeper = (intervalMs: number) => {
    return setInterval(() => {
        runDriverSearchCycle().catch((err) => {
            logger.error("[SEARCH] sweep failed", err);
        });
    }, intervalMs);
};

export { SEARCH_RADII_KM, SEARCH_STAGE_INTERVAL_MS, SEARCH_MAX_DURATION_MS };