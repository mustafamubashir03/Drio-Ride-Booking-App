export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function wrapSigned180(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180
}

export function shortestHeadingDelta(target: number, current: number): number {
  return wrapSigned180(target - current)
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = Math.PI / 180
  const phi1 = lat1 * toRad
  const phi2 = lat2 * toRad
  const dLng = (lng2 - lng1) * toRad
  const y = Math.sin(dLng) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng)
  const angle = (Math.atan2(y, x) * 180) / Math.PI
  return angle < 0 ? angle + 360 : angle
}

export function smoothingFactor(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-dtMs / tauMs)
}

export interface VehicleFix {
  lat: number
  lng: number
}

export interface VehicleHeadingInput {
  /** Device GPS heading (degrees, clockwise from north). Null when unavailable. */
  heading: number | null
  speed: number | null
  /** Last trusted coordinate fix, used for the bearing fallback. */
  prevFix: VehicleFix | null
  /** The current coordinate fix. */
  nextFix: VehicleFix
  /** Last heading shown on the marker, kept when movement is negligible. */
  displayHeading: number | null
  /** Last heading we were animating toward. */
  targetHeading: number | null
  noiseThresholdM: number
  /** Minimum speed (m/s) at which a finite device heading is considered valid. */
  minSpeedMps: number
}

/**
 * Decides what heading the marker should animate toward for a new GPS fix.
 *
 * Priority:
 *  1. A finite device GPS heading (only meaningful while the vehicle moves;
 *     the Geolocation API reports null heading when static).
 *  2. The bearing from the previous trusted fix to this fix (only when the
 *     fix actually moved at least `noiseThresholdM`).
 *  3. The last reliable heading (negligible/noisy movement).
 */
export function computeTargetHeading(input: VehicleHeadingInput): number {
  const { heading, speed, prevFix, nextFix, displayHeading, targetHeading, noiseThresholdM, minSpeedMps } = input
  if (
    heading !== null &&
    Number.isFinite(heading) &&
    (speed === null || speed >= minSpeedMps)
  ) {
    return normalizeHeading(heading)
  }
  if (
    prevFix !== null &&
    haversineMeters(prevFix.lat, prevFix.lng, nextFix.lat, nextFix.lng) >= noiseThresholdM
  ) {
    return bearingDegrees(prevFix.lat, prevFix.lng, nextFix.lat, nextFix.lng)
  }
  if (displayHeading !== null) return displayHeading
  if (targetHeading !== null) return targetHeading
  return 0
}

export interface VehicleDisplay {
  lat: number
  lng: number
  heading: number
}

export interface VehicleTarget {
  lat: number
  lng: number
  heading: number
}

/**
 * Advances the displayed marker position/heading by one animation step and
 * returns the shortest signed heading delta applied (for wrap verification).
 */
export function stepVehicleAnimation(
  display: VehicleDisplay,
  target: VehicleTarget,
  dtMs: number,
  positionTauMs = 160,
  headingTauMs = 180,
): { done: boolean; headingDelta: number } {
  const moveK = smoothingFactor(dtMs, positionTauMs)
  const turnK = smoothingFactor(dtMs, headingTauMs)
  display.lat += (target.lat - display.lat) * moveK
  display.lng += (target.lng - display.lng) * moveK
  const headingDelta = shortestHeadingDelta(target.heading, display.heading)
  display.heading = normalizeHeading(display.heading + headingDelta * turnK)

  const positionDone =
    Math.abs(target.lat - display.lat) < 1e-9 &&
    Math.abs(target.lng - display.lng) < 1e-9
  const headingDone =
    Math.abs(shortestHeadingDelta(target.heading, display.heading)) < 0.01
  return { done: positionDone && headingDone, headingDelta }
}