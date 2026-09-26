import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import Map from "@/components/Map";
import MobileSheet from "@/components/MobileSheet";
import LocationPermission, { type LocationUiState } from "@/components/LocationPermission";
import PlaceSearchField from "@/components/PlaceSearchField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoute } from "@/hooks/use-route";
import { useNavigationRoute, type NavigationPhase } from "@/hooks/use-navigation-route";
import { usePassengerSocket, type DriverLocationData, type PassengerSearchProgress, type RideStatusUpdateData } from "@/hooks/use-passenger-socket";
import { useQueryClient } from "@tanstack/react-query";
import { type BookingCancelledBy, type BookingDriverInfo, type BookingDriverLocation, type BookingRecord, type BookingStatus, type DriverRatingSummary } from "@/lib/bookings-api";
import { useBookingsQuery, useCancelBookingMutation, useSubmitBookingReviewMutation } from "@/hooks/queries/use-bookings";
import { queryKeys } from "@/lib/query-keys";
import { formatFare } from "@/lib/format";
import { apiFetch } from "@/lib/runtime-config";
import type { PlaceResult, SelectedLocation, RouteResult } from "@/lib/places-api";
import {
  Home,
  History,
  User as UserIcon,
  Clock,
  MapPin,
  Navigation,
  Car,
  LogOut,
  ChevronRight,
  Search,
  CircleDollarSign,
  Star,
  X,
} from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { MotionPage } from "@/motion/MotionPage";
import { AnimatePresence, motion } from "motion/react";
import { motionStateProps, useMotionSystem } from "@/motion/use-motion";
import BottomNav from "@/components/BottomNav";

// Stable empty fallback so the derived history groups keep the same reference
// across renders while the query is still loading.
const EMPTY_BOOKINGS: BookingRecord[] = [];

const navItems = [
  { icon: Home, label: "Home", id: "home", accent: "primary" },
  { icon: History, label: "History", id: "history", accent: "blue" },
  { icon: UserIcon, label: "Account", id: "account", accent: "violet" },
] as const;

type Tab = (typeof navItems)[number]["id"];

const navAccentStyles: Record<
  (typeof navItems)[number]["accent"],
  { button: string; chip: string; ident: string }
> = {
  primary: {
    button: "bg-primary/12 text-primary",
    chip: "bg-primary/15 text-primary",
    ident: "bg-primary",
  },
  blue: {
    button: "bg-drio-blue/12 text-drio-blue",
    chip: "bg-drio-blue/15 text-drio-blue",
    ident: "bg-drio-blue",
  },
  violet: {
    button: "bg-drio-violet/12 text-drio-violet",
    chip: "bg-drio-violet/15 text-drio-violet",
    ident: "bg-drio-violet",
  },
};

const vehicleTypes = [
  { id: "premium", label: "Ride", icon: Car, eta: "4 min", accent: "primary" },
  { id: "suv", label: "Ride XL", icon: Car, eta: "6 min", accent: "blue" },
  { id: "lux", label: "Lux", icon: Car, eta: "9 min", accent: "violet" },
] as const;

const vehicleAccentStyles: Record<
  (typeof vehicleTypes)[number]["accent"],
  { selectedCard: string; iconSelected: string; iconIdle: string }
> = {
  primary: {
    selectedCard: "border-primary/40 bg-primary/10 ring-1 ring-primary/20",
    iconSelected: "text-primary",
    iconIdle: "text-primary/70",
  },
  blue: {
    selectedCard: "border-drio-blue/40 bg-drio-blue/10 ring-1 ring-drio-blue/20",
    iconSelected: "text-drio-blue",
    iconIdle: "text-drio-blue/70",
  },
  violet: {
    selectedCard: "border-drio-violet/40 bg-drio-violet/10 ring-1 ring-drio-violet/20",
    iconSelected: "text-drio-violet",
    iconIdle: "text-drio-violet/70",
  },
};

function Initials({ name, email }: { name?: string; email?: string }) {
  const source = name ?? email ?? "U";
  return source.charAt(0).toUpperCase();
}

function RealtimeBadge({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        connected ? "bg-drio-success/15 text-drio-success" : "bg-amber-500/12 text-amber-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-drio-success" : "bg-amber-500"}`} />
      {connected ? (compact ? "Live" : "Realtime on") : compact ? "Offline" : "Realtime off"}
    </span>
  );
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.round(seconds)} sec`;
  return `${minutes} min`;
}

