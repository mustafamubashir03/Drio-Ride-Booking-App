import logger from "../config/logger.config";
import {
    SEARCH_RADII_KM,
    SEARCH_MAX_RADIUS_KM,
    SEARCH_STAGE_INTERVAL_MS,
    SEARCH_SWEEP_INTERVAL_MS,
    SEARCH_MAX_DURATION_MS,
} from "../config/search.config";
import {
    findPendingSearchingBookingsRepository,
    cancelBookingRepository,
} from "../repositories/booking.repository";
import {
    findNearByDriversService,
    isDriverLocationFresh,
    getDriverActiveRideBookingIdService,
    getDriverSocketIdsService,
    getNotifiedDriversService,
    storeNotifiedDriversService,
    deleteNotifiedDriversService,
    setSearchStageService,

    getSearchStageService,

    setSearchProgressService,

    acquireSearchSweepLockService,

    releaseSearchSweepLockService,


    reapStaleGeoMembersService,
    deleteSearchStageService,
    deleteRidePassengerService,
} from "./location.service";
import { notifyDrivers, notifyPassenger, removeRideNotification, type RideInfo } from "./notification-bridge.service";

/**
 * Driver discovery for a booking.
 *
 * Controlled expansion schedule (owned by this service, never by the client):
 *   - Stage 0:  5 km — notified immediately at booking creation
 *   - Stage 1: 15 km — after  SEARCH_STAGE_INTERVAL_MS
 *   - Stage 2: 25 km — after  2xSEARCH_STAGE_INTERVAL_MS
 *   - Stage 3: 45 km — after  3xSEARCH_STAGE_INTERVAL_MS
 *   - Stage 4: 50 km — after  4xSEARCH_STAGE_INTERVAL_MS
 *   - Timeout:  5xSEARCH_STAGE_INTERVAL_MS — booking expires as cancelled / no_driver_found
 *
 * Eligibility per candidate (nearest-first via GEORADIUS … ASC):
 *   - location metadata still fresh (`driver-location:<id>` key alive),
 *   - no active ride (`driver-active-ride:<id>` key absent),
 *   - not already notified for this booking (`notifiedDrivers:<bookingId>`),
 * so each radius stage only ever pings drivers nobody has contacted yet.
 * Socket reachability is reported as a diagnostic, never used as a filter — see
 * collectEligibleDriverIds.
 *
 * Search progress and notification delivery are tracked SEPARATELY. A stage is
 * considered searched the moment its radius has been queried, regardless of how
 * many of the candidates could actually be reached. Conflating the two is what
 * previously froze the ladder at a single radius: one eligible-but-offline
 * driver made `notified < candidates` true, which blocked every wider radius
 * for the rest of the booking's life.
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
 *
 * Offer reachability is deliberately NOT a filter here. The bridge already
 * reports exactly which drivers it could emit to, and a driver without a live
 * socket can no longer stall the ladder, so gating the candidate list on
 * socket state would only hide the delivery outcome from the logs. It is
 * reported as a diagnostic instead.
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
    logger.info(
        `[DISPATCH] booking=${bookingId} radius=${radiusKm}km geoCandidates=${nearestFirst.length}`,
    );
    if (nearestFirst.length === 0) return [];

    const already = new Set(await getNotifiedDriversService(bookingId));
    const eligible: string[] = [];
    // Why each GEO candidate was excluded. Without this, "eligible=[]" is
    // indistinguishable from "GEO returned nobody", which is exactly the
    // ambiguity that made the production failure hard to attribute.
    const excluded: { driverId: string; reason: string }[] = [];
    for (const driverId of nearestFirst) {
        if (already.has(driverId)) {
            excluded.push({ driverId, reason: "already_notified" });
            continue;
        }
        if (!(await isDriverLocationFresh(driverId))) {
            excluded.push({ driverId, reason: "location_stale" });
            continue;
        }
        const activeRide = await getDriverActiveRideBookingIdService(driverId);
        if (activeRide) {
            excluded.push({ driverId, reason: `on_active_ride:${activeRide}` });
            continue;
        }
        eligible.push(driverId);
    }

    // Diagnostic only: which candidates the bridge will not be able to reach.
    // Never used to change the candidate list.
    if (eligible.length > 0) {
        const reachable = new Set(await getDriverSocketIdsService(eligible));
        const unreachable = eligible.filter((id) => !reachable.has(id));
        if (unreachable.length > 0) {
            logger.info(
                `[DISPATCH] booking=${bookingId} radius=${radiusKm}km unreachableCandidates=${JSON.stringify(unreachable)}`,
            );
        }
    }

    logger.info(
        `[DISPATCH] booking=${bookingId} radius=${radiusKm}km eligible=${JSON.stringify(eligible)} ` +
        `excluded=${JSON.stringify(excluded)}`,
    );
    return eligible;
};

const buildRideInfo = (booking: any): RideInfo => ({
    pickup: booking.source?.displayName || booking.source?.name || "Unknown",
    destination: booking.destination?.displayName || booking.destination?.name || "Unknown",
    fare: typeof booking.fare === "number" ? booking.fare : 0,
    distance: typeof booking.distance === "number" ? booking.distance : 0,
    passengerName: booking.passenger?.name || "Passenger",
    passengerImage: booking.passenger?.image ?? undefined,
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
    await setSearchProgressService(bookingId, 0, radiusKm);
    logger.info(
        `[DISPATCH] booking=${bookingId} kickoff start pickup=${longitude},${latitude} radius=${radiusKm}km`,
    );
    await setSearchStageService(bookingId, 0);
    const driverIds = await collectEligibleDriverIds({
        bookingId,
        longitude,
        latitude,
        radiusKm,
    });
    let notifiedCount = 0;
    if (driverIds.length > 0) {
        const notifiedDriverIds = await notifyDrivers(bookingId, driverIds, rideInfo);
        notifiedCount = notifiedDriverIds.length;
        if (notifiedDriverIds.length > 0) {
            await storeNotifiedDriversService(bookingId, notifiedDriverIds);
        }
    }
    logger.info(
        `[DISPATCH] booking=${bookingId} kickoff done radius=${radiusKm}km candidates=${driverIds.length} notified=${notifiedCount}`,
    );
    return notifiedCount;
};

/**
 * Search ONE radius stage and report the radius that was actually queried.
 *
 * The stage is always persisted once the radius has been searched. Notification
 * completeness is logged and surfaced to the passenger as search progress, but
 * it deliberately does NOT gate the next stage: a candidate whose socket is busy
 * or briefly missing must not be able to strand the search at this radius.
 */
