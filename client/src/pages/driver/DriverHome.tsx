import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import Map from "@/components/Map";
import MobileSheet from "@/components/MobileSheet";
import LocationPermission from "@/components/LocationPermission";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRoute } from "@/hooks/use-route";
import { useNavigationRoute } from "@/hooks/use-navigation-route";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { MotionPage } from "@/motion/MotionPage";
import { AnimatePresence, motion } from "motion/react";
import { motionStateProps, useMotionSystem } from "@/motion/use-motion";
import type { DriverDashboardContext } from "./DriverLayout";
import {
  useDriverActiveRideQuery,
  useDriverAvailabilityQuery,
  useDriverEarningsQuery,
  useDriverRatingQuery,
  useSetDriverAvailabilityMutation,
  useTransitionDriverRideMutation,
} from "@/hooks/queries/use-driver";
import {
  DRIVER_RIDE_STATUS_LABEL,
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
LocateFixed,
MapPin,
  Navigation,
  Power,
  Radio,
  RefreshCcw,
  Star,
  Warehouse,
} from "lucide-react";

type RideAction = { key: DriverRideAction; label: string; variant: "default" | "outline" | "secondary" | "destructive" } | null;

function actionForStatus(status: DriverRide["status"]): RideAction {
  switch (status) {
    case "pending":
      return { key: "accept", label: "Accept ride", variant: "default" };
    case "confirmed":
      return { key: "arriving", label: "I'm Arriving", variant: "secondary" };
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

const statusBadgeStyles: Record<DriverRide["status"], string> = {
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-500",
  confirmed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  arriving: "border-drio-blue/25 bg-drio-blue/10 text-drio-blue",
  arrived: "border-primary/25 bg-primary/10 text-primary",
  in_progress: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  completed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  cancelled: "border-destructive/25 bg-destructive/10 text-destructive",
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
  const { data: session } = authClient.useSession();
  const driverId = (session as unknown as { user?: { id?: string } })?.user?.id;
  const { page, stagger, reduced } = useMotionSystem();
  const { connected, connect, disconnect, emitLocation, rideRefreshKey } = useOutletContext<DriverDashboardContext>();
  // Stable driver server data. Availability, the active ride, earnings and the
  // rating aggregate are all REST reads that change when this driver acts, so
  // they are cached. Realtime concerns stay out of here: GPS and the socket
  // connection come from useDriverLocation / the dashboard context, and the ride
  // lifecycle is driven by explicit transitions plus a refetch, never by a
  // location packet.
  const {
    data: availability,
    isPending: availabilityLoading,
    error: availabilityErrorRaw,
    refetch: refetchAvailability,
  } = useDriverAvailabilityQuery();
  const availabilityError =
    availabilityErrorRaw instanceof Error ? availabilityErrorRaw.message : null;
  const availabilityMutation = useSetDriverAvailabilityMutation();

  const {
    data: activeRide = null,
    isPending: activeLoading,
    error: activeErrorRaw,
    refetch: refetchActiveRide,
  } = useDriverActiveRideQuery();
  const activeError = activeErrorRaw instanceof Error ? activeErrorRaw.message : null;

  // Transient snapshot of the ride that just finished, for the confirmation
  // panel. Not a server resource, so it stays local state.
  const [completedRide, setCompletedRide] = useState<DriverRide | null>(null);
  const { data: summary, refetch: refetchSummary } = useDriverEarningsQuery();
  const {
    data: rating,
    isPending: ratingPending,
    isError: ratingFailed,
    isSuccess: ratingLoaded,
    refetch: refetchRating,
  } = useDriverRatingQuery();
  const transitionMutation = useTransitionDriverRideMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  // GPS stays outside React Query entirely: it is a realtime stream pushed over
  // the socket on a throttle, not server state that can be cached or invalidated.
  const location = useDriverLocation({
    onLocationUpdate: (loc) => {
      if (driverId) {
        emitLocation({
          driverId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          heading: loc.heading,
          speed: loc.speed,
          timestamp: loc.timestamp,
        });
      }
    },
    throttleMs: 3000,
  });
  const startLocation = location.start;

  const from: SelectedLocation | null = useMemo(
    () => (activeRide ? toLocation(activeRide.source) : null),
    [activeRide],
  );
  const to: SelectedLocation | null = useMemo(
    () => (activeRide ? toLocation(activeRide.destination) : null),
    [activeRide],
  );

  // Static route for FROM→TO display when NOT in active navigation (confirmed, arrived, etc.)
  const { route: staticRoute, status: routeStatus, error: routeError } = useRoute(from, to);

  // Determine navigation phase and target from booking status. Once a ride is
  // confirmed the driver navigates to the pickup (DRIVER→FROM); after the trip
  // starts the target switches to the destination (DRIVER→TO).
  const navPhase = activeRide
    ? (activeRide.status === "confirmed" || activeRide.status === "arriving")
      ? "arriving"
      : activeRide.status === "in_progress"
      ? "in_progress"
      : null
    : null;

  const navTarget = activeRide
    ? (activeRide.status === "confirmed" || activeRide.status === "arriving")
      ? from
      : activeRide.status === "in_progress"
      ? to
      : null
    : null;

  const driverOrigin = location.latitude !== null && location.longitude !== null
    ? { latitude: location.latitude, longitude: location.longitude }
    : null;

  // Dynamic navigation route for arriving/in_progress phases
  const { route: navRoute, status: navRouteStatus, error: navRouteError } = useNavigationRoute({
    phase: navPhase,
    origin: driverOrigin,
    target: navTarget,
  });

  // Active route to display: navRoute during active navigation, otherwise staticRoute.
  // When navigating but no nav polyline has resolved yet, keep the card honest by
  // showing "—" instead of falling back to the FROM→TO leg (which belongs to a different phase).
  const displayRoute = navPhase ? navRoute : staticRoute;
  const displayRouteStatus = navPhase ? navRouteStatus : routeStatus;
  const displayRouteError = navPhase ? navRouteError : routeError;

  // ETA label must reflect the phase: pickup leg while navigating to pickup,
  // destination leg while en route, and plain trip time otherwise (never an
  // active estimate once the navigation leg is over).
  const etaLabel =
    navPhase === "arriving"
      ? "ETA to pickup"
      : navPhase === "in_progress"
        ? "ETA to destination"
        : "Trip time";

  // Stable phase ID for Map camera fitting (only fit once per phase)
  const navPhaseId = navPhase ? `${navPhase}-${activeRide?._id}` : null;

  const activeRideNeedsLocation =
    activeRide !== null && activeRide.status !== "completed" && activeRide.status !== "cancelled";

  useEffect(() => {
    if (!activeRideNeedsLocation) return;
    startLocation();
    if (!connected) connect();
  }, [activeRideNeedsLocation, connected, connect, startLocation]);

  useEffect(() => {
    // GPS acquisition starts for online dispatch and remains active whenever
    // an accepted ride needs navigation, even if availability changes.
    if (availability?.status === "online") startLocation();
  }, [availability?.status, startLocation]);

  // The context bumps rideRefreshKey when the driver accepts a ride mid-session
  // (ride card + nav need the fresh booking state immediately).
useEffect(() => {
    if (rideRefreshKey > 0) {
      const refresh = setTimeout(() => void refetchActiveRide(), 0);
      return () => clearTimeout(refresh);
    }
  }, [rideRefreshKey, refetchActiveRide]);

  // Returning to the tab is the moment the ride card most often goes stale
  // (a ride may have been accepted/advanced from another session or tab).
  useEffect(() => {
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void refetchActiveRide();
        void refetchSummary();
        void refetchRating();
      }, 0);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // Existing rating refresh cadence, preserved: the aggregate moves slowly
    // but a passenger review can land at any time.
    const ratingInterval = window.setInterval(() => void refetchRating(), 30000);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(ratingInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetchActiveRide, refetchSummary, refetchRating]);


  const handleToggleAvailability = async () => {
    const next = availability?.status === "online" ? "offline" : "online";
    try {
      // The mutation writes the new availability into the cache, so the toggle
      // reflects the server's answer rather than an optimistic guess.
      await availabilityMutation.mutateAsync(next);
      if (next === "online") {
        location.start();
        connect();
      } else if (!activeRide) {
        location.stop();
        disconnect();
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not update your status."
      );
    }
  };

  const handleRideAction = async () => {
    if (!activeRide) return;
    const action = actionForStatus(activeRide.status);
    if (!action) return;
    setActionError(null);
    try {
      const updated = await transitionMutation.mutateAsync({
        bookingId: activeRide._id,
        action: action.key,
      });
      if (updated.status === "completed") {
        setCompletedRide(updated);
      } else if (updated.status === "cancelled") {
        setCompletedRide(null);
      }
      // The mutation has already refreshed the active ride, the ride history and
      // the earnings, so there is nothing to reload by hand here.
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update the ride.");
      void refetchActiveRide();
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
    <MotionPage className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:overflow-hidden">
      {/* The map fills the whole area at every width. At lg the driver panel is
          a floating overlay on top of it rather than a column beside it, so the
          map is never squeezed into a narrow strip. */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-drio-deep">
        <Map
          className="h-full w-full"
          from={from}
          to={to}
          route={staticRoute}
          navRoute={navRoute}
          navPhaseId={navPhaseId}
          driverLocation={driverMarker}
          followDriver={Boolean(navPhaseId)}
        />
      </div>

      {/* Mobile: drag-to-expand sheet over the map. At lg the same DOM becomes
          the fixed side panel, so the driver content is never rendered twice. */}
      <MobileSheet
        peekHeight={240}
        label="Expand or collapse driver panel"
        desktopCollapsible
        desktopCollapseLabel="Collapse panel"
        desktopExpandLabel="Show panel"
        desktopTitle={online ? "You are online" : "You are offline"}
        desktopClassName="lg:pointer-events-auto lg:absolute lg:inset-y-4 lg:left-4 lg:right-auto lg:z-20 lg:flex lg:w-[min(24rem,32vw)] lg:max-w-[24rem] lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border/70 lg:bg-background/95 lg:shadow-[0_18px_50px_rgba(0,0,0,0.42)] lg:backdrop-blur-md"
        contentClassName="p-4 lg:p-5"
        peekHint={
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            {online ? "You are online" : "You are offline"}
          </p>
        }
      >
          <AnimatePresence mode="wait">
            {availabilityLoading || activeLoading ? (
              <motion.div
                {...motionStateProps({ variants: page, reduced })}
                key="loading"
                className="rounded-xl border border-border bg-card px-4 py-8 text-center"
              >
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary motion-reduce:animate-none" />
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Loading your driver status…
                </p>
              </motion.div>
            ) : availabilityError ? (
              <motion.div
                {...motionStateProps({ variants: page, reduced })}
                key="error"
                className="rounded-xl border border-border bg-card px-4 py-6 text-center"
              >
                <p className="text-[13px] font-semibold text-destructive">
                  Could not load your driver status
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{availabilityError}</p>
                <Button size="sm" className="mt-4" onClick={() => void refetchAvailability()}>
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </motion.div>
            ) : (
              <motion.div
                {...motionStateProps({ variants: page, reduced })}
                key="content"
                className="space-y-5"
              >
              {/* Online/offline */}
              <div className="rounded-2xl border border-border bg-card p-4 transition-colors duration-200">
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
                    className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${online
                        ? "border-drio-success/25 bg-drio-success/10 text-drio-success"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-500"
                      }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${online
                          ? "bg-drio-success animate-pulse motion-reduce:animate-none"
                          : "bg-amber-500/80"
                        }`}
                    />
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <Button
                  variant={online ? "destructive" : "default"}
                  className="mt-4 w-full hover:scale-[1.01] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                  onClick={() => void handleToggleAvailability()}
                  disabled={availabilityMutation.isPending}
                >
                  <Power className="h-4 w-4" />
                  {availabilityMutation.isPending
                    ? "Updating…"
                    : online
                      ? "Go offline"
                      : "Go online"}
                </Button>
                {availabilityError && (
                  <p className="mt-2 rounded-lg bg-destructive/8 px-2.5 py-1.5 text-[12px] text-destructive">{availabilityError}</p>
                )}
              </div>

              {/* Location readout */}
              <div className="rounded-2xl border border-border bg-card p-4 transition-colors duration-200">
                <div className="flex items-center gap-2">
                  <LocateFixed className="h-4 w-4 text-drio-blue" />
                  <p className="text-[13px] font-semibold text-foreground">Live location</p>
                </div>
                <div className="mt-3 space-y-1 rounded-xl border border-border bg-muted/25 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">Tracking</p>
                    <p className="text-[12px] font-semibold tabular-nums text-foreground">
                      {isTracking ? (
                        <>
                          <span className="text-drio-success">●</span> Active
                          {location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ""}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Idle</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">Position</p>
                    <p className="max-w-[220px] truncate text-right text-[12px] font-medium tabular-nums text-foreground">
                      {location.latitude !== null && location.longitude !== null
                        ? formatCoordinates(location.latitude, location.longitude)
                        : "—"}
                    </p>
                  </div>
                </div>
                {/* Explains the permission state instead of showing a bare
                    error string. Calls the existing location.start handler, so
                    the Geolocation API behaviour is unchanged. */}
                {!isTracking && (
                  <LocationPermission
                    className="mt-3"
                    state={
                      location.permission === "granted"
                        ? "loading"
                        : location.permission === "prompt"
                          ? "prompt"
                          : location.permission
                    }
                    onRequest={location.start}
                  />
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 transition-colors duration-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                     <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">Driver rating</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {ratingPending
                          ? "Loading rating…"
                          : ratingFailed
                            ? "Could not load your rating"
                            : rating?.count
                              ? `Based on ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`
                              : "No passenger ratings yet"}
                      </p>
                    </div>
                  </div>
                  {ratingFailed ? (
                      <button
                        type="button"
                        onClick={() => void refetchRating()}
                        className="-mx-1 shrink-0 rounded-md px-1 py-0.5 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                      Retry
                    </button>
                  ) : (
                    <p className="shrink-0 text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                      {ratingLoaded && rating?.average != null ? rating.average.toFixed(1) : "—"}
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">/ 5</span>
                    </p>
                  )}
                </div>
              </div>

              <p className="flex items-start gap-2 rounded-xl border border-dashed border-border/80 bg-muted/25 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground transition-colors duration-200">
                <CircleDotDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                 Go online to receive nearby ride requests. Accepted rides appear here automatically.
              </p>

              {activeError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] font-medium text-destructive">
                  {activeError}
                </p>
              )}

              {/* Active ride card */}
              <AnimatePresence mode="wait">
                {activeRide ? (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="active"
                    className="space-y-4"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Active ride
                    </p>
                  <div className="rounded-2xl border border-border bg-card p-4 transition-colors duration-200">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-foreground">Ride request</p>
                      <Badge
                        variant="outline"
                         className={`font-semibold ${statusBadgeStyles[activeRide.status]}`}
                      >
                        {DRIVER_RIDE_STATUS_LABEL[activeRide.status]}
                      </Badge>
                    </div>

                    {activeRide.passenger && (
                      <div className="mt-3 flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-muted/25 px-3 py-2.5">
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

                    <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Pickup</p>
                          <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                            {formatPlace(activeRide.source)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-drio-blue" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Drop-off</p>
                          <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                            {formatPlace(activeRide.destination)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-border/80 bg-muted/35 px-3 py-2.5 transition-colors duration-200">
                        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Distance</p>
                        <p className="mt-0.5 text-[13px] font-semibold leading-tight tabular-nums text-foreground">
                          {displayRoute
                            ? formatDistance(displayRoute.distance)
                            : activeRide.distance
                            ? formatDistance(activeRide.distance)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/80 bg-muted/35 px-3 py-2.5 transition-colors duration-200">
                        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{etaLabel}</p>
                        <p className="mt-0.5 text-[13px] font-semibold leading-tight tabular-nums text-foreground">
                          {displayRoute ? formatDuration(displayRoute.duration) : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/80 bg-muted/35 px-3 py-2.5 transition-colors duration-200">
                        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Fare</p>
                        <p className="mt-0.5 text-[13px] font-semibold leading-tight tabular-nums text-foreground">
                          {formatFare(activeRide.fare)}
                        </p>
                      </div>
                    </div>

                    {displayRouteStatus === "loading" && (
                      <p className="mt-3 text-[11px] text-muted-foreground">Calculating route…</p>
                    )}
                    {displayRouteStatus === "error" && (
                      <p className="mt-3 text-[11px] text-destructive">
                        {displayRouteError ?? "Could not calculate a route."}
                      </p>
                    )}

                    <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] text-muted-foreground">
                      Booking ID{" "}
                      <span className="font-mono text-foreground/80">{activeRide._id}</span>
                    </p>
                  </div>

                  {actionForStatus(activeRide.status) && (
                    <Button
                      className="w-full rounded-2xl hover:scale-[1.01] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                      variant={actionForStatus(activeRide.status)!.variant}
                      size="lg"
                      onClick={() => void handleRideAction()}
                      disabled={transitionMutation.isPending}
                    >
                      <Radio className="h-4 w-4" />
                      {transitionMutation.isPending
                        ? "Updating…"
                        : actionForStatus(activeRide.status)!.label}
                    </Button>
                  )}
                  {actionError && <p className="mt-2 rounded-lg bg-destructive/8 px-2.5 py-1.5 text-[12px] text-destructive">{actionError}</p>}
                  </motion.div>
                ) : (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="none"
                    className="flex items-start gap-2 rounded-xl border border-dashed border-border/80 bg-muted/25 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground transition-colors duration-200"
                  >
                    <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-drio-violet" />
                    No active ride. You can accept a requested ride once it has been
                    assigned to you.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Completion summary */}
              <AnimatePresence>
                {completedRide && (
                  <motion.div
                    {...motionStateProps({ variants: page, reduced })}
                    key="completed"
                    className="rounded-2xl border border-drio-success/25 bg-drio-success/5 p-4 transition-colors duration-200"
                  >
                    <p className="text-[15px] font-semibold tracking-tight text-foreground">Trip completed</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Fare {formatFare(completedRide.fare)} for a{" "}
                      {formatDistance(completedRide.distance)} trip has been counted
                      toward your earnings.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full hover:scale-[1.01] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                      onClick={() => setCompletedRide(null)}
                    >
                      Done
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Today's activity */}
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
                  Today&apos;s activity
                </p>
                <motion.div
                  className="grid grid-cols-2 gap-2.5"
                  variants={stagger.container}
                  initial={reduced ? false : "hidden"}
                  animate={reduced ? undefined : "visible"}
                >
                  <motion.div variants={stagger.item}>
                    <div className="rounded-2xl border border-border bg-muted/25 p-4 transition-colors duration-200">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Trips</p>
                      <p className="mt-1 text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                        {summary?.today.rides ?? 0}
                      </p>
                    </div>
                  </motion.div>
                  <motion.div variants={stagger.item}>
                    <div className="rounded-2xl border border-border bg-muted/25 p-4 transition-colors duration-200">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Earnings</p>
                      <p className="mt-1 text-[18px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                        {formatFare(summary?.today.total ?? 0)}
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
      </MobileSheet>

    </MotionPage>
  );
}
