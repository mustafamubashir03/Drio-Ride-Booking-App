import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Home,
  History,
  User as UserIcon,
  Zap,
  Shield,
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

const navItems = [
  { icon: Home, label: "Home", id: "home" },
  { icon: History, label: "History", id: "history" },
  { icon: UserIcon, label: "Account", id: "account" },
] as const;

type Tab = (typeof navItems)[number]["id"];

const vehicleTypes = [
  { id: "premium", label: "Ride", icon: Car, eta: "4 min", price: "$8–12" },
  { id: "suv", label: "Ride XL", icon: Car, eta: "6 min", price: "$14–18" },
  { id: "lux", label: "Lux", icon: Car, eta: "9 min", price: "$22–30" },
] as const;

const mockHistory = [
  {
    id: "1",
    date: "Feb 23, 2024",
    from: "Al Zaid Hotel, Road 57, National Road",
    to: "Street No.20, Section 60A",
    price: "$54.35",
    duration: "45 mins",
    car: "RX 300",
    color: "White",
    image: "https://i.imgur.com/8mYaK3g.png",
  },
  {
    id: "2",
    date: "Jan 9, 2024",
    from: "Al Majeed Restaurant, Jamshed Road, Karachi",
    to: "Shah Faisal Colony, Street No.1",
    price: "$38.20",
    duration: "32 mins",
    car: "Lexus ES",
    color: "Black",
    image: "https://i.imgur.com/8mYaK3g.png",
  },
  {
    id: "3",
    date: "Nov 28, 2023",
    from: "Regal Chowk, Saddar, Karachi",
    to: "Home, Ali Matwen, Abbotabad",
    price: "$72.10",
    duration: "68 mins",
    car: "BMW 5",
    color: "Black",
    image: "https://i.imgur.com/8mYaK3g.png",
  },
  {
    id: "4",
    date: "March 14, 2023",
    from: "Al Habib Apartments, Block 7",
    to: "Street No.52, DHA Phase 2",
    price: "$29.90",
    duration: "28 mins",
    car: "Camry",
    color: "Silver",
    image: "https://i.imgur.com/8mYaK3g.png",
  },
];

function Initials({ name, email }: { name?: string; email?: string }) {
  const source = name ?? email ?? "U";
  return source.charAt(0).toUpperCase();
}