function formatCoordinates(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "—";
  return `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
}

function formatPlace(place: {
  name?: string;
  displayName?: string;
  latitude: number;
  longitude: number;
}) {
  if (place.displayName || place.name) {
    return place.displayName ?? place.name!;
  }
  return formatCoordinates(place.latitude, place.longitude);
}

function formatTripDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusBadgeStyles: Record<BookingStatus, string> = {
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-500",
  confirmed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  arriving: "border-drio-blue/25 bg-drio-blue/10 text-drio-blue",
  arrived: "border-primary/25 bg-primary/10 text-primary",
  in_progress: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  cancelled: "border-destructive/25 bg-destructive/10 text-destructive",
  completed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
};

const statusIconStyles: Record<BookingStatus, string> = {
  pending: "bg-amber-500/12 text-amber-500",
  confirmed: "bg-drio-success/12 text-drio-success",
  arriving: "bg-drio-blue/12 text-drio-blue",
  arrived: "bg-primary/12 text-primary",
  in_progress: "bg-drio-success/12 text-drio-success",
  cancelled: "bg-destructive/10 text-destructive",
  completed: "bg-drio-success/12 text-drio-success",
};

const cancelReasons = [
  { value: "change_of_plan", label: "Change of plans" },
  { value: "ride_no_longer_needed", label: "Ride no longer needed" },
  { value: "driver_took_too_long", label: "Driver took too long" },
  { value: "wrong_address", label: "Wrong pickup address" },
  { value: "other", label: "Other" },
] as const;

function TripDetailsStrip({
  from,
  to,
  route,
  rideLabel,
}: {
  from: SelectedLocation | null;
  to: SelectedLocation | null;
  route: RouteResult | null;
  rideLabel?: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        {
          label: "Starting point",
          value: from?.displayName ?? from?.name ?? "—",
        },
        {
          label: "Destination",
          value: to?.displayName ?? to?.name ?? "—",
        },
        {
          label: "Distance",
          value: route ? formatDistance(route.distance) : "—",
        },
        {
          label: rideLabel ? "Ride" : "Travel time",
          value:
            rideLabel ?? (route ? formatDuration(route.duration) : "—"),
        },
      ].map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
        >
          <p className="text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 break-words text-[12.5px] font-semibold leading-[1.35] text-foreground">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const { page, stagger, reduced } = useMotionSystem();
  const user = (session as unknown as { user?: { id?: string; name?: string; email?: string; image?: string | null } })?.user;
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [vehicle, setVehicle] = useState<
    (typeof vehicleTypes)[number]["id"]
  >("premium");
  const [rideBooked, setRideBooked] = useState(false);
  const [fromLocation, setFromLocation] = useState<SelectedLocation | null>(null);
  const [toLocation, setToLocation] = useState<SelectedLocation | null>(null);
  const [bookingState, setBookingState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingFare, setBookingFare] = useState<number | null>(null);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(null);
  const [searchProgress, setSearchProgress] = useState<PassengerSearchProgress | null>(null);
  const [bookingDriverId, setBookingDriverId] = useState<string | null>(null);
  const [bookingDriverInfo, setBookingDriverInfo] =
    useState<BookingDriverInfo>(null);
  const [bookingDriverRating, setBookingDriverRating] =
    useState<DriverRatingSummary | null>(null);
  const [driverLocation, setDriverLocation] = useState<BookingDriverLocation>(null);
  const [bookingCancelledAt, setBookingCancelledAt] = useState<string | null>(null);
  const [bookingCancelledBy, setBookingCancelledBy] =
    useState<BookingCancelledBy>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("other");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [bookingFeedback, setBookingFeedback] =
    useState<BookingRecord["feedback"]>({ rating: null, comment: null, reviewedAt: null });
  const [historyReviewId, setHistoryReviewId] = useState<string | null>(null);
  const [historyReviewRating, setHistoryReviewRating] = useState(0);
  const [historyReviewComment, setHistoryReviewComment] = useState("");
  const [historyReviewBusy, setHistoryReviewBusy] = useState(false);
  const [historyReviewError, setHistoryReviewError] = useState<string | null>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  // Which location-permission outcome we are in, so the sheet can explain it
  // instead of leaving the pickup field mysteriously empty. Seeded from
  // navigator so the unsupported case never needs a state write inside an
  // effect body.
  const [locationUi, setLocationUi] = useState<LocationUiState>(() =>
    typeof navigator !== "undefined" && !("geolocation" in navigator)
      ? "unsupported"
      : "prompt",
  );
  // Kept so the sheet's "Allow location" / "Try again" reuses the exact same
  // geolocation call rather than introducing a second code path.
  const requestLocationRef = useRef<(() => void) | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const mobileFieldCleanupRef = useRef<(() => void) | null>(null);
  const fromLocationRef = useRef(fromLocation);
  const { route, status: routeStatus, error: routeError } = useRoute(
    fromLocation,
    toLocation,
  );

  const revealFieldInContainer = (container: HTMLDivElement, field: HTMLElement) => {
    if (window.matchMedia("(min-width: 1024px)").matches) return;

    mobileFieldCleanupRef.current?.();
    let frame = 0;
    const viewport = window.visualViewport;
    const reveal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        const viewportTop = viewport ? viewport.offsetTop : 0;
        const viewportBottom = viewport
          ? viewport.offsetTop + viewport.height
          : window.innerHeight;
        const topEdge = Math.max(containerRect.top, viewportTop) + 16;
        const bottomEdge = Math.max(
          topEdge,
          Math.min(containerRect.bottom, viewportBottom) - 72,
        );
        const fieldRect = field.getBoundingClientRect();
        const offset =
          fieldRect.top < topEdge
            ? fieldRect.top - topEdge - 8
            : fieldRect.bottom > bottomEdge
              ? fieldRect.bottom - bottomEdge + 8
              : 0;

        if (Math.abs(offset) > 1) {
          container.scrollBy({ top: offset, behavior: reduced ? "auto" : "smooth" });
        }
      });
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", reveal);
      viewport?.removeEventListener("scroll", reveal);
      if (mobileFieldCleanupRef.current === stop) {
        mobileFieldCleanupRef.current = null;
      }
    };

    reveal();
    viewport?.addEventListener("resize", reveal);
    viewport?.addEventListener("scroll", reveal);
    field.addEventListener("blur", stop, { once: true });
    mobileFieldCleanupRef.current = stop;
  };

  const revealMobileField = (field: HTMLElement) => {
    const container = mobileSheetRef.current;
    if (container) revealFieldInContainer(container, field);
  };

  const revealHistoryField = (field: HTMLElement) => {
    const container = historyScrollRef.current;
    if (container) revealFieldInContainer(container, field);
  };

  useEffect(
    () => () => {
      mobileFieldCleanupRef.current?.();
    },
    [],
  );

  // Passenger navigation mirrors the driver's leg logic: while the driver is
  // heading to pickup we show a live DRIVER→FROM polyline (ETA to pickup);
  // once the trip is in progress the target switches to the destination
  // (DRIVER→TO). Reuses the same throttled/rerouted hook as the driver portal.
  const passengerNavPhase: NavigationPhase | null =
    rideBooked && bookingDriverId !== null
      ? (bookingStatus === "confirmed" || bookingStatus === "arriving")
        ? "arriving"
        : bookingStatus === "in_progress"
          ? "in_progress"
          : null
      : null;
  const passengerNavTarget: SelectedLocation | null =
    passengerNavPhase === "arriving"
      ? fromLocation
      : passengerNavPhase === "in_progress"
        ? toLocation
        : null;
  const passengerNavOrigin =
    driverLocation && driverLocation.latitude != null && driverLocation.longitude != null
      ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude }
      : null;
  const {
    route: passengerNavRoute,
    status: passengerNavStatus,
  } = useNavigationRoute({
    phase: passengerNavPhase,
    origin: passengerNavOrigin,
    target: passengerNavTarget,
  });
  const passengerNavPhaseId = passengerNavPhase
    ? `${passengerNavPhase}-${bookingId ?? "ride"}`
    : null;

  useEffect(() => {
    fromLocationRef.current = fromLocation;
  }, [fromLocation]);

  // Realtime ride tracking: the passenger socket receives this booking's
  // status transitions (confirmed/arriving/arrived/in_progress) and the
  // live driver position, resolved server-side to our user via the session
  // cookie. The 4s poll remains as a fallback and re-sync source.
  const passengerSocket = usePassengerSocket({
    passengerId: user?.id,
    onRideStatusUpdate: (data: RideStatusUpdateData) => {
      if (!bookingId || data.rideId !== bookingId) return;
      const next = data.status ? (data.status as BookingStatus) : null;
      if (next) setBookingStatus(next);
      if (data.driverId) setBookingDriverId(data.driverId);
      if (data.searchProgress) setSearchProgress(data.searchProgress);
      if (data.cancelledBy) setBookingCancelledBy(data.cancelledBy);
      if (next === "cancelled") {
        setSearchProgress(null);
        setBookingCancelledAt(new Date().toISOString());
        setBookingCancelledBy(data.cancelledBy ?? "system");
      } else if (next && next !== "pending") {
        setSearchProgress(null);
      }
      // A status transition changes persisted booking data, so the cached list
      // is refetched. This is scoped to this ride's status events only: driver
      // location packets are realtime and must never invalidate the cache.
      if (next) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      }
    },
    onDriverLocation: (data: DriverLocationData) => {
      if (!bookingId || data.rideId !== bookingId) return;
      setDriverLocation({
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading ?? null,
        speed: data.speed ?? null,
      });
      // Intentionally no cache invalidation here: location is realtime state
      // owned by the socket, not server state React Query should refetch for.
    },
  });
  const { connect: connectPassengerSocket } = passengerSocket;
  const socketConnected = passengerSocket.connected;

  useEffect(() => {
    if (user?.id) {
      connectPassengerSocket();
    }
  }, [user?.id, connectPassengerSocket]);

  // Automatically resolve the passenger's current position on mount so the
  // pickup field is pre-filled without pressing any button. Browsers show the
  // geolocation prompt once; after the user allows it, location resolves
  // silently on every visit.
  //
  // The Geolocation calls themselves are unchanged; this only records which of
  // the permission outcomes happened so the UI can explain it, and keeps a
  // retry handle so the user is never re-prompted by us.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      // Already seeded as "unsupported" by the state initialiser.
      return;
    }
    let cancelled = false;
    const resolve = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setLocationUi("granted");
          if (fromLocationRef.current) return;
          const { latitude, longitude } = position.coords;
          setFromLocation({
            id: "current-location",
            name: "Current location",
            displayName: "Your current location",
            latitude,
            longitude,
          });
        },
        (error) => {
          if (cancelled) return;
          // Permission denied / unavailable. The dropdown's manual
          // "Use my current location" row and the retry in the sheet remain as
          // fallbacks, so we never nag with a fresh prompt.
          setLocationUi(error.code === 1 ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    };
    requestLocationRef.current = resolve;
    const permissions = (
      navigator as unknown as {
        permissions?: {
          query: (desc: PermissionDescriptor) => Promise<{ state: string }>;
        };
      }
    ).permissions;
    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (cancelled) return;
          if (status.state === "denied") {
            setLocationUi("denied");
            return;
          }
          setLocationUi("loading");
          resolve();
        })
        .catch(() => resolve());
    } else {
      // No Permissions API, so the state is genuinely unknown: leave it at
      // "prompt" (an explicit "Allow location" action) and let the geolocation
      // callbacks below settle it.
      resolve();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // The passenger's booking list is the one piece of stable server state on
  // this screen: it is revisited via the History tab, restored on mount to
  // re-attach an in-flight ride, and re-read by the active-ride poll below.
  // One query now serves all three instead of three separate requests, and the
  // cache stays authoritative through targeted invalidation on cancel, review,
  // booking creation and ride status socket events.
  const queryClient = useQueryClient();
  const {
    data: bookingsData,
    isError: historyFailed,
    isSuccess: historyLoaded,
    error: historyError,
    refetch: refetchBookings,
  } = useBookingsQuery();
  const history = bookingsData ?? EMPTY_BOOKINGS;
  const cancelBookingMutation = useCancelBookingMutation();
  const reviewBookingMutation = useSubmitBookingReviewMutation();

  // Derived rather than synchronised through an effect: if the expanded row's
  // ride is no longer reviewable (cancelled, or reviewed elsewhere) the row is
  // simply treated as closed, with no extra render pass.
  const openReviewId =
    historyReviewId &&
    bookingsData?.some(
      (booking) =>
        booking._id === historyReviewId &&
        booking.status === "completed" &&
        booking.driver &&
        !booking.feedback?.reviewedAt,
    )
      ? historyReviewId
      : null;

  const handleTabClick = (id: Tab) => {
    setActiveTab(id);
    if (id === "history") {
      void refetchBookings();
    }
  };

  const [mapPickMode, setMapPickMode] = useState<"from" | "to" | null>(null);
  const handleSelectFrom = (place: PlaceResult) => {
    setFromLocation({
      id: place.id,
      name: place.name,
      displayName: place.displayName,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    if (toLocation) setBookingError(null);
  };

  const handleSelectTo = (place: PlaceResult) => {
    setToLocation({
      id: place.id,
      name: place.name,
      displayName: place.displayName,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    if (fromLocation) setBookingError(null);
  };

  const handleDeselectFrom = () => {
    setFromLocation(null);
    if (toLocation) setBookingError(null);
  };

  const handleDeselectTo = () => {
    setToLocation(null);
    if (fromLocation) setBookingError(null);
  };

  const handleMapPick = (location: { latitude: number; longitude: number }) => {
    const picked: SelectedLocation = {
      id: "map-pin",
      name: "Dropped pin",
      displayName: "Dropped pin",
      latitude: location.latitude,
      longitude: location.longitude,
    };
    if (mapPickMode === "from") {
      setFromLocation(picked);
      if (toLocation) setBookingError(null);
    } else if (mapPickMode === "to") {
      setToLocation(picked);
      if (fromLocation) setBookingError(null);
    }
    setMapPickMode(null);
  };

  const handleBookRide = async () => {
    if (rideBooked) return;
    if (!fromLocation || !toLocation) {
      setBookingError("Select both your pickup and destination first.");
      setBookingState("error");
      return;
    }
    if (routeStatus !== "success" || !route || !Number.isFinite(route.fare)) {
      setBookingError("Calculating your fare before booking.");
      setBookingState("error");
      return;
    }
    setBookingState("loading");
    setBookingError(null);
    try {
      const response = await apiFetch("/api/v1/passenger/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            name: fromLocation.name,
            displayName: fromLocation.displayName,
            latitude: fromLocation.latitude,
            longitude: fromLocation.longitude,
          },
          destination: {
            name: toLocation.name,
            displayName: toLocation.displayName,
            latitude: toLocation.latitude,
            longitude: toLocation.longitude,
          },
        }),
      });
      let data: { success?: boolean; message?: string; booking?: { _id?: string; fare?: number | null } } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        // fall through with empty data
      }
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not create your booking.");
      }
      setBookingId(data.booking?._id ?? null);
      setBookingFare(data.booking?.fare ?? null);
      setBookingStatus("pending");
      setBookingDriverId(null);
      setBookingDriverInfo(null);
      setBookingDriverRating(null);
      setDriverLocation(null);
      setBookingCancelledAt(null);
      setBookingCancelledBy(null);
      setSearchProgress(null);
      setBookingFeedback({ rating: null, comment: null, reviewedAt: null });
      setCancelOpen(false);
      setCancelError(null);
      setReviewRating(0);
      setReviewComment("");
      setReviewError(null);
      setReviewDismissed(false);
      setRideBooked(true);
      setBookingState("idle");
      // A new ride belongs in the cached list, so refresh it once here instead
      // of leaving the History tab showing a stale set.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    } catch (e) {
      setBookingState("error");
      setBookingError(
        e instanceof Error ? e.message : "Could not create your booking.",
      );
    }
  };

  const handleCancelRide = async () => {
    if (!bookingId || cancelBookingMutation.isPending) return;
    setCancelError(null);
    try {
      const result = await cancelBookingMutation.mutateAsync({
        bookingId,
        reason: cancelReason,
      });
      setBookingStatus(result.status);
      setBookingFare(result.fare ?? bookingFare);
      setBookingCancelledAt(result.cancelledAt);
      setBookingCancelledBy(result.cancelledBy);
      setSearchProgress(null);
      setBookingDriverId(result.driver);
      setBookingDriverInfo(result.driverInfo);
      setCancelOpen(false);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 409) {
        // The ride already moved to a terminal state (another tab, sweep, or
        // driver). Fall back to the poll to re-sync the real status.
        setCancelOpen(false);
      } else {
        setCancelError(
          err?.message ??
          (e instanceof Error ? e.message : "Could not cancel this ride."),
        );
      }
    }
  };

  const handleSubmitReview = async () => {
    if (!bookingId || reviewBookingMutation.isPending || reviewRating < 1) return;
    setReviewError(null);
    try {
      const result = await reviewBookingMutation.mutateAsync({
        bookingId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      setBookingFeedback(result.feedback);
      setReviewRating(0);
      setReviewComment("");
    } catch (e) {
      setReviewError(
        e instanceof Error ? e.message : "Could not submit your review.",
      );
    }
  };

  const openHistoryReview = (booking: BookingRecord) => {
    if (
      openReviewId !== null ||
      historyReviewBusy ||
      booking.status !== "completed" ||
      !booking.driver ||
      booking.feedback.reviewedAt
    ) return;
    setHistoryReviewId(booking._id);
    setHistoryReviewRating(0);
    setHistoryReviewComment("");
    setHistoryReviewError(null);
  };

  const closeHistoryReview = () => {
    if (historyReviewBusy) return;
    setHistoryReviewId(null);
    setHistoryReviewRating(0);
    setHistoryReviewComment("");
    setHistoryReviewError(null);
  };

  const handleSubmitHistoryReview = async (booking: BookingRecord) => {
    if (historyReviewBusy || historyReviewRating < 1) return;
    setHistoryReviewBusy(true);
    setHistoryReviewError(null);
    try {
      // The mutation invalidates the bookings cache, so the feedback and the
      // driver rating aggregate come back from the server. No local patching
      // of the list is needed (and none should be reintroduced here).
      await reviewBookingMutation.mutateAsync({
        bookingId: booking._id,
        rating: historyReviewRating,
        comment: historyReviewComment.trim() || undefined,
      });
      setHistoryReviewId(null);
      setHistoryReviewRating(0);
      setHistoryReviewComment("");
    } catch (e) {
      setHistoryReviewError(e instanceof Error ? e.message : "Could not submit your review.");
    } finally {
      setHistoryReviewBusy(false);
    }
  };

  const handleRideDone = () => {
    setBookingId(null);
    setBookingFare(null);
    setBookingStatus(null);
    setSearchProgress(null);
    setBookingDriverId(null);
    setBookingDriverInfo(null);
    setBookingDriverRating(null);
    setDriverLocation(null);
    setBookingCancelledAt(null);
    setBookingCancelledBy(null);
    setBookingFeedback({ rating: null, comment: null, reviewedAt: null });
    setCancelOpen(false);
    setCancelError(null);
    setReviewRating(0);
    setReviewComment("");
    setReviewError(null);
    setReviewDismissed(false);
    setRideBooked(false);
  };

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  const findingDriver = rideBooked && bookingStatus === "pending";
  const rideActive =
    rideBooked &&
    bookingDriverId !== null &&
    bookingStatus !== null &&
    bookingStatus !== "pending" &&
    bookingStatus !== "cancelled" &&
    bookingStatus !== "completed";
  const rideResolved =
    rideBooked &&
    (bookingStatus === "cancelled" || bookingStatus === "completed");

  const activeStatusHeadline: Partial<Record<BookingStatus, string>> = {
    confirmed: "Driver assigned — heading to pickup",
    arriving: "Your driver is on the way",
    arrived: "Your driver has arrived",
    in_progress: "Your ride is in progress",
  };
  const activeStatusCaption: Partial<Record<BookingStatus, string>> = {
    confirmed: "A driver accepted your ride and is on the way to you",
    arriving: "Your driver is heading to the pickup point",
    arrived: "Meet your driver at the pickup point",
    in_progress: "You are on the move to your destination",
  };

  // Client-only acceptance signal: poll the real passenger booking list (GET
  // /api/v1/passenger/bookings) for this booking's live status until it is
  // resolved. Structured so the future passenger socket event can replace
  // this poll without redesigning the UI state.
  const bookingPollSeq = useRef(0);
  useEffect(() => {
    if (!rideBooked || !bookingId) return;
    let stopped = false;
    let pollRunning = false;
    let pollTimer: ReturnType<typeof window.setInterval> | undefined;

    const stopPolling = () => {
      stopped = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const poll = async () => {
      if (stopped || pollRunning) return;
      pollRunning = true;
      const seq = ++bookingPollSeq.current;
      try {
        // Refetch the shared bookings query rather than issuing a private
        // request: the History tab then benefits from this re-sync instead of
        // holding a separate, staler copy of the same list.
        const { data: list } = await refetchBookings();
        if (stopped || seq !== bookingPollSeq.current) return;
        const current = list?.find((b) => b._id === bookingId);
        if (!current) return;
        setBookingStatus(current.status);
        setBookingFare(current.fare ?? null);
        setBookingDriverId(current.driver);
        setBookingDriverInfo(current.driverInfo ?? null);
        setBookingDriverRating(current.driverRating ?? null);
        setBookingCancelledAt(current.cancelledAt ?? null);
        setBookingCancelledBy(current.cancelledBy ?? null);
        setBookingFeedback(
          current.feedback ?? { rating: null, comment: null, reviewedAt: null },
        );
        if (current.status !== "pending") setSearchProgress(null);
        // Recover the driver's most recent position (Redis, 30s TTL) so the
        // live marker survives a reload until the socket stream resumes.
        if (current.driverLocation && current.driverLocation.latitude != null && current.driverLocation.longitude != null) {
          setDriverLocation({
            latitude: current.driverLocation.latitude,
            longitude: current.driverLocation.longitude,
            heading: current.driverLocation.heading ?? null,
            speed: current.driverLocation.speed ?? null,
          });
        }
        if (current.status === "cancelled" || current.status === "completed") {
          stopPolling();
        }
      } catch {
        // transient network/server error — keep polling, leave UI untouched
      } finally {
        pollRunning = false;
      }
    };

    pollTimer = window.setInterval(() => {
      void poll();
    }, 4000);
    void poll();

    return stopPolling;
  }, [rideBooked, bookingId, refetchBookings]);

  // Reload persistence: on mount, restore an in-flight booking (pending →
  // in_progress) so a page refresh does not strand the passenger. Terminal
  // states are intentionally not restored as an active ride — they live in
  // the History tab.
  const bootedFromHistory = useRef(false);
  useEffect(() => {
    if (!user?.id || bootedFromHistory.current || rideBooked) return;
    // Reads the cached list the query already fetched on mount instead of
    // issuing a second request for the same resource.
    if (!bookingsData) return;
    bootedFromHistory.current = true;
    // Deferred to a microtask so the seed of the ride state happens after this
    // effect returns, as it did when this restore issued its own request. The
    // ride state is a set of interdependent values (status, driver, geometry)
    // rather than a single derived value, so it is seeded once and then owned
    // by the socket and the poll.
    queueMicrotask(() => {
      const inFlight = bookingsData.find((b) =>
        b.status === "pending" ||
        b.status === "confirmed" ||
        b.status === "arriving" ||
        b.status === "arrived" ||
        b.status === "in_progress",
      );
        if (!inFlight) return;
        setBookingId(inFlight._id);
        setBookingStatus(inFlight.status);
        setSearchProgress(null);
        setBookingFare(inFlight.fare ?? null);
        setBookingDriverId(inFlight.driver);
        setBookingDriverInfo(inFlight.driverInfo ?? null);
        setBookingDriverRating(inFlight.driverRating ?? null);
        setBookingCancelledAt(inFlight.cancelledAt ?? null);
        setBookingCancelledBy(inFlight.cancelledBy ?? null);
        setBookingFeedback(
          inFlight.feedback ?? { rating: null, comment: null, reviewedAt: null },
        );
        if (inFlight.driverLocation && inFlight.driverLocation.latitude != null && inFlight.driverLocation.longitude != null) {
          setDriverLocation({
            latitude: inFlight.driverLocation.latitude,
            longitude: inFlight.driverLocation.longitude,
            heading: inFlight.driverLocation.heading ?? null,
            speed: inFlight.driverLocation.speed ?? null,
          });
        }
        // Restore the trip geometry so the map + nav line up after reload.
        setFromLocation({
          id: inFlight.source.name ?? "pickup",
          name: inFlight.source.name ?? "Pickup",
          displayName: inFlight.source.displayName ?? inFlight.source.name ?? "Pickup",
          latitude: inFlight.source.latitude,
          longitude: inFlight.source.longitude,
        });
        setToLocation({
          id: inFlight.destination.name ?? "dropoff",
          name: inFlight.destination.name ?? "Drop-off",
          displayName: inFlight.destination.displayName ?? inFlight.destination.name ?? "Drop-off",
          latitude: inFlight.destination.latitude,
          longitude: inFlight.destination.longitude,
        });
        setRideBooked(true);
    });
  }, [user?.id, rideBooked, bookingsData]);

  const selectedVehicle = vehicleTypes.find((v) => v.id === vehicle)!;
  const estimatedFareLabel =
    route?.fare != null
      ? formatFare(route.fare)
      : routeStatus === "loading"
        ? "Calculating…"
        : "—";
  const fareReady = routeStatus === "success" && route !== null && Number.isFinite(route.fare);
  const rideFareLabel =
    bookingFare === null ? estimatedFareLabel : formatFare(bookingFare);

  const historyGroups = history.reduce<
    Array<{ dateLabel: string; items: BookingRecord[] }>
  >((groups, booking) => {
    const dateLabel = formatTripDate(booking.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.items.push(booking);
      return groups;
    }
    groups.push({ dateLabel, items: [booking] });
    return groups;
  }, []);

  /* ── Responsive surfaces ─────────────────────────────────────────
     Booking composer + ride-status panels are rendered twice: desktop
     variant lives in the fixed left column / bottom strip, mobile
     variant lives in normal flow below the map. Same components, same
     logic — only placement & id prefixes differ per variant. */

  const renderBookingSurface = (variant: "desktop" | "mobile") => {
    const compact = variant === "mobile";
    const pfx = compact ? "m-" : "";
    return (
      <div className={compact ? "space-y-4" : "space-y-5"}>
        {/* Greeting */}
        <div>
          <p className="text-[13px] text-muted-foreground">
            Good to see you
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Where to
            today?
          </p>
        </div>

        {/* Address block */}
        <div
          className="rounded-2xl border border-border bg-card p-4 space-y-0"
          style={{ position: "relative" }}
        >
          {/* From */}
          <PlaceSearchField
            id={`${pfx}pickup`}
            label="From"
            placeholder="Current location"
            icon={<MapPin className="h-4 w-4 text-primary shrink-0" />}
            variant="from"
            selectedLocation={fromLocation}
            onSelectLocation={handleSelectFrom}
            onDeselectLocation={handleDeselectFrom}
            pinActive={mapPickMode === "from"}
            onPinToggle={() =>
              setMapPickMode(mapPickMode === "from" ? null : "from")
            }
          />

          <div className="ml-[18px] h-px bg-border my-1" />

          {/* To */}
          <PlaceSearchField
            id={`${pfx}dropoff`}
            label="To"
            placeholder="Your destination"
            icon={<Navigation className="h-4 w-4 text-muted-foreground shrink-0" />}
            variant="to"
            selectedLocation={toLocation}
            onSelectLocation={handleSelectTo}
            onDeselectLocation={handleDeselectTo}
            pinActive={mapPickMode === "to"}
            onPinToggle={() =>
              setMapPickMode(mapPickMode === "to" ? null : "to")
            }
          />
        </div>

        {/* Route status */}
        <div
          id={`${pfx}route-info`}
          className="rounded-xl border border-border/70 bg-muted/25 px-4 py-3"
        >
          {routeStatus === "loading" && (
            <p className="text-[12px] text-muted-foreground">
              Calculating route…
            </p>
          )}
          {routeStatus === "success" && route && (
            <div className="flex items-center gap-2 text-[12px] text-foreground">
              <span className="font-semibold text-primary">
                {formatDistance(route.distance)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">
                {formatDuration(route.duration)}
              </span>
            </div>
          )}
          {routeStatus === "error" && (
            <p className="text-[12px] text-destructive">
              {routeError ?? "Could not calculate a route."}
            </p>
          )}
          {routeStatus === "idle" && (
            <p className="text-[12px] text-muted-foreground">
              Select From and To to see the route.
            </p>
          )}
        </div>

        {/* Vehicle selector */}
        <div>
          <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
            Choose ride type
          </p>
          <motion.div
            className={compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-3 gap-2.5"}
            variants={stagger.container}
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            {vehicleTypes.map((v) => {
              const isSelected = vehicle === v.id;
              const accent = vehicleAccentStyles[v.accent];
              return (
                <motion.button
                  key={v.id}
                  type="button"
                  id={`${pfx}vehicle-${v.id}`}
                  onClick={() => setVehicle(v.id)}
                  variants={stagger.item}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:scale-[1.01] motion-safe:active:scale-[0.99] motion-reduce:transition-none ${isSelected
                    ? accent.selectedCard
                    : "border-border bg-card hover:border-ring/30 hover:bg-muted/40"
                    }`}
                >
                  <Car
                    className={`h-5 w-5 ${isSelected
                      ? accent.iconSelected
                      : accent.iconIdle
                      }`}
                  />
                  <span className="text-[13px] font-semibold text-foreground leading-tight">
                    {v.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {v.eta}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        {/* Fare estimate */}
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Estimated fare
            </p>
            <p className="mt-1 font-sans text-[18px] font-bold tabular-nums text-foreground">
              {estimatedFareLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              ETA
            </p>
            <p className="mt-1 text-[14px] font-semibold tabular-nums text-foreground">
              {selectedVehicle.eta}
            </p>
          </div>
        </div>

        {/* CTA */}
        <Button
          id={`${pfx}search-ride-btn`}
          size="lg"
          className="w-full rounded-2xl text-[14px] font-semibold tracking-wide hover:scale-[1.01]"
          onClick={handleBookRide}
          disabled={bookingState === "loading" || rideBooked || !fareReady}
        >
          {bookingState === "loading"
            ? "Booking ride…"
            : rideBooked
              ? "Searching for a driver…"
              : "Search for a ride"}
        </Button>
        {bookingError && (
          <p
            id={`${pfx}booking-error`}
            className="text-[12px] text-destructive"
          >
            {bookingError}
          </p>
        )}
      </div>
    );
  };

  const renderRideStatusSurface = (variant: "desktop" | "mobile") => {
    const compact = variant === "mobile";
    const pfx = compact ? "m-" : "";
    const panelClass = compact ? "px-4 py-4" : "border-t border-border bg-card px-6 py-5";
    return (
      <AnimatePresence>
        {rideBooked && findingDriver && (
          <motion.div
            {...motionStateProps({ variants: page, reduced })}
            key="finding-driver"
            className={panelClass}
          >
            <div className="flex flex-wrap items-center gap-3">
              <motion.span
                className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusIconStyles.pending}`}
                animate={
                  reduced
                    ? undefined
                    : { scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }
                }
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Search className="h-4 w-4" />
              </motion.span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  Searching for a ride
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {searchProgress
                    ? `Taking longer than usual — no drivers found nearby. We're expanding the search radius to ${searchProgress.radiusKm} km.`
                    : "Scanning the area for nearby drivers…"}
                </p>
              </div>
              <Badge
                variant="outline"
                className="ml-auto shrink-0 border-amber-500/25 bg-amber-500/10 text-amber-500"
              >
                {searchProgress
                  ? `Expanding · ${searchProgress.radiusKm} km`
                  : "Searching"}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-[11.5px] text-muted-foreground">
                {searchProgress
                  ? `Search radius expanded to ${searchProgress.radiusKm} km. We'll keep looking for a nearby driver.`
                  : "We'll keep searching nearby and expand the radius if needed."}
              </p>
              <button
                type="button"
                id={`${pfx}cancel-search-btn`}
                onClick={() => setCancelOpen(true)}
                className="ml-auto rounded-md text-[12px] font-semibold text-destructive outline-none transition-colors hover:text-destructive/80 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              >
                Cancel search
              </button>
            </div>

            <div className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 px-3.5 py-3">
              <Avatar size="sm">
                {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="bg-primary/20 text-[11px] font-bold text-primary">
                  <Initials name={user?.name} email={user?.email} />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Your ride
                </p>
                <p className="truncate text-[14px] font-semibold text-foreground">
                  {user?.name ?? "Passenger"}
                </p>
              </div>
            </div>

            <TripDetailsStrip
              from={fromLocation}
              to={toLocation}
              route={route}
              rideLabel={`${selectedVehicle.label} · ${rideFareLabel}`}
            />
          </motion.div>
        )}

        {rideBooked && rideActive && (
          <motion.div
            {...motionStateProps({ variants: page, reduced })}
            key="driver-assigned"
            className={panelClass}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusIconStyles[bookingStatus ?? "confirmed"]}`}
              >
                <Car className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  {activeStatusHeadline[bookingStatus ?? "confirmed"] ?? "Your driver is on the way"}
                </p>
                <p className="text-[12.5px] text-muted-foreground capitalize">
                  {activeStatusCaption[bookingStatus ?? "confirmed"] ?? bookingStatus}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`ml-auto shrink-0 capitalize ${statusBadgeStyles[bookingStatus ?? "confirmed"]}`}
              >
                {bookingStatus}
              </Badge>
            </div>

            {bookingDriverInfo ? (
              <div className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 px-3.5 py-3">
                <Avatar size="lg">
                  {bookingDriverInfo.image ? (
                    <AvatarImage src={bookingDriverInfo.image} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-drio-success/15 text-[13px] font-bold text-drio-success">
                    {(bookingDriverInfo.name ?? "D").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Driver
                  </p>
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {bookingDriverInfo.name ?? "Driver"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    {bookingDriverRating?.average != null && bookingDriverRating.count > 0 ? (
                      <>
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        <span className="font-semibold text-foreground">
                          {bookingDriverRating.average.toFixed(1)}
                        </span>
                        <span>
                          · {bookingDriverRating.count}{" "}
                          {bookingDriverRating.count === 1 ? "rating" : "ratings"}
                        </span>
                      </>
                    ) : (
                      <span>New driver</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 px-3.5 py-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-20 rounded bg-muted motion-reduce:animate-none" />
                  <div className="h-2 w-32 rounded bg-muted motion-reduce:animate-none" />
                </div>
              </div>
            )}

            {passengerNavPhase &&
              (passengerNavRoute || passengerNavStatus === "loading") && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3.5 py-2.5">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  {passengerNavRoute ? (
                    <>
                      <p className="text-[12.5px] font-semibold text-foreground">
                        ~{formatDuration(passengerNavRoute.duration)} to{" "}
                        {passengerNavPhase === "arriving" ? "pickup" : "destination"}
                      </p>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {formatDistance(passengerNavRoute.distance)}
                      </span>
                    </>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      Calculating ETA…
                    </p>
                  )}
                </div>
              )}

            <TripDetailsStrip
              from={fromLocation}
              to={toLocation}
              route={route}
              rideLabel={`${selectedVehicle.label} · ${rideFareLabel}`}
            />

            {bookingStatus === "confirmed" ||
              bookingStatus === "arriving" ||
              bookingStatus === "arrived" ? (
              <button
                type="button"
                id={`${pfx}cancel-ride-btn`}
                onClick={() => setCancelOpen(true)}
                className="mt-4 rounded-md text-[12px] font-semibold text-destructive outline-none transition-colors hover:text-destructive/80 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              >
                Cancel ride
              </button>
            ) : null}
          </motion.div>
        )}

        {rideResolved && bookingStatus === "cancelled" && (
          <motion.div
            {...motionStateProps({ variants: page, reduced })}
            key="ride-cancelled"
            className={panelClass}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusIconStyles.cancelled}`}
              >
                <X className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  {bookingCancelledBy === "system"
                    ? "No driver found"
                    : bookingCancelledBy === "driver"
                      ? "Your driver cancelled"
                      : "Ride cancelled"}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {bookingCancelledBy === "system"
                    ? "We couldn't find a nearby driver this time. You'll receive a full refund — try booking again."
                    : bookingCancelledBy === "driver"
                      ? "The assigned driver cancelled this ride. You haven't been charged."
                      : bookingCancelledBy === "passenger"
                        ? "You cancelled this ride before pickup. You haven't been charged."
                        : "This ride has been cancelled."}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`ml-auto shrink-0 capitalize ${statusBadgeStyles.cancelled}`}
              >
                cancelled
              </Badge>
            </div>

            <TripDetailsStrip
              from={fromLocation}
              to={toLocation}
              route={route}
              rideLabel={`${selectedVehicle.label} · ${rideFareLabel}`}
            />

            <p className="mt-3 text-[11.5px] text-muted-foreground">
              {bookingCancelledAt
                ? `Cancelled ${new Date(bookingCancelledAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
                : "Cancelled"}
              {bookingCancelledBy === "passenger" &&
                ` · Reason: ${cancelReasons.find((r) => r.value === cancelReason)?.label ?? "Other"}`}
            </p>

            <Button
              type="button"
              id={`${pfx}cancelled-done-btn`}
              size="lg"
              className="mt-4 w-full rounded-2xl text-[14px] font-semibold"
              onClick={handleRideDone}
            >
              Done
            </Button>
          </motion.div>
        )}

        {rideResolved && bookingStatus === "completed" && (
          <motion.div
            {...motionStateProps({ variants: page, reduced })}
            key="ride-completed"
            className={panelClass}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  Ride complete
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Thanks for riding with Drio.
                </p>
              </div>
              <Badge
                variant="outline"
                className={`ml-auto shrink-0 capitalize ${statusBadgeStyles.completed}`}
              >
                completed
              </Badge>
            </div>

            <TripDetailsStrip
              from={fromLocation}
              to={toLocation}
              route={route}
              rideLabel={`${selectedVehicle.label} · ${rideFareLabel}`}
            />

            {!bookingDriverId ? (
              <div className="mt-4 flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-muted/25 px-3.5 py-3">
                <Star className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[12.5px] text-muted-foreground">
                  This ride has no assigned driver to review.
                </p>
              </div>
            ) : bookingFeedback?.reviewedAt || reviewDismissed ? (
              <div className="mt-4 flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-muted/25 px-3.5 py-3">
                <Star className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500" />
                <p className="text-[12.5px] text-muted-foreground">
                  {bookingFeedback?.reviewedAt
                    ? "Thanks for your review!"
                    : "You can rate your driver anytime from your trip history."}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border/70 bg-muted/25 px-4 py-4">
                <p className="text-[12.5px] font-semibold text-foreground">
                  How was your driver?
                </p>
                <div
                  className="mt-2 grid grid-cols-5 items-center gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5"
                  role="radiogroup"
                  aria-label="Rate your driver from 1 to 5 stars"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label
                      key={n}
                      className={`flex h-11 w-full min-w-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground/45 outline-none transition-[color,background-color,border-color,transform] duration-150 hover:border-amber-500/20 hover:bg-amber-500/[0.06] hover:text-amber-500/70 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card motion-safe:hover:-translate-y-px motion-safe:active:scale-95 motion-reduce:transition-none sm:w-11 sm:flex-none ${reviewRating >= n ? "text-amber-500" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`${pfx}driver-rating`}
                        value={n}
                        checked={reviewRating === n}
                        onChange={() => setReviewRating(n)}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        className="sr-only"
                      />
                      <Star
                        aria-hidden="true"
                        className={`h-5 w-5 transition-[fill] duration-150 motion-reduce:transition-none ${reviewRating >= n ? "fill-amber-500" : ""}`}
                      />
                    </label>
                  ))}
                  {reviewRating > 0 && (
                    <span className="col-span-5 mt-1 text-right text-[12px] font-semibold text-foreground sm:ml-1 sm:mt-0 sm:inline">
                      {reviewRating}/5
                    </span>
                  )}
                </div>
                <Textarea
                  id={`${pfx}review-comment`}
                  aria-label="Review comment"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Leave a comment (optional)…"
                  className="mt-3 min-h-[70px] text-base lg:text-sm"
                  maxLength={500}
                />
                {reviewError && (
                  <p role="alert" className="mt-2 text-[12px] text-destructive">
                    {reviewError}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    id={`${pfx}submit-review-btn`}
                    size="sm"
                     className="min-h-11 font-semibold lg:min-h-8"
                    disabled={reviewBookingMutation.isPending || reviewRating < 1}
                    onClick={() => void handleSubmitReview()}
                  >
                    {reviewBookingMutation.isPending ? "Submitting…" : "Submit review"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                     className="min-h-11 font-semibold text-muted-foreground lg:min-h-8"
                    disabled={reviewBookingMutation.isPending}
                    onClick={() => setReviewDismissed(true)}
                  >
                    Not now
                  </Button>
                </div>
              </div>
            )}

            <Button
              type="button"
              id={`${pfx}completed-done-btn`}
              size="lg"
              variant="outline"
              className="mt-4 w-full rounded-2xl text-[14px] font-semibold"
              onClick={handleRideDone}
            >
              Done
            </Button>
          </motion.div>
        )}

        {rideBooked && cancelOpen && (
          <motion.div
            {...motionStateProps({ variants: page, reduced })}
            key="cancel-confirmation"
            className={panelClass}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusIconStyles.cancelled}`}
              >
                <X className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  Cancel this ride?
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {findingDriver
                    ? "This stops the driver search for this request."
                    : "The driver will be notified and you won't be charged."}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              {cancelReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => setCancelReason(reason.value)}
                  aria-pressed={cancelReason === reason.value}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left outline-none transition-[color,background-color,border-color,box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-safe:active:scale-[0.99] motion-reduce:transition-none ${cancelReason === reason.value
                      ? "border-destructive/35 bg-destructive/[0.07]"
                      : "border-border/70 bg-muted/25 hover:border-ring/30 hover:bg-muted/45"
                    }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-colors motion-reduce:transition-none ${cancelReason === reason.value
                        ? "border-destructive bg-destructive"
                        : "border-muted-foreground/40"
                      }`}
                  />
                  <span className="text-[13px] font-medium text-foreground">
                    {reason.label}
                  </span>
                </button>
              ))}
            </div>

            {cancelError && (
              <p role="alert" className="mt-3 break-words text-[12px] text-destructive [overflow-wrap:anywhere]">
                {cancelError}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                id={`${pfx}confirm-cancel-ride-btn`}
                size="sm"
                variant="destructive"
                className="font-semibold"
                disabled={cancelBookingMutation.isPending}
                onClick={() => void handleCancelRide()}
              >
                {cancelBookingMutation.isPending ? "Cancelling…" : "Cancel ride"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="font-semibold text-muted-foreground"
                disabled={cancelBookingMutation.isPending}
                onClick={() => setCancelOpen(false)}
              >
                Keep ride
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <MotionPage className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col border-r bg-sidebar lg:flex"
      >
        {/* Logo */}
        <div className="flex h-[64px] items-center px-5 shrink-0">
          <Logo />
        </div>

        <div className="px-3 mb-1">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Navigation
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const accent = navAccentStyles[item.accent];
            return (
              <button
                key={item.id}
                type="button"
                id={`nav-${item.id}`}
                onClick={() => handleTabClick(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${isActive
                  ? accent.button
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isActive
                    ? accent.chip
                    : "bg-white/5 text-muted-foreground group-hover:text-foreground"
                    }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.label}
                {isActive && (
                  <motion.span
                    layoutId="passenger-nav-active"
                    className={`ml-auto h-1.5 w-1.5 rounded-full ${accent.ident}`}
                    transition={{
                      duration: reduced ? 0 : 0.18,
                      ease: "easeOut",
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Feature hints */}
        <div className="mx-3 my-4 rounded-2xl bg-primary/8 border border-primary/15 p-4">
          <p className="text-xs font-semibold text-primary mb-1">Drio Premier</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Priority pickups &amp; premium vehicles included.
          </p>
        </div>

        {/* User row */}
        <div className="border-t border-border px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/5 transition-colors cursor-pointer">
            <Avatar size="sm">
              {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="bg-primary/20 text-[11px] font-bold text-primary">
                <Initials name={user?.name} email={user?.email} />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                {user?.name ?? user?.email}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
          <AccountSwitcher>
            <button
              onClick={handleSignOut}
              id="signout-btn"
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </AccountSwitcher>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col pb-[calc(4.25rem+max(0.75rem,env(safe-area-inset-bottom)))] lg:min-h-0 lg:ml-[220px] lg:pb-0">
        {/* Top bar (desktop) — only shown on non-map tabs */}
        {activeTab !== "home" && (
          <header className="hidden h-[64px] items-center justify-between border-b border-border px-8 shrink-0 lg:flex">
            <div>
              <h1 className="font-serif text-[20px] font-bold tracking-tight text-foreground leading-tight">
                {activeTab === "history" && "Ride History"}
                {activeTab === "account" && "My Account"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
               <RealtimeBadge connected={socketConnected} />
            </div>
          </header>
        )}

        {/* Top bar (mobile) — hidden on Home tab; map has floating logo instead */}
        {activeTab !== "home" && (
          <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur max-lg:pl-[calc(1rem+env(safe-area-inset-left))] max-lg:pr-[calc(1rem+env(safe-area-inset-right))] [@media(max-height:600px)]:h-[calc(3rem+env(safe-area-inset-top))] lg:hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <Logo className="!text-[1.15rem]" />
              <h1 className="truncate text-[14px] font-semibold text-foreground">
                {activeTab === "history" && "Ride History"}
                {activeTab === "account" && "My Account"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <AccountSwitcher compact placement="bottom">
                <span />
              </AccountSwitcher>
               <RealtimeBadge connected={socketConnected} compact />
            </div>
          </header>
        )}

        {activeTab === "home" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:overflow-hidden">
            <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] max-lg:pl-[calc(1rem+env(safe-area-inset-left))] max-lg:pr-[calc(1rem+env(safe-area-inset-right))] [@media(max-height:600px)]:h-[calc(3rem+env(safe-area-inset-top))] lg:hidden">
              <Logo className="!text-[1.15rem]" />
              <div className="flex items-center gap-1.5">
                <AccountSwitcher compact placement="bottom">
                  <span />
                </AccountSwitcher>
                 <RealtimeBadge connected={socketConnected} compact />
              </div>
            </div>
            <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-drio-deep lg:relative lg:inset-auto lg:z-0 lg:h-auto lg:w-auto lg:flex-1 lg:order-2">
              <Map
                className="h-full w-full"
                from={fromLocation}
                to={toLocation}
                route={route}
                pickMode={mapPickMode}
                onPickPoint={handleMapPick}
                searching={findingDriver}
                driverLocation={driverLocation}
                navRoute={passengerNavRoute}
                navPhaseId={passengerNavPhaseId}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[360px] w-[360px] rounded-full bg-primary/6 blur-3xl" />
              </div>
            </div>
            <div className="relative z-10 hidden w-full shrink-0 lg:static lg:inset-auto lg:z-auto lg:flex lg:min-h-0 lg:w-[380px] lg:shrink-0 lg:flex-col lg:order-1 lg:overflow-y-auto lg:border-r lg:border-border lg:bg-background">
              <div className="flex-1 p-6">
                {renderBookingSurface("desktop")}
              </div>
            </div>
            <div className="absolute inset-x-[380px] bottom-0 z-10 hidden max-h-[55%] overflow-y-auto overscroll-contain lg:block">
              {renderRideStatusSurface("desktop")}
            </div>
            {/* Mobile: real drag-to-expand sheet floating over the map, so the
                map stays visible above it. Desktop keeps the fixed side panel. */}
            <MobileSheet
              contentRef={mobileSheetRef}
              onFieldFocus={revealMobileField}
              peekHeight={rideBooked || cancelOpen ? 260 : 210}
              label={rideBooked ? "Expand or collapse ride details" : "Expand or collapse booking options"}
              peekHint={
                <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  {rideBooked ? "Your ride" : cancelOpen ? "Cancel your ride" : "Where to?"}
                </p>
              }
            >
              {cancelOpen || rideBooked ? (
                <div className="overscroll-contain">
                  {renderRideStatusSurface("mobile")}
                </div>
              ) : (
                <div className="overscroll-contain pb-2 pt-1">
                  {/* Only surfaced while it is actionable: once a pickup exists
                      or location resolved, it would just be noise. */}
                  {locationUi !== "granted" && !fromLocation && (
                    <LocationPermission
                      className="mb-3"
                      state={locationUi}
                      onRequest={() => {
                        setLocationUi("loading");
                        requestLocationRef.current?.();
                      }}
                    />
                  )}
                  {renderBookingSurface("mobile")}
                </div>
              )}
            </MobileSheet>
          </div>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={historyScrollRef}
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 max-lg:pl-[calc(1rem+env(safe-area-inset-left))] max-lg:pr-[calc(1rem+env(safe-area-inset-right))] lg:p-8"
              onFocusCapture={(event) => {
                const field = event.target;
                if (field instanceof HTMLElement && field.matches("input, textarea")) {
                  revealHistoryField(field);
                }
              }}
            >
              <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 lg:space-y-6">
                <AnimatePresence mode="wait">
                  {historyFailed ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="error"
                      className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-card px-6 py-8 text-center lg:border-dashed lg:border-destructive/30 lg:py-16"
                    >
                      <div className="mb-4 hidden h-14 w-14 items-center justify-center rounded-full bg-destructive/10 lg:flex">
                        <History className="h-7 w-7 text-destructive" />
                      </div>
                      <p className="text-[15px] font-semibold text-destructive">
                        Could not load your trips
                      </p>
                      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                        {(historyError instanceof Error ? historyError.message : null) ??
                          "Something went wrong while loading your trips."}
                      </p>
                      <Button
                        size="sm"
                        className="mt-6 font-semibold"
                        onClick={() => void refetchBookings()}
                      >
                        Try again
                      </Button>
                    </motion.div>
                  ) : historyLoaded && historyGroups.length === 0 ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="empty"
                      className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 py-8 text-center lg:border-dashed lg:py-16"
                    >
                      <div className="mb-4 hidden h-14 w-14 items-center justify-center rounded-full bg-primary/10 lg:flex">
                        <History className="h-7 w-7 text-primary" />
                      </div>
                      <p className="text-[15px] font-semibold text-foreground">
                        No trips yet
                      </p>
                      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                        Once you take your first ride, your trip history and
                        receipts will show up here.
                      </p>
                      <Button
                        size="sm"
                        className="mt-6 font-semibold hover:scale-[1.01]"
                        onClick={() => setActiveTab("home")}
                      >
                        Book a ride
                      </Button>
                    </motion.div>
                  ) : historyLoaded ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="list"
                      className="space-y-4"
                    >
                      {historyGroups.map((group, idx) => (
                        <div key={idx}>
                           <p className="mb-2.5 px-0.5 text-[11px] font-medium normal-case tracking-normal text-muted-foreground sm:mb-2 sm:px-1 sm:text-[10px] sm:font-semibold sm:uppercase sm:tracking-widest">
                            {group.dateLabel}
                          </p>
                          <div className="space-y-2">
                            {group.items.map((booking) => (
                              <div
                                key={booking._id}
                                title={`Booking ${booking._id}`}
                                 className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card transition-[border-color,box-shadow] duration-200 hover:border-ring/25 hover:shadow-sm motion-reduce:transition-none"
                               >
                                 <div className="flex min-w-0 flex-col items-stretch gap-2.5 px-3.5 py-3 sm:gap-3 sm:px-4 sm:py-3.5 lg:flex-row lg:items-center lg:gap-3">
                                   <div
                                     aria-hidden="true"
                                     className="hidden w-10 shrink-0 self-stretch py-1 lg:flex lg:flex-col lg:items-center"
                                   >
                                     <span className="mt-0.5 h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10" />
                                     <span className="my-1 w-px min-h-5 flex-1 bg-border" />
                                     <MapPin className="h-3.5 w-3.5 text-drio-blue" />
                                   </div>

                                  {/* Route */}
                                  <div className="flex-1 min-w-0">
                                     <div className="mb-1 grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 sm:flex">
                                       <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                                         From
                                       </span>
                                       <span className="hidden h-2 w-2 shrink-0 rounded-full bg-primary sm:block lg:hidden" />
                                       <p className="min-w-0 truncate text-[13.5px] font-semibold leading-snug text-foreground sm:text-[13px] sm:font-medium sm:leading-tight">
                                         {formatPlace(booking.source)}
                                       </p>
                                     </div>
                                     <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 sm:flex">
                                       <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
                                         To
                                       </span>
                                       <MapPin className="hidden h-2.5 w-2.5 shrink-0 text-drio-blue sm:block lg:hidden" />
                                       <p className="min-w-0 truncate text-[12.5px] leading-snug text-muted-foreground sm:text-[12px] sm:leading-tight">
                                         {formatPlace(booking.destination)}
                                       </p>
                                     </div>
                                    {booking.driverInfo && (
                                         <p className="mt-1.5 flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                                          <span className="min-w-0 truncate font-medium text-foreground/80">{booking.driverInfo.name ?? "Driver"}</span>
                                        {booking.driverRating?.average != null && booking.driverRating.count > 0 ? (
                                          <>
                                            <span>·</span>
                                             <Star aria-hidden="true" className="h-3 w-3 fill-amber-500 text-amber-500" />
                                            <span className="font-semibold text-foreground">
                                              {booking.driverRating.average.toFixed(1)}
                                            </span>
                                          </>
                                        ) : null}
                                      </p>
                                    )}
                                  </div>

                                   <div className="flex w-full min-w-0 max-w-full shrink-0 flex-col items-end gap-1.5 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-2 sm:w-auto">
                                     <span className="min-w-0 break-words text-[14px] font-semibold leading-tight tabular-nums text-foreground max-sm:whitespace-normal sm:whitespace-nowrap sm:text-[12px]">
                                      {formatFare(booking.fare)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                       className={`max-w-full whitespace-nowrap text-[10px] font-medium capitalize ${statusBadgeStyles[booking.status]}`}
                                    >
                                      {booking.status.replace("_", " ")}
                                    </Badge>
                                  </div>
                                </div>

                                {booking.status === "completed" && booking.driver && (
                                   <div className="min-w-0 max-w-full border-t border-border/70 bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3">
                                    {booking.feedback?.reviewedAt ? (
                                      <div>
                                        <div className="flex items-center justify-between gap-3">
                                           <div
                                             role="img"
                                             aria-label={`${booking.feedback.rating ?? 0} out of 5 stars`}
                                             className="flex items-center gap-0.5"
                                           >
                                             {[1, 2, 3, 4, 5].map((rating) => (
                                               <Star
                                                 key={rating}
                                                 aria-hidden="true"
                                                 className={`h-4 w-4 ${(booking.feedback.rating ?? 0) >= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
                                               />
                                             ))}
                                           </div>
                                          <span className="text-[11.5px] font-medium text-muted-foreground">
                                            Your review
                                          </span>
                                        </div>
                                        {booking.feedback.comment && (
                                          <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[12px] leading-relaxed text-muted-foreground">
                                            {booking.feedback.comment}
                                          </p>
                                        )}
                                      </div>
                                    ) : openReviewId === booking._id ? (
                                      <motion.div
                                        initial={reduced ? false : { opacity: 0, y: 4 }}
                                        animate={reduced ? undefined : { opacity: 1, y: 0 }}
                                        transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
                                        className="min-w-0"
                                      >
                                         <p className="break-words text-[12.5px] font-semibold text-foreground">
                                           Rate your ride
                                         </p>
                                        <div
                                          className="mt-2 grid grid-cols-5 items-center gap-1 sm:flex sm:flex-wrap sm:items-center"
                                          role="radiogroup"
                                          aria-label="Rate this ride from 1 to 5 stars"
                                        >
                                          {[1, 2, 3, 4, 5].map((rating) => (
                                            <label
                                              key={rating}
                                              className={`flex h-11 w-full min-w-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground/45 outline-none transition-[color,background-color,border-color,transform] duration-150 hover:border-amber-500/20 hover:bg-amber-500/[0.06] hover:text-amber-500/70 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card motion-safe:hover:-translate-y-px motion-safe:active:scale-95 motion-reduce:transition-none sm:h-10 sm:w-10 sm:flex-none ${historyReviewRating >= rating ? "text-amber-500" : ""}`}
                                            >
                                              <input
                                                type="radio"
                                                name={`history-review-rating-${booking._id}`}
                                                value={rating}
                                                checked={historyReviewRating === rating}
                                                onChange={() => setHistoryReviewRating(rating)}
                                                aria-label={`${rating} star${rating > 1 ? "s" : ""}`}
                                                autoFocus={rating === 1}
                                                className="sr-only"
                                              />
                                              <Star
                                                aria-hidden="true"
                                                className={`h-5 w-5 transition-[fill] duration-150 motion-reduce:transition-none ${historyReviewRating >= rating ? "fill-amber-500" : ""}`}
                                              />
                                            </label>
                                          ))}
                                          {historyReviewRating > 0 && (
                                            <span className="col-span-5 mt-1 text-right text-[12px] font-semibold text-foreground sm:ml-1 sm:mt-0 sm:inline">
                                              {historyReviewRating}/5
                                            </span>
                                          )}
                                        </div>
                                        <Textarea
                                          id={`history-review-${booking._id}`}
                                          aria-label="Review comment"
                                          value={historyReviewComment}
                                          onChange={(event) => setHistoryReviewComment(event.target.value)}
                                          placeholder="Leave a comment (optional)…"
                                          className="mt-2 min-h-[70px] text-base lg:text-sm"
                                          maxLength={500}
                                        />
                                        {historyReviewError && (
                                           <p role="alert" className="mt-2 break-words text-[12px] text-destructive [overflow-wrap:anywhere]">
                                            {historyReviewError}
                                          </p>
                                        )}
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="min-h-11 font-semibold lg:min-h-8"
                                            disabled={historyReviewBusy || historyReviewRating < 1}
                                            onClick={() => void handleSubmitHistoryReview(booking)}
                                          >
                                            {historyReviewBusy ? "Submitting…" : "Submit review"}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="min-h-11 font-semibold text-muted-foreground lg:min-h-8"
                                            disabled={historyReviewBusy}
                                            onClick={closeHistoryReview}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11 w-full font-semibold lg:min-h-8"
                                        disabled={openReviewId !== null || historyReviewBusy}
                                        onClick={() => openHistoryReview(booking)}
                                      >
                                         <Star aria-hidden="true" className="h-4 w-4 text-amber-500" />
                                        Rate this ride
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="loading"
                      className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 py-8 text-center lg:py-16"
                    >
                      <div className="mb-4 flex w-28 flex-col gap-2 lg:hidden" aria-hidden="true">
                        <span className="h-1.5 w-full animate-pulse rounded-full bg-primary/25 motion-reduce:animate-none" />
                        <span className="h-1.5 w-4/5 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
                        <span className="h-1.5 w-3/5 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
                      </div>
                      <div className="mb-4 hidden h-14 w-14 items-center justify-center rounded-full bg-primary/10 lg:flex">
                        <History className="h-7 w-7 text-primary animate-pulse motion-reduce:animate-none" />
                      </div>
                      <p className="text-[15px] font-semibold text-foreground">
                        Loading your trips…
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}

        {/* ── ACCOUNT TAB ───────────────────────────────────────── */}
        {activeTab === "account" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 lg:p-8">
            <div className="w-full max-w-2xl mx-auto space-y-4">
              {/* Profile card */}
              <div className="rounded-3xl border border-border bg-card overflow-hidden">
                {/* Card header band */}
                <div className="h-20 sm:h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent relative">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card/60 to-transparent" />
                </div>
                <div className="px-4 pb-5 sm:px-7 sm:pb-6">
                  <div className="flex items-end gap-3 -mt-7 mb-4">
                    <Avatar size="lg" className="ring-4 ring-card h-14 w-14 sm:h-16 sm:w-16">
                      {user?.image ? (
                        <AvatarImage src={user.image} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-primary/20 text-xl font-bold text-primary">
                        <Initials name={user?.name} email={user?.email} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-[16px] sm:text-[18px] font-semibold text-foreground truncate">
                        {user?.name ?? "Drio Member"}
                      </p>
                      <p className="text-[12px] text-muted-foreground truncate">
                        {user?.email}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/12 border border-primary/20 px-2.5 py-1 text-[10px] font-semibold text-primary">
                      Premier
                    </span>
                  </div>
                </div>
              </div>

              {/* Settings list */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                {[
                  {
                    label: "Saved places",
                    desc: "Home and work addresses",
                    icon: MapPin,
                    iconColor: "text-primary",
                    iconBg: "bg-primary/10",
                  },
                  {
                    label: "Payment methods",
                    desc: "Manage cards and wallets",
                    icon: CircleDollarSign,
                    iconColor: "text-drio-success",
                    iconBg: "bg-drio-success/10",
                  },
                  {
                    label: "Notifications",
                    desc: "Ride updates and offers",
                    icon: Clock,
                    iconColor: "text-drio-blue",
                    iconBg: "bg-drio-blue/10",
                  },
                ].map(({ label, desc, icon: Icon, iconColor, iconBg }) => (
                  <button
                    key={label}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 text-left hover:bg-secondary/50 active:bg-secondary/70 transition-colors group"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl border border-border ${iconBg}`}>
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-foreground">
                        {label}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>
                ))}
              </div>

              {/* Sign out */}
              <Button
                variant="outline"
                id="account-signout-btn"
                className="w-full font-semibold rounded-2xl h-11 text-destructive border-destructive/20 hover:bg-destructive/8 hover:border-destructive/30"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                Sign out of Drio
              </Button>
            </div>
          </div>
        )}

        </div>
      </MotionPage>
      <BottomNav activeTab={activeTab} onTabChange={handleTabClick} />
    </div>
  );
}
