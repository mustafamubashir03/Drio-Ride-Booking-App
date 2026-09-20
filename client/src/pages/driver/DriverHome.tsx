import { useEffect, useRef, useState } from "react";
import Map from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRoute } from "@/hooks/use-route";
import { useDriverLocation } from "@/hooks/use-driver-location";
import {
  fetchDriverActiveRide,
  fetchDriverAvailability,
  fetchDriverEarnings,
  setDriverAvailability,
  transitionDriverRide,
  DRIVER_RIDE_STATUS_LABEL,
  type DriverAvailability,
  type DriverEarningsSummary,
  type DriverRide,
  type DriverRideAction,
} from "@/lib/driver-api";
import type { SelectedLocation } from "@/lib/places-api";
import {
  formatCoordinates,
  formatDistance,
  formatDuration,
  formatFare,
  formatPlace,
} from "@/lib/format";
import {
  CircleDotDashed,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  Power,
  Radio,
  RefreshCcw,
  Warehouse,
} from "lucide-react";

type RideAction = { key: DriverRideAction; label: string; variant: "default" | "outline" | "secondary" | "destructive" } | null;

function actionForStatus(status: DriverRide["status"]): RideAction {
  switch (status) {
    case "pending":
      return { key: "accept", label: "Accept ride", variant: "default" };
    case "confirmed":
      return { key: "arriving", label: "I'm on my way", variant: "secondary" };
    case "arriving":
      return { key: "arrived", label: "I've arrived", variant: "secondary" };
    case "arrived":
      return { key: "start", label: "Start trip", variant: "secondary" };
    case "in_progress":
      return { key: "complete", label: "Complete ride", variant: "default" };
    default:
      return null;
  }
}

const statusBadgeStyles: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  confirmed: "bg-drio-success/15 text-drio-success border-drio-success/25",
  arriving: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  arrived: "bg-primary/15 text-primary border-primary/25",
  in_progress: "bg-drio-success/15 text-drio-success border-drio-success/25",
  completed: "bg-primary/15 text-primary border-primary/25",
  cancelled: "bg-muted/40 text-muted-foreground border-border",
};

