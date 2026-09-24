/**
 * Bounded driver-search lifecycle. The main API is the single owner of the
 * search lifecycle (DB is authoritative); Redis only tracks per-booking search
 * progress and notified drivers.
 *
 * Schedule (per booking, t = seconds since creation):
 *   t=0..15    → SEARCH_RADII_KM[0] = 5 km
 *   t=15..30   → SEARCH_RADII_KM[1] = 8 km
 *   t=30..45   → SEARCH_RADII_KM[2] = 12 km
 *   t=45..60   → SEARCH_RADII_KM[3] = 15 km
 *   t>=60      → search expires → the booking is cancelled (no_driver_found)
 */
export const SEARCH_RADII_KM = [5, 8, 12, 15] as const;

/** Delay between consecutive search attempts (the driver request card also
 *  auto-expires after ~15s client-side, so each attempt gets one full window). */
export const SEARCH_STAGE_INTERVAL_MS = 15_000;

/** Total search window; after this the booking is cancelled (no_driver_found). */
export const SEARCH_MAX_DURATION_MS =
    SEARCH_STAGE_INTERVAL_MS * SEARCH_RADII_KM.length;

/** Cadence of the sweep that advances searches / expires them. */
export const SEARCH_SWEEP_INTERVAL_MS = 5_000;