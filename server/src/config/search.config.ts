/**
 * Bounded driver-search lifecycle. The main API is the single owner of the
 * search lifecycle (DB is authoritative); Redis only tracks per-booking search
 * progress and notified drivers.
 *
 * Schedule (per booking, t = seconds since the booking `_id` was minted):
 *   t=0    → 5 km    (kickoff, fires synchronously at booking creation)
 *   t=10s  → 15 km   (+10 km)
 *   t=20s  → 25 km   (+10 km)
 *   t=30s  → 45 km   (+20 km)
 *   t=40s  → 50 km   (+20 km, clamped to SEARCH_MAX_RADIUS_KM)
 *   t>=50s → no_driver_found cancellation
 *
 * The ladder is deliberately hard-capped: SEARCH_STAGE_INTERVAL_MS x the number
 * of stages IS the whole budget, so the search always terminates on its own and
 * can never run away. SEARCH_MAX_RADIUS_KM is the ceiling on every stage, so a
 * late stage can never query wider than the advertised maximum.
 */

export const SEARCH_MAX_RADIUS_KM = 50;

/**
 * Radius ladder. The first two steps widen by 10 km, later steps by 20 km,
 * and the last entry is clamped to SEARCH_MAX_RADIUS_KM so 50 km is a real
 * ceiling rather than something the ladder quietly overshoots.
 */
export const SEARCH_RADII_KM = [5, 15, 25, 45, 50] as const;

/** Delay between consecutive search attempts. */
export const SEARCH_STAGE_INTERVAL_MS = 10_000;

/**
 * Total search window. Derived from the ladder so the budget and the schedule
 * can never drift apart: five stages x 10s, i.e. the booking is resolved as
 * "no driver found" at ~50s if nobody has claimed it.
 */
export const SEARCH_MAX_DURATION_MS =
    SEARCH_STAGE_INTERVAL_MS * SEARCH_RADII_KM.length;

/**
 * Cadence of the sweep that advances searches / expires them. Faster than the
 * stage interval so a sweep always finds the stage it is due for.
 */
export const SEARCH_SWEEP_INTERVAL_MS = 5_000;
