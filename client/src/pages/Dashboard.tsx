import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import Map from "@/components/Map";
import PlaceSearchField from "@/components/PlaceSearchField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoute } from "@/hooks/use-route";
import { useNavigationRoute, type NavigationPhase } from "@/hooks/use-navigation-route";
import { usePassengerSocket, type DriverLocationData, type RideStatusUpdateData } from "@/hooks/use-passenger-socket";
import { fetchBookings, cancelBooking, submitBookingReview, type BookingCancelledBy, type BookingDriverInfo, type BookingDriverLocation, type BookingRecord, type BookingStatus } from "@/lib/bookings-api";
import { formatFare } from "@/lib/format";
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
  { id: "premium", label: "Ride", icon: Car, eta: "4 min", price: "PKR 8–12", accent: "primary" },
  { id: "suv", label: "Ride XL", icon: Car, eta: "6 min", price: "PKR 14–18", accent: "blue" },
  { id: "lux", label: "Lux", icon: Car, eta: "9 min", price: "PKR 22–30", accent: "violet" },
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
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  confirmed: "bg-drio-success/15 text-drio-success border-drio-success/25",
  arriving: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  arrived: "bg-primary/15 text-primary border-primary/25",
  in_progress: "bg-drio-success/15 text-drio-success border-drio-success/25",
  cancelled: "bg-muted/40 text-muted-foreground border-border",
  completed: "bg-primary/15 text-primary border-primary/25",
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
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {item.label}
          </p>
          <p className="text-[13px] font-semibold text-foreground mt-0.5">
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
  const user = (session as unknown as { user?: { id?: string; name?: string; email?: string; image?: string } })?.user;
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
  const [bookingDriverId, setBookingDriverId] = useState<string | null>(null);
  const [bookingDriverInfo, setBookingDriverInfo] =
    useState<BookingDriverInfo>(null);
  const [driverLocation, setDriverLocation] = useState<BookingDriverLocation>(null);
  const [bookingCancelledAt, setBookingCancelledAt] = useState<string | null>(null);
  const [bookingCancelledBy, setBookingCancelledBy] =
    useState<BookingCancelledBy>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("other");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [bookingFeedback, setBookingFeedback] =
    useState<BookingRecord["feedback"]>({ rating: null, comment: null, reviewedAt: null });
  const [history, setHistory] = useState<BookingRecord[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestSeq = useRef(0);
  const fromLocationRef = useRef(fromLocation);
  const { route, status: routeStatus, error: routeError } = useRoute(
    fromLocation,
    toLocation,
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
      const next = data.status as BookingStatus;
      if (next) setBookingStatus(next);
      if (data.driverId) setBookingDriverId(data.driverId);
      if (next === "cancelled") {
        setBookingCancelledAt(new Date().toISOString());
        setBookingCancelledBy("driver");
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
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }
    let cancelled = false;
    const resolve = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled || fromLocationRef.current) return;
          const { latitude, longitude } = position.coords;
          setFromLocation({
            id: "current-location",
            name: "Current location",
            displayName: "Your current location",
            latitude,
            longitude,
          });
        },
        () => {
          // permission denied / unavailable — the dropdown's manual
          // "Use my current location" row remains as a fallback
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    };
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
          if (status.state === "denied") return;
          resolve();
        })
        .catch(() => resolve());
    } else {
      resolve();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const loadHistory = async () => {
    const seq = ++historyRequestSeq.current;
    setHistoryStatus("loading");
    setHistoryError(null);
    try {
      const list = await fetchBookings();
      if (seq !== historyRequestSeq.current) return;
      setHistory(list);
      setHistoryStatus("success");
    } catch (e) {
      if (seq !== historyRequestSeq.current) return;
      setHistoryStatus("error");
      setHistoryError(
        e instanceof Error ? e.message : "Could not load your bookings.",
      );
    }
  };

  const handleTabClick = (id: Tab) => {
    setActiveTab(id);
    if (id === "history") {
      void loadHistory();
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
    setBookingState("loading");
    setBookingError(null);
    try {
      const response = await fetch("/api/v1/passenger/bookings", {
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
      setDriverLocation(null);
      setBookingCancelledAt(null);
      setBookingCancelledBy(null);
      setBookingFeedback({ rating: null, comment: null, reviewedAt: null });
      setCancelOpen(false);
      setCancelBusy(false);
      setCancelError(null);
      setReviewRating(0);
      setReviewComment("");
      setReviewBusy(false);
      setReviewError(null);
      setReviewDismissed(false);
      setRideBooked(true);
      setBookingState("idle");
    } catch (e) {
      setBookingState("error");
      setBookingError(
        e instanceof Error ? e.message : "Could not create your booking.",
      );
    }
  };

  const handleCancelRide = async () => {
    if (!bookingId || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const result = await cancelBooking(bookingId, cancelReason);
      setBookingStatus(result.status);
      setBookingFare(result.fare ?? bookingFare);
      setBookingCancelledAt(result.cancelledAt);
      setBookingCancelledBy(result.cancelledBy);
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
    } finally {
      setCancelBusy(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!bookingId || reviewBusy || reviewRating < 1) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      await submitBookingReview(bookingId, reviewRating, reviewComment.trim() || undefined);
      setReviewRating(0);
      setReviewComment("");
      setReviewDismissed(true);
    } catch (e) {
      setReviewError(
        e instanceof Error ? e.message : "Could not submit your review.",
      );
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRideDone = () => {
    setBookingId(null);
    setBookingFare(null);
    setBookingStatus(null);
    setBookingDriverId(null);
    setBookingDriverInfo(null);
    setDriverLocation(null);
    setBookingCancelledAt(null);
    setBookingCancelledBy(null);
    setBookingFeedback({ rating: null, comment: null, reviewedAt: null });
    setCancelOpen(false);
    setCancelBusy(false);
    setCancelError(null);
    setReviewRating(0);
    setReviewComment("");
    setReviewBusy(false);
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
        const list = await fetchBookings();
        if (stopped || seq !== bookingPollSeq.current) return;
        const current = list.find((b) => b._id === bookingId);
        if (!current) return;
        setBookingStatus(current.status);
        setBookingFare(current.fare ?? null);
        setBookingDriverId(current.driver);
        setBookingDriverInfo(current.driverInfo ?? null);
        setBookingCancelledAt(current.cancelledAt ?? null);
        setBookingCancelledBy(current.cancelledBy ?? null);
        setBookingFeedback(
          current.feedback ?? { rating: null, comment: null, reviewedAt: null },
        );
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
        if (
          current.status === "confirmed" ||
          current.status === "cancelled" ||
          current.status === "completed"
        ) {
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
  }, [rideBooked, bookingId]);

  // Reload persistence: on mount, restore an in-flight booking (pending →
  // in_progress) so a page refresh does not strand the passenger. Terminal
  // states are intentionally not restored as an active ride — they live in
  // the History tab.
  const bootedFromHistory = useRef(false);
  useEffect(() => {
    if (!user?.id || bootedFromHistory.current || rideBooked) return;
    bootedFromHistory.current = true;
    let stopped = false;
    const restore = async () => {
      try {
        const list = await fetchBookings();
        if (stopped) return;
        const inFlight = list.find((b) =>
          b.status === "pending" ||
          b.status === "confirmed" ||
          b.status === "arriving" ||
          b.status === "arrived" ||
          b.status === "in_progress",
        );
        if (!inFlight) return;
        setBookingId(inFlight._id);
        setBookingStatus(inFlight.status);
        setBookingFare(inFlight.fare ?? null);
        setBookingDriverId(inFlight.driver);
        setBookingDriverInfo(inFlight.driverInfo ?? null);
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
      } catch {
        // transient — the bookmark will be skipped; user can retry naturally
      }
    };
    void restore();
    return () => {
      stopped = true;
    };
  }, [user?.id, rideBooked]);

  const selectedVehicle = vehicleTypes.find((v) => v.id === vehicle)!;
  const rideFareLabel = bookingFare === null ? selectedVehicle.price : formatFare(bookingFare);

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
          className="rounded-xl border border-border bg-card px-4 py-3"
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
                  className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-all duration-200 hover:scale-[1.01] ${isSelected
                    ? accent.selectedCard
                    : "border-border bg-card hover:border-border/80 hover:bg-secondary"
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
        <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">
              Estimated fare
            </p>
            <p className="text-[18px] font-sans font-bold text-foreground mt-0.5">
              {selectedVehicle.price}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">ETA</p>
            <p className="text-[14px] font-semibold text-foreground mt-0.5">
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
          disabled={bookingState === "loading" || rideBooked}
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
    const panelClass = compact
      ? "px-4 py-4"
      : "border-t border-border bg-card px-6 py-5";
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
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12"
                animate={
                  reduced
                    ? undefined
                    : { scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }
                }
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Search className="h-4 w-4 text-primary" />
              </motion.span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">
                  Searching for a ride
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  Scanning the area for nearby drivers…
                </p>
              </div>
              <Badge
                variant="outline"
                className="ml-auto shrink-0 border-amber-500/25 bg-amber-500/10 text-amber-500"
              >
                Searching
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-[11.5px] text-muted-foreground">
                We&apos;re widening the search nearby — a driver will be
                assigned automatically when one is found.
              </p>
              <button
                type="button"
                id={`${pfx}cancel-search-btn`}
                onClick={() => setCancelOpen(true)}
                className="ml-auto text-[12px] font-semibold text-destructive hover:text-destructive/80 hover:underline transition-colors"
              >
                Cancel search
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
              <Avatar size="sm">
                {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="bg-primary/20 text-[11px] font-bold text-primary">
                  <Initials name={user?.name} email={user?.email} />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-drio-success/12">
                <Car className="h-4 w-4 text-drio-success" />
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
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
                <Avatar size="lg">
                  {bookingDriverInfo.image ? (
                    <AvatarImage src={bookingDriverInfo.image} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-drio-success/15 text-[13px] font-bold text-drio-success">
                    {(bookingDriverInfo.name ?? "D").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Driver
                  </p>
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {bookingDriverInfo.name ?? "Driver"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-secondary" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-20 rounded bg-secondary" />
                  <div className="h-2 w-32 rounded bg-secondary" />
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
                className="mt-4 text-[12px] font-semibold text-destructive hover:text-destructive/80 hover:underline transition-colors"
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60">
                <X className="h-4 w-4 text-muted-foreground" />
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
                className="ml-auto shrink-0 capitalize text-muted-foreground"
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12">
                <CircleDollarSign className="h-4 w-4 text-primary" />
              </div>
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
                className="ml-auto shrink-0 capitalize"
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

            {bookingFeedback?.reviewedAt || reviewDismissed ? (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
                <Star className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500" />
                <p className="text-[12.5px] text-muted-foreground">
                  {bookingFeedback?.reviewedAt
                    ? "Thanks for your review!"
                    : "You can rate your driver anytime from your trip history."}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-4">
                <p className="text-[12.5px] font-semibold text-foreground">
                  How was your driver?
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      onClick={() => setReviewRating(n)}
                       className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${reviewRating >= n
                          ? "text-amber-500"
                          : "text-muted-foreground/40 hover:text-amber-500/60"
                        }`}
                    >
                      <Star
                        className={`h-5 w-5 ${reviewRating >= n ? "fill-amber-500" : ""}`}
                      />
                    </button>
                  ))}
                  {reviewRating > 0 && (
                    <span className="ml-1 text-[12px] font-semibold text-foreground">
                      {reviewRating}/5
                    </span>
                  )}
                </div>
                <Textarea
                  id={`${pfx}review-comment`}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Leave a comment (optional)…"
                  className="mt-3 min-h-[70px]"
                  maxLength={500}
                />
                {reviewError && (
                  <p className="mt-2 text-[12px] text-destructive">
                    {reviewError}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    id={`${pfx}submit-review-btn`}
                    size="sm"
                     className="min-h-11 font-semibold sm:min-h-8"
                    disabled={reviewBusy || reviewRating < 1}
                    onClick={() => void handleSubmitReview()}
                  >
                    {reviewBusy ? "Submitting…" : "Submit review"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                     className="min-h-11 font-semibold text-muted-foreground sm:min-h-8"
                    disabled={reviewBusy}
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/12">
                <X className="h-4 w-4 text-destructive" />
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
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${cancelReason === reason.value
                      ? "border-destructive/40 bg-destructive/8"
                      : "border-border bg-secondary/40 hover:bg-secondary"
                    }`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${cancelReason === reason.value
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
              <p className="mt-3 text-[12px] text-destructive">
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
                disabled={cancelBusy}
                onClick={() => void handleCancelRide()}
              >
                {cancelBusy ? "Cancelling…" : "Cancel ride"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="font-semibold text-muted-foreground"
                disabled={cancelBusy}
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
      <div className="relative flex min-h-0 flex-1 flex-col pb-[calc(60px+env(safe-area-inset-bottom))] lg:min-h-0 lg:ml-[220px] lg:pb-0">
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
              <span className="rounded-full bg-drio-success/15 px-3 py-1 text-[11px] font-semibold text-drio-success">
                {socketConnected ? "● Realtime on" : "● Online"}
              </span>
            </div>
          </header>
        )}

        {/* Top bar (mobile) — hidden on Home tab; map has floating logo instead */}
        {activeTab !== "home" && (
          <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                <Logo className="!text-[1rem]" />
              </span>
              <h1 className="truncate text-[14px] font-semibold text-foreground">
                {activeTab === "history" && "Ride History"}
                {activeTab === "account" && "My Account"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <AccountSwitcher compact placement="bottom">
                <span />
              </AccountSwitcher>
              <span className="rounded-full bg-drio-success/15 px-2.5 py-1 text-[10px] font-semibold text-drio-success">
                {socketConnected ? "● Realtime on" : "● Online"}
              </span>
            </div>
          </header>
        )}

        {activeTab === "home" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:overflow-hidden">
            <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background px-4 pt-[env(safe-area-inset-top)] lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                <Logo className="!text-[1rem]" />
              </span>
              <div className="flex items-center gap-1.5">
                <AccountSwitcher compact placement="bottom">
                  <span />
                </AccountSwitcher>
                <span className="rounded-full bg-drio-success/15 px-2.5 py-1 text-[10px] font-semibold text-drio-success">
                  {socketConnected ? "● Live" : "● Online"}
                </span>
              </div>
            </div>
            <div className="relative h-[clamp(8rem,50svh,28rem)] w-full shrink-0 overflow-hidden bg-drio-deep lg:relative lg:inset-auto lg:z-0 lg:h-auto lg:w-auto lg:flex-1 lg:order-2">
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
            <div className="absolute inset-x-[380px] bottom-0 z-10 hidden max-h-[55%] overflow-y-auto lg:block">
              {renderRideStatusSurface("desktop")}
            </div>
            <div className="relative z-20 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 lg:hidden">
              <div className="w-full overflow-visible rounded-2xl border border-border bg-card shadow-2xl">
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-border" />
                </div>
                {cancelOpen || rideBooked ? (
                  <div className="overscroll-contain">
                    {renderRideStatusSurface("mobile")}
                  </div>
                ) : (
                  <div className="overscroll-contain px-4 pb-4 pt-2">
                    {renderBookingSurface("mobile")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 lg:p-8">
              <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
                <AnimatePresence mode="wait">
                  {historyStatus === "error" ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="error"
                      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/30 bg-card px-6 py-16 text-center"
                    >
                      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                        <History className="h-7 w-7 text-destructive" />
                      </div>
                      <p className="text-[15px] font-semibold text-destructive">
                        Could not load your trips
                      </p>
                      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                        {historyError ??
                          "Something went wrong while loading your trips."}
                      </p>
                      <Button
                        size="sm"
                        className="mt-6 font-semibold"
                        onClick={() => void loadHistory()}
                      >
                        Try again
                      </Button>
                    </motion.div>
                  ) : historyStatus === "success" && historyGroups.length === 0 ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="empty"
                      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center"
                    >
                      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
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
                  ) : historyStatus === "success" ? (
                    <motion.div
                      {...motionStateProps({ variants: page, reduced })}
                      key="list"
                      className="space-y-4"
                    >
                      {historyGroups.map((group, idx) => (
                        <div key={idx}>
                          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2 px-1">
                            {group.dateLabel}
                          </p>
                          <div className="space-y-2">
                            {group.items.map((booking) => (
                              <div
                                key={booking._id}
                                title={`Booking ${booking._id}`}
                                className="rounded-2xl border border-border bg-card hover:bg-secondary/30 active:scale-[0.99] transition-all overflow-hidden"
                              >
                                <div className="flex flex-col items-stretch gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3">
                                  {/* Car icon */}
                                  <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 border border-border">
                                    <Car className="h-5 w-5 text-muted-foreground/50" />
                                  </div>

                                  {/* Route */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                      <p className="text-[13px] text-foreground font-medium leading-tight truncate">
                                        {formatPlace(booking.source)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <MapPin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                      <p className="text-[12px] text-muted-foreground leading-tight truncate">
                                        {formatPlace(booking.destination)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                                    <span className="text-[12px] font-semibold text-foreground">
                                      {formatFare(booking.fare)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] capitalize ${statusBadgeStyles[booking.status]}`}
                                    >
                                      {booking.status.replace("_", " ")}
                                    </Badge>
                                  </div>
                                </div>
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
                      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center"
                    >
                      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                        <History className="h-7 w-7 text-primary animate-pulse" />
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