export default function Dashboard() {
  const { data: session } = authClient.useSession();
  const user = (session as any)?.user;
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [vehicle, setVehicle] = useState<
    (typeof vehicleTypes)[number]["id"]
  >("premium");
  const [rideBooked, setRideBooked] = useState(false);

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  const selectedVehicle = vehicleTypes.find((v) => v.id === vehicle)!;

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
            return (
              <button
                key={item.id}
                type="button"
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 ${isActive
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-white/5 text-muted-foreground group-hover:text-foreground"
                    }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.label}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
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
          <button
            onClick={handleSignOut}
            id="signout-btn"
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
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
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <span className="w-px h-8 bg-border mt-1" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                        From
                      </p>
                      <Input
                        id="pickup"
                        placeholder="Current location"
                        className="border-0 bg-transparent p-0 h-auto text-[13.5px] font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-0"
                      />
                    </div>
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                  </div>

                  <div className="ml-[18px] h-px bg-border my-1" />

                  {/* To */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/60" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
                        To
                      </p>
                      <Input
                        id="dropoff"
                        placeholder="Your destination"
                        className="border-0 bg-transparent p-0 h-auto text-[13.5px] font-medium placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:border-0"
                      />
                    </div>
                    <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </div>

                {/* Vehicle selector */}
                <div>
                  <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                    Choose ride type
                  </p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {vehicleTypes.map((v) => {
                      const isSelected = vehicle === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          id={`vehicle-${v.id}`}
                          onClick={() => setVehicle(v.id)}
                          className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-all duration-200 ${isSelected
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                              : "border-border bg-card hover:border-border/80 hover:bg-secondary"
                            }`}
                        >
                          <Car
                            className={`h-5 w-5 ${isSelected
                                ? "text-primary"
                                : "text-muted-foreground"
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
                  onClick={() => setRideBooked(true)}
                >
                  Search for a ride
                </Button>
              </div>
            </div>

            {/* Right: map / status panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Mock map area */}
              <div className="relative flex-1 overflow-hidden bg-drio-deep">
                {/* Grid pattern to simulate a map */}
                <svg
                  className="absolute inset-0 w-full h-full opacity-[0.07]"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern
                      id="map-grid"
                      x="0"
                      y="0"
                      width="60"
                      height="60"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 60 0 L 0 0 0 60"
                        fill="none"
                        stroke="white"
                        strokeWidth="0.8"
                      />
                    </pattern>
                    <pattern
                      id="map-grid-wide"
                      x="0"
                      y="0"
                      width="240"
                      height="240"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 240 0 L 0 0 0 240"
                        fill="none"
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#map-grid)" />
                  <rect width="100%" height="100%" fill="url(#map-grid-wide)" />
                </svg>

                {/* Warm glow in center */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[360px] w-[360px] rounded-full bg-primary/6 blur-3xl" />
                </div>

                {/* Route line */}
                {rideBooked && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polyline
                      points="25%,70% 38%,52% 52%,42% 65%,30%"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                    />
                    <circle cx="25%" cy="70%" r="5" fill="var(--primary)" />
                    <circle cx="65%" cy="30%" r="5" fill="var(--foreground)" stroke="var(--primary)" strokeWidth="2" />
                  </svg>
                )}

                {/* Map label */}
                {!rideBooked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-3xl bg-card border border-border px-7 py-5 text-center shadow-none">
                      <MapPin className="h-6 w-6 text-primary mx-auto mb-2" />
                      <p className="text-[14px] font-semibold text-foreground">
                        Set your destination
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Enter pickup &amp; drop-off to see your route
                      </p>
                    </div>
                  </div>
                )}

                {/* Nearby cars icons */}
                <div className="absolute top-[30%] left-[40%]">
                  <Car className="h-5 w-5 text-primary/80" />
                </div>
                <div className="absolute top-[50%] left-[60%]">
                  <Car className="h-5 w-5 text-primary/60" />
                </div>
                <div className="absolute top-[20%] left-[70%]">
                  <Car className="h-4 w-4 text-primary/50" />
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
                      { label: "Starting point", value: "Al Habib Apart..." },
                      { label: "Destination", value: "Street No.52, De..." },
                      { label: "Travel time", value: "45 mins" },
                      { label: "Total fare", value: "$54.35" },
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
                </div>
              )}

              {/* Feature strip */}
              {!rideBooked && (
                <div className="border-t border-border bg-card px-6 py-4">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        icon: Zap,
                        label: "Instant booking",
                        color: "text-primary",
                        bg: "bg-primary/10",
                      },
                      {
                        icon: Shield,
                        label: "Trusted drivers",
                        color: "text-drio-success",
                        bg: "bg-drio-success/10",
                      },
                      {
                        icon: Clock,
                        label: "Live tracking",
                        color: "text-muted-foreground",
                        bg: "bg-muted/40",
                      },
                    ].map((f) => {
                      const Icon = f.icon;
                      return (
                        <div key={f.label} className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-xl ${f.bg} shrink-0`}
                          >
                            <Icon className={`h-4 w-4 ${f.color}`} />
                          </span>
                          <p className="text-[12.5px] font-medium text-foreground">
                            {f.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
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
                {mockHistory.length === 0 ? (
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
                ) : (
                  <>
                    {mockHistory.map((ride) => (
                      <div key={ride.id}>
                        <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground mb-3">
                          {ride.date}
                        </p>
                        <div className="rounded-2xl border border-border bg-card hover:border-border/80 transition-colors overflow-hidden">
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
                                  {ride.from}
                                </p>
                              </div>
                              <div className="flex items-start gap-2.5">
                                <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-[12.5px] text-muted-foreground leading-snug truncate">
                                  {ride.to}
                                </p>
                              </div>
                            </div>

                            {/* Stats */}
                            <div className="text-right shrink-0">
                              <p className="text-[16px] font-sans font-bold text-foreground">
                                {ride.price}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {ride.duration}
                              </p>
                              <span className="inline-block mt-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                                {ride.car}
                              </span>
                            </div>
                          </div>
                        </div>
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
                  },
                  {
                    label: "Payment methods",
                    desc: "Manage cards and wallets",
                    icon: CircleDollarSign,
                  },
                  {
                    label: "Notifications",
                    desc: "Ride updates and offers",
                    icon: Clock,
                  },
                ].map(({ label, desc, icon: Icon }) => (
                  <button
                    key={label}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-secondary/50 transition-colors group"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary border border-border">
                      <Icon className="h-4 w-4 text-muted-foreground" />
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