function toLocation(place: DriverRide["source"]): SelectedLocation {
  return {
    name: place.name ?? "",
    displayName: place.displayName ?? undefined,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export default function DriverHome() {
  const [availability, setAvailability] = useState<DriverAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilitySubmitting, setAvailabilitySubmitting] = useState(false);

  const [activeRide, setActiveRide] = useState<DriverRide | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [completedRide, setCompletedRide] = useState<DriverRide | null>(null);
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const location = useDriverLocation();
  const loadSeq = useRef(0);

  const from: SelectedLocation | null = activeRide ? toLocation(activeRide.source) : null;
  const to: SelectedLocation | null = activeRide ? toLocation(activeRide.destination) : null;
  const { route, status: routeStatus, error: routeError } = useRoute(from, to);

  const loadAvailability = async () => {
    const seq = ++loadSeq.current;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const value = await fetchDriverAvailability();
      if (seq !== loadSeq.current) return;
      setAvailability(value);
      if (value.status === "online") location.start();
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setAvailability(null);
      setAvailabilityError(e instanceof Error ? e.message : "Could not load your status.");
    } finally {
      if (seq === loadSeq.current) setAvailabilityLoading(false);
    }
  };

  const loadActiveRide = async (keepLoading = false) => {
    const seq = ++loadSeq.current;
    if (!keepLoading) setActiveLoading(true);
    setActiveError(null);
    try {
      const ride = await fetchDriverActiveRide();
      if (seq !== loadSeq.current) return;
      setActiveRide(ride);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setActiveError(e instanceof Error ? e.message : "Could not load your active ride.");
    } finally {
      if (seq === loadSeq.current) setActiveLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const earnings = await fetchDriverEarnings();
      setSummary(earnings);
    } catch {
      setSummary(null);
    }
  };

  useEffect(() => {
    void loadAvailability();
    void loadActiveRide();
    void loadSummary();
    // Automatically request location permission on mount — once granted, the
    // driver's live position is tracked without needing to press any button.
    location.start();
    // run once on mount; explicit refresh buttons re-run these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleAvailability = async () => {
    const next = availability?.status === "online" ? "offline" : "online";
    setAvailabilitySubmitting(true);
    setAvailabilityError(null);
    try {
      const updated = await setDriverAvailability(next);
      setAvailability(updated);
      if (next === "online") location.start();
      else location.stop();
    } catch (e) {
      setAvailabilityError(e instanceof Error ? e.message : "Could not update your status.");
    } finally {
      setAvailabilitySubmitting(false);
    }
  };

  const handleRideAction = async () => {
    if (!activeRide) return;
    const action = actionForStatus(activeRide.status);
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const updated = await transitionDriverRide(activeRide._id, action.key);
      if (updated.status === "completed") {
        setActiveRide(null);
        setCompletedRide(updated);
        void loadSummary();
      } else if (updated.status === "cancelled") {
        setActiveRide(null);
        setCompletedRide(null);
      } else {
        setActiveRide(updated);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update the ride.");
    } finally {
      setActionBusy(false);
    }
  };

  const isTracking = location.tracking && location.latitude !== null;
  const driverMarker =
    location.latitude !== null && location.longitude !== null
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
        }
      : null;

  const online = availability?.status === "online";

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-border overflow-y-auto">
        <div className="flex-1 p-6 space-y-5">
          {availabilityLoading || activeLoading ? (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
              <p className="mt-3 text-[13px] text-muted-foreground">
                Loading your driver status…
              </p>
            </div>
          ) : availabilityError ? (
            <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
              <p className="text-[13px] font-semibold text-destructive">
                Could not load your driver status
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{availabilityError}</p>
              <Button size="sm" className="mt-4" onClick={() => void loadAvailability()}>
                <RefreshCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Online/offline */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">
                      You are {online ? "online" : "offline"}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {online
                        ? "Ready to accept ride requests when dispatch arrives."
                        : "Go online to start receiving ride requests in your area."}
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 rounded-full px-3 py-1 text-[11px] font-semibold ${online
                        ? "bg-drio-success/15 text-drio-success"
                        : "bg-amber-500/15 text-amber-500"
                      }`}
                  >
                    {online ? "● Online" : "○ Offline"}
                  </span>
                </div>
                <Button
                  variant={online ? "destructive" : "default"}
                  className="mt-4 w-full"
                  onClick={() => void handleToggleAvailability()}
                  disabled={availabilitySubmitting}
                >
                  <Power className="h-4 w-4" />
                  {availabilitySubmitting
                    ? "Updating…"
                    : online
                      ? "Go offline"
                      : "Go online"}
                </Button>
                {availabilityError && (
                  <p className="mt-2 text-[12px] text-destructive">{availabilityError}</p>
                )}
              </div>

              {/* Location readout */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <LocateFixed className="h-4 w-4 text-drio-blue" />
                  <p className="text-[13px] font-semibold text-foreground">Live location</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">Tracking</p>
                  <p className="text-[13px] font-semibold text-foreground">
                    {isTracking
                      ? `● Active${location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ""}`
                      : "Idle"}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">Position</p>
                  <p className="max-w-[220px] truncate text-[12px] font-medium text-foreground">
                    {location.latitude !== null && location.longitude !== null
                      ? formatCoordinates(location.latitude, location.longitude)
                      : "—"}
                  </p>
                </div>
                {!isTracking &&
                  (location.error ? (
                    <p className="mt-2 text-[12px] text-destructive">{location.error}</p>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={location.start}
                      disabled={location.permission === "unsupported"}
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      Start sharing location
                    </Button>
                  ))}
              </div>

              <p className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                <CircleDotDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Dispatch and ride-request matching arrive in a future milestone.
                Accepted rides will appear here automatically.
              </p>

              {activeError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] font-medium text-destructive">
                  {activeError}
                </p>
              )}

              {/* Active ride card */}
              {activeRide ? (
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
                    Active ride
                  </p>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-foreground">Ride request</p>
                      <Badge
                        variant="outline"
                        className={statusBadgeStyles[activeRide.status]}
                      >
                        {DRIVER_RIDE_STATUS_LABEL[activeRide.status]}
                      </Badge>
                    </div>

                    {activeRide.passenger && (
                      <div className="mt-3 flex items-center gap-2.5">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-primary/20 text-primary text-[11px] font-bold">
                            {(activeRide.passenger.name ?? activeRide.passenger.email ?? "P")
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {activeRide.passenger.name ?? "Passenger"}
                          </p>
                          {activeRide.passenger.email && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {activeRide.passenger.email}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pickup</p>
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {formatPlace(activeRide.source)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-drio-blue" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Drop-off</p>
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {formatPlace(activeRide.destination)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distance</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-foreground">
                          {route
                            ? formatDistance(route.distance)
                            : activeRide.distance
                              ? formatDistance(activeRide.distance)
                              : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ETA</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-foreground">
                          {route ? formatDuration(route.duration) : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fare</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-foreground">
                          {formatFare(activeRide.fare)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Booking ID{" "}
                      <span className="font-mono text-foreground/80">{activeRide._id}</span>
                    </p>
                  </div>

                  {actionForStatus(activeRide.status) && (
                    <Button
                      className="w-full rounded-2xl"
                      variant={actionForStatus(activeRide.status)!.variant}
                      size="lg"
                      onClick={() => void handleRideAction()}
                      disabled={actionBusy}
                    >
                      <Radio className="h-4 w-4" />
                      {actionBusy
                        ? "Updating…"
                        : actionForStatus(activeRide.status)!.label}
                    </Button>
                  )}
                  {actionError && <p className="text-[12px] text-destructive">{actionError}</p>}
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                  <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-drio-violet" />
                  No active ride. You can accept a requested ride once it has been
                  assigned to you.
                </p>
              )}

              {/* Completion summary */}
              {completedRide && (
                <div className="rounded-2xl border border-drio-success/25 bg-drio-success/5 p-4">
                  <p className="text-[15px] font-semibold text-foreground">Trip completed</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Fare {formatFare(completedRide.fare)} for a{" "}
                    {formatDistance(completedRide.distance)} trip has been counted
                    toward your earnings.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setCompletedRide(null)}
                  >
                    Done
                  </Button>
                </div>
              )}

              {/* Today's activity */}
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
                  Today&apos;s activity
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-[11px] text-muted-foreground">Trips</p>
                    <p className="mt-1 text-[22px] font-bold text-foreground">
                      {summary?.today.rides ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-[11px] text-muted-foreground">Earnings</p>
                    <p className="mt-1 text-[18px] font-bold text-foreground">
                      {formatFare(summary?.today.total ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Right: map ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="relative flex-1 overflow-hidden bg-drio-deep">
          <Map
            className="h-full w-full"
            from={from}
            to={to}
            route={route}
            driverLocation={driverMarker}
          />
        </div>

        {/* Bottom strip — live ride data only; idle state gives the map full height */}
        {activeRide ? (
          <div className="border-t border-border bg-card px-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  icon: MapPin,
                  label: "Pickup",
                  value: formatPlace(activeRide.source),
                  accent: "text-primary",
                },
                {
                  icon: Navigation,
                  label: "Destination",
                  value: formatPlace(activeRide.destination),
                  accent: "text-drio-blue",
                },
                {
                  icon: Warehouse,
                  label: "Distance",
                  value: route
                    ? formatDistance(route.distance)
                    : activeRide.distance
                      ? formatDistance(activeRide.distance)
                      : "—",
                  accent: "text-drio-violet",
                },
                {
                  icon: Radio,
                  label: "ETA",
                  value: route ? formatDuration(route.duration) : "—",
                  accent: "text-drio-success",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-border">
                      <Icon className={`h-4 w-4 ${item.accent}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="truncate text-[13px] font-semibold text-foreground">{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {routeStatus === "loading" && (
              <p className="mt-3 text-[11px] text-muted-foreground">Calculating route…</p>
            )}
            {routeStatus === "error" && (
              <p className="mt-3 text-[11px] text-destructive">
                {routeError ?? "Could not calculate a route."}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}