const advanceStage = async (booking: any, stage: number): Promise<number> => {
    const bookingId = String(booking._id);
    const radiusKm = Math.min(SEARCH_RADII_KM[stage], SEARCH_MAX_RADIUS_KM);
    const driverIds = await collectEligibleDriverIds({
        bookingId,
        longitude: booking.source.longitude,
        latitude: booking.source.latitude,
        radiusKm,
    });
    const passengerId = booking.passenger?._id ? String(booking.passenger._id) : null;

    let notifiedCount = 0;
    if (driverIds.length > 0) {
        logger.info(
            `[DISPATCH] booking=${bookingId} stage=${stage} notifying=${JSON.stringify(driverIds)}`,
        );
        const notifiedDriverIds = await notifyDrivers(
            bookingId,
            driverIds,
            buildRideInfo(booking),
        );
        notifiedCount = notifiedDriverIds.length;
        if (notifiedDriverIds.length > 0) {
            await storeNotifiedDriversService(bookingId, notifiedDriverIds);
        }
        if (notifiedDriverIds.length < driverIds.length) {
            logger.warn(
                `[SEARCH] stage ${stage} bookingId=${bookingId} notification incomplete=${notifiedDriverIds.length}/${driverIds.length}`,
            );
        }
    }

    // Progress is persisted unconditionally: the radius HAS been searched.
    await setSearchStageService(bookingId, stage);
    await setSearchProgressService(bookingId, stage, radiusKm);

    if (passengerId) {
        await notifyPassenger({
            bookingId,
            passengerId,
            status: null,
            driverId: null,
            searchProgress: { stage, radiusKm },
        });
    }
    logger.info(
        `[SEARCH] stage ${stage} bookingId=${bookingId} radius=${radiusKm}km notified=${notifiedCount}`,
    );
    return notifiedCount;
};

