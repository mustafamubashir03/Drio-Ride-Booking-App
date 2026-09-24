import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRoute, type RouteResult, type SelectedLocation } from "@/lib/places-api";
import { haversineMeters } from "@/lib/vehicle-position";

/**
 * A driver must move at least this far from the coordinate used for the last
 * route request before a reroute is even considered. GPS accuracy is tens of
 * meters and our fixes arrive every ~3s, so 150m absorbs jitter while still
 * capturing a meaningfully better route when the driver actually detours.
 */
export const NAV_REROUTE_MIN_MOVE_M = 150;

/**
 * Minimum wall-clock gap between two route requests for a given leg. With a
 * 3s cadence a fast driver would otherwise cross the 150m threshold every few
 * fixes; 15s bounds the rate to ~4 requests/minute at most, well clear of any
 * OSRM request storm.
 */
export const NAV_REROUTE_MIN_INTERVAL_MS = 15000;

export type NavigationRouteStatus = "idle" | "loading" | "success" | "error";
export type NavigationPhase = "arriving" | "in_progress";

interface UseNavigationRouteOptions {
  /** Derived from the authoritative booking status; null disables routing. */
  phase: NavigationPhase | null;
  /** Live driver fix (Bucket 1). */
  origin: { latitude: number; longitude: number } | null;
  /** Fixed navigation target for the current leg (pickup or destination). */
  target: SelectedLocation | null;
}

/**
 * Controlled rerouting for the driver navigation leg. The route target is
 * fixed for the leg; the origin is the live driver position. Requests are
 * issued only when the driver has moved a meaningful distance past the last
 * requested coordinate AND the minimum interval has elapsed AND no request is
 * already in flight. A movement observed while a request is in flight sets a
 * pending flag so the freshest position is rerouted as soon as it completes.
 * A request-sequence guard ensures an older response can never overwrite a
 * newer route.
 */
export function useNavigationRoute({ phase, origin, target }: UseNavigationRouteOptions) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<NavigationRouteStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const seq = useRef(0);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const lastRequest = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const latestOrigin = useRef<{ lat: number; lng: number } | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  const phaseKey = phase;
  const targetKey = target ? `${target.latitude},${target.longitude}` : null;

  // New leg (phase or target changed, or phase disabled): reset guards, drop
  // any in-flight result, and clear the previous leg's polyline immediately so
  // a stale DRIVER→FROM route never lingers while a DRIVER→TO reroute resolves.
  useEffect(() => {
    seq.current += 1;
    inFlight.current = false;
    pending.current = false;
    lastRequest.current = null;
    latestOrigin.current = null;
    setRoute(null);
    setStatus("idle");
    setError(null);
  }, [phaseKey, targetKey]);

  const requestRoute = useCallback(async (from: { lat: number; lng: number }) => {
    const targetNow = targetRef.current;
    if (!phaseKey || !targetNow) return;
    inFlight.current = true;
    const mySeq = ++seq.current;
    const ts = Date.now();
    lastRequest.current = { lat: from.lat, lng: from.lng, ts };
    setStatus("loading");
    try {
      const result = await fetchRoute(
        { name: "", latitude: from.lat, longitude: from.lng },
        targetNow
      );
      if (mySeq !== seq.current) return;
      setRoute(result);
      setStatus("success");
      setError(null);
    } catch (e) {
      if (mySeq !== seq.current) return;
      setRoute(null);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not calculate a route right now.");
    } finally {
      if (mySeq !== seq.current) return;
      inFlight.current = false;
      if (pending.current) {
        pending.current = false;
        const fresh = latestOrigin.current;
        if (
          fresh &&
          haversineMeters(
            lastRequest.current!.lat,
            lastRequest.current!.lng,
            fresh.lat,
            fresh.lng
          ) >= NAV_REROUTE_MIN_MOVE_M
        ) {
          void requestRoute(fresh);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  const requestRouteRef = useRef(requestRoute);
  requestRouteRef.current = requestRoute;

  // Watches every live fix; the gates decide whether a request is worth making.
  useEffect(() => {
    if (!phaseKey || !targetKey || !origin) return;
    const coord = { lat: origin.latitude, lng: origin.longitude };
    latestOrigin.current = coord;

    if (inFlight.current) {
      // Driver moved while a request is in flight; reroute once it completes.
      pending.current = true;
      return;
    }

    const last = lastRequest.current;
    if (!last) {
      // First fix of the leg: route immediately, no interval wait.
      void requestRouteRef.current(coord);
      return;
    }
    const moved = haversineMeters(last.lat, last.lng, coord.lat, coord.lng);
    const elapsedMs = Date.now() - last.ts;
    if (moved >= NAV_REROUTE_MIN_MOVE_M && elapsedMs >= NAV_REROUTE_MIN_INTERVAL_MS) {
      void requestRouteRef.current(coord);
    }
    // otherwise: throttled — the last route is still a good fit.
  }, [phaseKey, targetKey, origin?.latitude, origin?.longitude]);

  // Invalidate any in-flight response if the component unmounts.
  useEffect(() => {
    return () => {
      seq.current += 1;
    };
  }, []);

  return { route, status, error };
}