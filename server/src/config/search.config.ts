/**
 * Bounded driver-search lifecycle. The main API is the single owner of the
 * search lifecycle (DB is authoritative); Redis only tracks per-booking search
 * progress and notified drivers.
 *
 * Schedule (per booking, t = seconds since creation):
 *   t=0..5     → 5 km
 *   t=5..10    → 10 km
 *   t=10..15   → 15 km
 *   t=15..20   → 20 km
 *   t>=20      → final retry window, then no_driver_found cancellation
 */
export const SEARCH_RADII_KM = [5, 10, 15, 20] as const;

/** Delay between consecutive search attempts. */
export const SEARCH_STAGE_INTERVAL_MS = 5_000;

/** Total search window before the final notification retry grace period. */
export const SEARCH_MAX_DURATION_MS =
    SEARCH_STAGE_INTERVAL_MS * SEARCH_RADII_KM.length;

export const SEARCH_FINAL_RETRY_GRACE_MS = SEARCH_STAGE_INTERVAL_MS;

/** Cadence of the sweep that advances searches / expires them. */
export const SEARCH_SWEEP_INTERVAL_MS = 5_000;