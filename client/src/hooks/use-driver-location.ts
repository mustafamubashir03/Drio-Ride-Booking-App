import { useCallback, useEffect, useRef, useState } from "react";

export type DriverLocationPermission =
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "unavailable";

export type DriverLocationState = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number | null;
  tracking: boolean;
  permission: DriverLocationPermission;
  error: string | null;
};

export type DriverLocationController = {
  start: () => void;
  stop: () => void;
};

const INITIAL_STATE: DriverLocationState = {
  latitude: null,
  longitude: null,
  accuracy: null,
  heading: null,
  speed: null,
  timestamp: null,
  tracking: false,
  permission: "prompt",
  error: null,
};

function errorMessageFor(code: number) {
  switch (code) {
    case 1:
      return "Location permission was denied.";
    case 2:
      return "Location is currently unavailable.";
    case 3:
      return "Location request timed out.";
    default:
      return "Could not get your location.";
  }
}

interface UseDriverLocationOptions {
  onLocationUpdate?: (location: { latitude: number; longitude: number; accuracy: number | null; heading: number | null; speed: number | null; timestamp: number }) => void;
  throttleMs?: number;
}

/**
 * Browser-geolocation wrapper for the driver portal.
 *
 * Streams location to the provided callback for realtime server updates.
 */
export function useDriverLocation(options: UseDriverLocationOptions = {}): DriverLocationState & DriverLocationController {
  const { onLocationUpdate, throttleMs = 3000 } = options;
  const [state, setState] = useState<DriverLocationState>(() => ({
    ...INITIAL_STATE,
    permission:
      typeof navigator !== "undefined" && "geolocation" in navigator
        ? "prompt"
        : "unsupported",
  }));
  const watchIdRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);
  const onLocationUpdateRef = useRef(onLocationUpdate);

  useEffect(() => {
    onLocationUpdateRef.current = onLocationUpdate;
  }, [onLocationUpdate]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, tracking: false }));
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState((prev) => ({ ...prev, permission: "unsupported" }));
      return;
    }
    if (watchIdRef.current !== null) return;

    setState((prev) => ({ ...prev, tracking: true, error: null }));
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        const newState: DriverLocationState = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading:
            coords.heading !== null && Number.isFinite(coords.heading)
              ? coords.heading
              : null,
          speed:
            coords.speed !== null && Number.isFinite(coords.speed)
              ? coords.speed
              : null,
          timestamp: position.timestamp,
          tracking: true,
          permission: "granted",
          error: null,
        };
        setState(newState);

        // Throttled location emission to socket server
        const now = Date.now();
        if (onLocationUpdateRef.current && now - lastEmitRef.current >= throttleMs) {
          lastEmitRef.current = now;
          onLocationUpdateRef.current({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            heading: newState.heading,
            speed: newState.speed,
            timestamp: position.timestamp,
          });
        }
      },
      (error) => {
        setState((prev) => ({
          ...prev,
          permission: error.code === 1 ? "denied" : "unavailable",
          error: errorMessageFor(error.code),
          tracking: false,
        }));
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
  }, [throttleMs]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { ...state, start, stop };
}