const hasDriver = (booking: any) => Boolean(booking.driver);

/**
 * Expire a still-unclaimed booking (pending, driver: null) once the search
 * budget is exhausted. Atomic DB transition decides the winner against a
 * racing driver confirm; if a driver already claimed it nothing happens.
 */
export const expireBookingSearch = async (
    booking: any,
    deps?: Pick<SearchCycleDeps, "cancelBooking">,
) => {
    const cancelBooking = deps?.cancelBooking ?? cancelBookingRepository;
    const bookingId = String(booking._id);
    const passengerId = booking.passenger?._id ? String(booking.passenger._id) : null;
    if (!passengerId) {
        logger.warn(`[SEARCH] cannot expire bookingId=${bookingId}: passenger missing`);
        return null;
    }
    const updated = await cancelBooking({
        bookingId,
        passengerId,
        fromStatus: "pending",
        cancelledBy: "system",
        reason: "no_driver_found",
        cancelledAt: new Date(),
        requireUnassigned: true,
    });
    if (!updated) return null; // claimed or already terminal — leave it

    const notified = await getNotifiedDriversService(bookingId);
    if (notified.length > 0) {
        await removeRideNotification(bookingId, notified);
        await deleteNotifiedDriversService(bookingId);
    }
    await deleteSearchStageService(bookingId);
    await deleteRidePassengerService(bookingId);
    await notifyPassenger({ bookingId, passengerId, status: "cancelled", driverId: null, cancelledBy: "system" });
    logger.info(`[SEARCH] expired bookingId=${bookingId} (no_driver_found) noticed=${notified.length}`);
    return updated;
};

/**
 * One sweep over every pending, unassigned booking: expand the radius as the
 * stage budget elapses, and expire the search once the budget is exhausted.
 *
 * The whole budget is bounded by SEARCH_MAX_DURATION_MS, so every booking is
 * guaranteed to resolve one way or the other — a claimed ride, a passenger
 * cancellation, or no_driver_found — and no search can run indefinitely.
 */
export type SearchCycleDeps = {
    findPending: typeof findPendingSearchingBookingsRepository;
    cancelBooking: typeof cancelBookingRepository;
};

/**
 * Run one sweep.
 *
 * `deps` exists purely so the ladder can be exercised against an isolated Redis
 * with in-memory bookings. Production always uses the Mongo repositories; the
 * defaults are the real ones and there is no behavioural difference between the
 * two paths.
 */
export const runDriverSearchCycle = async (
    deps: SearchCycleDeps = {
        findPending: findPendingSearchingBookingsRepository,
        cancelBooking: cancelBookingRepository,
    },
): Promise<{ advanced: number; expired: number }> => {
    const { findPending, cancelBooking } = deps;
    const bookings = await findPending();
    let advanced = 0;
    let expired = 0;

    const finalStage = SEARCH_RADII_KM.length - 1;

    for (const booking of bookings) {
        if (hasDriver(booking)) continue; // defensive: only driver:null qualifies
        const bookingId = String(booking._id);
        const elapsedMs = Date.now() - booking._id.getTimestamp().getTime();

        // The stage is DERIVED FROM ELAPSED TIME, not counted by a timer, so a
        // process that slept through the budget still resolves the correct
        // stage on wake. `search-stage` records how far the ladder actually got
        // (for observability and so a re-run never re-searches a radius), but
        // correctness never depends on it: a missing key reads as -1 and is
        // clamped to 0, never treated as "restart from the beginning".
        const persisted = await getSearchStageService(bookingId);
        const currentStage = persisted < 0 ? 0 : Math.min(persisted, finalStage);
        const targetStage = firstStageFromElapsed(elapsedMs);

        // Catch up EVERY stage the sleep spanned BEFORE considering expiry.
        //
        // This ordering is the fix for the production failure. Expiry used to be
        // checked first, so a sweep that woke late found the booking already
        // past budget and cancelled it without ever querying 15/25/45/50 km. A
        // driver sitting 7 km away was inside the 15 km stage the whole time and
        // was never notified, so the ride always died as "no driver found".
        // Deriving the stage from elapsed time makes the ladder converge no
        // matter when (or whether) the timer happened to be alive.
        for (let stage = currentStage + 1; stage <= targetStage; stage++) {
            try {
                const notified = await advanceStage(booking, stage);
                advanced++;
                if (notified > 0) {
                    // A live driver was reached at this radius. Leave the stage
                    // recorded so a later sweep can still widen if nobody
                    // accepts in time, but there is no reason to burn the rest
                    // of the ladder in the same pass.
                    break;
                }
            } catch (err) {
                logger.error(`[SEARCH] failed to advance bookingId=${bookingId} to stage=${stage}`, err);
                break;
            }
        }

        // Terminal resolution once the budget is spent. This deliberately does
        // NOT depend on the ladder having completed: a stage that throws (bad
        // stored coordinates, a Redis error) must not be able to strand a
        // booking in "searching" forever. The catch-up loop above has already
        // given every due radius its chance, so expiring here cannot pre-empt a
        // wider search - it only ends a search that has run out of time.
        if (elapsedMs >= SEARCH_MAX_DURATION_MS) {
            const result = await expireBookingSearch(booking, { cancelBooking });
            if (result) expired++;
        }
    }
    if (bookings.length > 0) {
        logger.info(`[SEARCH] sweep: scanned=${bookings.length} advanced=${advanced} expired=${expired}`);
    }
    return { advanced, expired };
};

