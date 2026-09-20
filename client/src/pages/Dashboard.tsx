import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import Map from "@/components/Map";
import PlaceSearchField from "@/components/PlaceSearchField";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoute } from "@/hooks/use-route";
import { fetchBookings, type BookingRecord, type BookingStatus } from "@/lib/bookings-api";
import type { PlaceResult, SelectedLocation } from "@/lib/places-api";
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
  Star,
  Phone,
  MessageSquare,
  Circle,
  CircleDollarSign,
} from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";

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
  { id: "premium", label: "Ride", icon: Car, eta: "4 min", price: "$8–12", accent: "primary" },
  { id: "suv", label: "Ride XL", icon: Car, eta: "6 min", price: "$14–18", accent: "blue" },
  { id: "lux", label: "Lux", icon: Car, eta: "9 min", price: "$22–30", accent: "violet" },
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

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const user = (session as unknown as { user?: { name?: string; email?: string; image?: string } })?.user;
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

  useEffect(() => {
    fromLocationRef.current = fromLocation;
  }, [fromLocation]);

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
            displayName: `Your current position · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
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
      displayName: `Dropped pin · ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
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
      let data: { success?: boolean; message?: string; booking?: { _id?: string } } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        // fall through with empty data
      }
      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not create your booking.");
      }
      setBookingId(data.booking?._id ?? null);
      setRideBooked(true);
      setBookingState("idle");
    } catch (e) {
      setBookingState("error");
      setBookingError(
        e instanceof Error ? e.message : "Could not create your booking.",
      );
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  const selectedVehicle = vehicleTypes.find((v) => v.id === vehicle)!;

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

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-20 flex w-[220px] flex-col border-r bg-sidebar"
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
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${accent.ident}`} />
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
      <div className="ml-[220px] flex-1 flex flex-col min-h-dvh">
        {/* Top bar */}
        <header className="flex h-[64px] items-center justify-between border-b border-border px-8 shrink-0">
          <div>
            <h1 className="font-serif text-[20px] font-bold tracking-tight text-foreground leading-tight">
              {activeTab === "home" && "Book a Ride"}
              {activeTab === "history" && "Ride History"}
              {activeTab === "account" && "My Account"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-drio-success/15 px-3 py-1 text-[11px] font-semibold text-drio-success">
              ● Online
            </span>
          </div>
        </header>

        {/* ── HOME TAB ──────────────────────────────────────────── */}
        {activeTab === "home" && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: booking panel */}
            <div className="flex w-[380px] shrink-0 flex-col border-r border-border overflow-y-auto">
              <div className="flex-1 p-6 space-y-5">
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
                    id="pickup"
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
                    id="dropoff"
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
                  id="route-info"
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
                  <div className="grid grid-cols-3 gap-2.5">
                    {vehicleTypes.map((v) => {
                      const isSelected = vehicle === v.id;
                      const accent = vehicleAccentStyles[v.accent];
                      return (
                        <button
                          key={v.id}
                          type="button"
                          id={`vehicle-${v.id}`}
                          onClick={() => setVehicle(v.id)}
                          className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-all duration-200 ${isSelected
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
                        </button>
                      );
                    })}
                  </div>
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
                  id="search-ride-btn"
                  size="lg"
                  className="w-full rounded-2xl text-[14px] font-semibold tracking-wide"
                  onClick={handleBookRide}
                  disabled={bookingState === "loading"}
                >
                  {bookingState === "loading"
                    ? "Booking ride…"
                    : "Search for a ride"}
                </Button>
                {bookingError && (
                  <p
                    id="booking-error"
                    className="text-[12px] text-destructive"
                  >
                    {bookingError}
                  </p>
                )}
              </div>
            </div>

            {/* Right: map / status panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* MapLibre map area */}
              <div className="relative flex-1 overflow-hidden bg-drio-deep">
                <Map
                  className="h-full w-full"
                  from={fromLocation}
                  to={toLocation}
                  route={route}
                  pickMode={mapPickMode}
                  onPickPoint={handleMapPick}
                />

                {/* Warm accent overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[360px] w-[360px] rounded-full bg-primary/6 blur-3xl" />
                </div>
              </div>

              {/* Driver card — shown when booked */}
              {rideBooked && (
                <div className="border-t border-border bg-card px-6 py-5 animate-in slide-in-from-bottom-4 duration-300">
                  <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                    Driver arriving in{" "}
                    <span className="text-primary">5 mins 30 sec</span>
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <Avatar size="lg">
                          <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                            A
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-drio-success border-2 border-card" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-foreground">
                          Ahmed Muttaquein
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          <span className="text-[12px] text-muted-foreground">
                            4.8 · RX 300 ·{" "}
                            <span className="text-foreground font-medium">
                              White
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary border border-border hover:bg-secondary/80 transition-colors">
                        <Phone className="h-4 w-4 text-foreground" />
                      </button>
                      <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary border border-border hover:bg-secondary/80 transition-colors">
                        <MessageSquare className="h-4 w-4 text-foreground" />
                      </button>
                      <button
                        onClick={() => setRideBooked(false)}
                        className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 h-9 text-[12px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Trip details strip */}
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    {[
                      {
                        label: "Starting point",
                        value:
                          fromLocation?.displayName ??
                          fromLocation?.name ??
                          "Al Habib Apart...",
                      },
                      {
                        label: "Destination",
                        value:
                          toLocation?.displayName ??
                          toLocation?.name ??
                          "Street No.52, De...",
                      },
                      {
                        label: "Distance",
                        value: route
                          ? formatDistance(route.distance)
                          : "—",
                      },
                      {
                        label: "Travel time",
                        value: route
                          ? formatDuration(route.duration)
                          : "45 mins",
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

                  {bookingId && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Booking confirmed · ID{" "}
                      <span className="font-mono text-foreground/80">
                        {bookingId}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ───────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto space-y-6">
                {(historyStatus === "idle" || historyStatus === "loading") && (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
                    <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <History className="h-7 w-7 text-primary animate-pulse" />
                    </div>
                    <p className="text-[15px] font-semibold text-foreground">
                      Loading your trips…
                    </p>
                  </div>
                )}

                {historyStatus === "error" && (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/30 bg-card px-6 py-20 text-center">
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
                  </div>
                )}

                {historyStatus === "success" && historyGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
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
                      className="mt-6 font-semibold"
                      onClick={() => setActiveTab("home")}
                    >
                      Book a ride
                    </Button>
                  </div>
                )}

                {historyStatus === "success" && historyGroups.length > 0 && (
                  <>
                    {historyGroups.map((group, idx) => (
                      <div key={idx}>
                        <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                          {group.dateLabel}
                        </p>
                        {group.items.map((booking) => (
                          <div
                            key={booking._id}
                            title={`Booking ${booking._id}`}
                            className="rounded-2xl border border-border bg-card hover:border-border/80 transition-colors overflow-hidden"
                          >
                            <div className="flex items-center gap-4 px-5 py-4">
                              {/* Car thumbnail */}
                              <div className="h-[58px] w-[90px] rounded-xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden border border-border">
                                <Car className="h-8 w-8 text-muted-foreground/40" />
                              </div>

                              {/* Route */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2.5 mb-2">
                                  <Circle className="h-2.5 w-2.5 fill-primary text-primary mt-1 shrink-0" />
                                  <p className="text-[13px] text-foreground font-medium leading-snug truncate">
                                    {formatPlace(booking.source)}
                                  </p>
                                </div>
                                <div className="flex items-start gap-2.5">
                                  <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                  <p className="text-[12.5px] text-muted-foreground leading-snug truncate">
                                    {formatPlace(booking.destination)}
                                  </p>
                                </div>
                              </div>

                              {/* Stats */}
                              <div className="text-right shrink-0">
                                <p className="text-[16px] font-sans font-bold text-foreground">
                                  —
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  —
                                </p>
                                <span
                                  className={`inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${statusBadgeStyles[booking.status]}`}
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {booking.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ACCOUNT TAB ───────────────────────────────────────── */}
        {activeTab === "account" && (
          <div className="flex flex-1 overflow-y-auto p-8">
            <div className="w-full max-w-2xl mx-auto space-y-5">
              {/* Profile card */}
              <div className="rounded-3xl border border-border bg-card overflow-hidden">
                {/* Card header band */}
                <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent relative">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card/60 to-transparent" />
                </div>
                <div className="px-7 pb-7">
                  <div className="flex items-end gap-5 -mt-8 mb-6">
                    <Avatar size="lg" className="ring-4 ring-card h-16 w-16">
                      {user?.image ? (
                        <AvatarImage src={user.image} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-primary/20 text-2xl font-bold text-primary">
                        <Initials name={user?.name} email={user?.email} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="pb-1">
                      <p className="text-[18px] font-semibold text-foreground">
                        {user?.name ?? "Drio Member"}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                    <div className="ml-auto pb-1">
                      <span className="rounded-full bg-primary/12 border border-primary/20 px-3.5 py-1.5 text-[11px] font-semibold text-primary">
                        Premier Member
                      </span>
                    </div>
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
                  },
                  {
                    label: "Payment methods",
                    desc: "Manage cards and wallets",
                    icon: CircleDollarSign,
                    iconColor: "text-drio-success",
                  },
                  {
                    label: "Notifications",
                    desc: "Ride updates and offers",
                    icon: Clock,
                    iconColor: "text-drio-blue",
                  },
                ].map(({ label, desc, icon: Icon, iconColor }) => (
                  <button
                    key={label}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-secondary/50 transition-colors group"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary border border-border">
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </span>
                    <div className="flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground">
                        {label}
                      </p>
                      <p className="text-[12px] text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
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
    </div>
  );
}