export const startDriverSearchSweeper = (intervalMs: number) => {
    return setInterval(() => {
        void maybeRunSearchSweep("interval");
    }, intervalMs);
};

// ── Sweep scheduling ──────────────────────────────────────────────────────
//
// The ladder itself is derived from booking age (see runDriverSearchCycle), so a
// timer is only a TRIGGER, never the source of truth. A sweep that runs late, or
// twice, or never runs, converges to the same stage from elapsed time and the
// notified-driver set. That is what makes behaviour deterministic across the
// Vercel API, the Render sweeper and the passenger's polling - none of which can
// be relied on to be alive on a schedule.
//
// The lock is therefore an optimisation to avoid duplicated work, NOT a
// correctness requirement - which is precisely why its TTL must stay far below
// the search budget. It used to be 10x the sweep interval (50s = the entire
// budget), so a process that died holding it froze ALL searching system-wide for
// a full budget and every booking in flight expired untouched.

const SWEEP_LOCK_TTL_MS = 10_000;

let lastSweepStartedAt = 0;
let sweepInFlight = false;
const SWEEP_OWNER_PREFIX = `sweep-${process.pid}`;

/** Throttled, lock-guarded sweep. Safe to call from anywhere, any process. */
export const maybeRunSearchSweep = async (trigger: string) => {
    const now = Date.now();
    if (sweepInFlight) return;
    if (now - lastSweepStartedAt < SEARCH_SWEEP_INTERVAL_MS) return;
    lastSweepStartedAt = now;
    sweepInFlight = true;

    const owner = `${SWEEP_OWNER_PREFIX}-${now}`;
    const acquired = await acquireSearchSweepLockService(owner, SWEEP_LOCK_TTL_MS);
    if (!acquired) {
        // Another process is sweeping right now; its work covers ours.
        sweepInFlight = false;
        return;
    }

    try {
        const result = await runDriverSearchCycle();
        if (result.advanced > 0 || result.expired > 0) {
            logger.info(
                `[SEARCH] sweep trigger=${trigger} advanced=${result.advanced} expired=${result.expired}`,
            );
        }
    }
    catch (error) {
        logger.error(`[SEARCH] sweep failed trigger=${trigger}`, error);
    }
    finally {
        await releaseSearchSweepLockService(owner);
        sweepInFlight = false;
        // GEO hygiene runs AFTER the lock is released. It is unrelated to search
        // correctness, and doing it inside the lock only extended how long every
        // other process had to wait for a sweep.
        void reapStaleGeoMembersService().catch(() => undefined);
    }
};

export {
    SEARCH_RADII_KM,
    SEARCH_MAX_RADIUS_KM,
    SEARCH_STAGE_INTERVAL_MS,
    SEARCH_MAX_DURATION_MS,
};
