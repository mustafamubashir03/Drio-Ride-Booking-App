import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Banknote, Car, Home, LogOut, Navigation, User as UserIcon } from "lucide-react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
import { useDriverSocket } from "@/hooks/use-driver-socket";
import { IncomingRideRequest } from "@/components/driver/IncomingRideRequest";
import { ensureDriverAvailability, useConfirmBookingMutation } from "@/hooks/queries/use-driver";
import { queryKeys } from "@/lib/query-keys";

const navItems: Array<{
  to: string;
  end?: boolean;
  label: string;
  icon: typeof Home;
  accent: "primary" | "blue" | "green" | "violet";
}> = [
  { to: "/driver/dashboard", end: true, label: "Home", icon: Home, accent: "primary" },
  { to: "/driver/dashboard/rides", label: "Rides", icon: Navigation, accent: "blue" },
  { to: "/driver/dashboard/earnings", label: "Earnings", icon: Banknote, accent: "green" },
  { to: "/driver/dashboard/profile", label: "Profile", icon: UserIcon, accent: "violet" },
];

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
  green: {
    button: "bg-drio-success/12 text-drio-success",
    chip: "bg-drio-success/15 text-drio-success",
    ident: "bg-drio-success",
  },
  violet: {
    button: "bg-drio-violet/12 text-drio-violet",
    chip: "bg-drio-violet/15 text-drio-violet",
    ident: "bg-drio-violet",
  },
};

const TITLES: Record<string, string> = {
  "": "Driver Home",
  rides: "Rides",
  earnings: "Earnings",
  profile: "Profile",
};

function pageTitleFor(pathname: string) {
  const base = "/driver/dashboard";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const key = rest.replace(/^\/+/, "").split("/")[0] ?? "";
  return TITLES[key] ?? "Driver Portal";
}

interface IncomingRideRequestData {
  rideId: string;
  pickup: string;
  destination: string;
  fare: number;
  distance?: number;
  passengerName?: string;
  passengerImage?: string | null;
  expiresAt: number;
}

export type DriverDashboardContext = {
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  emitLocation: (location: {
    driverId: string;
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    timestamp: number;
  }) => void;
  /** Incremented whenever the driver accepts a ride mid-session so active readers refetch. */
  rideRefreshKey: number;
};

export default function DriverLayout() {
  const { reduced } = useMotionSystem();
  const { data: session } = authClient.useSession();
  const user = (session as unknown as {
    user?: { name?: string; email?: string };
  })?.user;
  const driverId = (session as unknown as { user?: { id?: string } })?.user?.id;
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirmMutation = useConfirmBookingMutation();

  const [incomingRide, setIncomingRide] = useState<IncomingRideRequestData | null>(null);
  const handledRideIdsRef = useRef<Set<string>>(new Set());
  const [acceptingRideId, setAcceptingRideId] = useState<string | null>(null);
  const [rideRefreshKey, setRideRefreshKey] = useState(0);

  const handleNewRideNotification = useCallback(
    (data: {
      rideId: string;
      rideInfo: { pickup: string; destination: string; fare: number; distance?: number; passengerName?: string; passengerImage?: string | null };
      timeStamps: string;
    }) => {
      if (handledRideIdsRef.current.has(data.rideId)) return;
      const expiresAt = Date.now() + 15000; // 15 seconds from now
      setIncomingRide({
        rideId: data.rideId,
        pickup: data.rideInfo.pickup,
        destination: data.rideInfo.destination,
        fare: data.rideInfo.fare,
        distance: data.rideInfo.distance,
        passengerName: data.rideInfo.passengerName,
        passengerImage: data.rideInfo.passengerImage ?? null,
        expiresAt,
      });
    },
    []
  );

  const handleDismissIncomingRide = useCallback(() => {
    setIncomingRide((cur) => {
      if (cur) handledRideIdsRef.current.add(cur.rideId);
      return null;
    });
  }, []);

  const handleRemoveRideNotification = useCallback((rideId: string) => {
    handledRideIdsRef.current.add(rideId);
    setIncomingRide((cur) => (cur && cur.rideId === rideId ? null : cur));
  }, []);

  const handleRideStatusUpdate = useCallback(
    (data: { rideId: string; status: string }) => {
      // Re-pull the driver's active ride when the ride moves to a terminal
      // state (cancelled/completed), so a stale live-trip screen doesn't linger
      // after the passenger cancels or the sweep expires the no-driver search.
      if (data.status === "cancelled" || data.status === "completed") {
        handledRideIdsRef.current.add(data.rideId);
        setRideRefreshKey((k) => k + 1);
        setIncomingRide((cur) => (cur && cur.rideId === data.rideId ? null : cur));
        // Targeted: a terminal status is persisted server state, so the cached
        // active ride is refreshed. Non-terminal updates and incoming ride
        // offers are realtime UI concerns and invalidate nothing.
        void queryClient.invalidateQueries({ queryKey: queryKeys.driver.activeRide() });
      }
    },
    [queryClient]
  );

  const { connected, connect, disconnect, emitLocation } = useDriverSocket(
    driverId,
    handleNewRideNotification,
    handleRemoveRideNotification,
    handleRideStatusUpdate
  );

  const handleAcceptRide = useCallback(async (rideId: string) => {
    setAcceptingRideId(rideId);
    try {
      // The mutation refreshes the active ride, the ride history and earnings;
      // the context bump is kept so any other consumer of the signal still runs.
      await confirmMutation.mutateAsync(rideId);
      handledRideIdsRef.current.add(rideId);
      setIncomingRide((cur) => (cur && cur.rideId === rideId ? null : cur));
      setRideRefreshKey((k) => k + 1);
    } catch (e) {
      // 409 = "Ride is no longer available" — the card is stale either way.
      if ((e as { status?: number }).status === 409) {
        handledRideIdsRef.current.add(rideId);
      }
      setRideRefreshKey((k) => k + 1);
      setIncomingRide((cur) => (cur && cur.rideId === rideId ? null : cur));
      const err = e as { status?: number };
      if (err.status !== 409) {
        console.error("[Driver] Could not confirm ride", e);
      }
    } finally {
      setAcceptingRideId(null);
    }
  }, [confirmMutation]);

  // If the driver's persisted status is already "online", connect automatically
  // on mount (same connect() the toggle path uses) so a page reload doesn't
  // leave the driver with no live socket. One-shot read through the shared
  // cache rather than a private request.
  useEffect(() => {
    void ensureDriverAvailability(queryClient)
      .then((value) => {
        if (value.status === "online") connect();
      })
      .catch(() => {
        // ignore — DriverHome surfaces availability errors; this is only the reconnect trigger.
      });
    // run once on mount; explicit toggling handles reconnect after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss incoming ride request after 15 seconds
  useEffect(() => {
    if (!incomingRide) return;
    const timer = setTimeout(() => {
      setIncomingRide(null);
    }, incomingRide.expiresAt - Date.now());
    return () => clearTimeout(timer);
  }, [incomingRide]);

  const handleSignOut = async () => {
    await authClient.signOut({ disableRedirect: false, callbackURL: "/login" });
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-[64px] shrink-0 items-center px-5">
          <Logo />
        </div>

        <div className="mb-1 px-3">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Driver
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const accent = navAccentStyles[item.accent];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                    isActive
                      ? accent.button
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? accent.chip
                          : "bg-white/5 text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {item.label}
                    {isActive && (
                      <motion.span
                        layoutId="driver-nav-active"
                        className={cn("ml-auto h-1.5 w-1.5 rounded-full", accent.ident)}
                        transition={{
                          duration: reduced ? 0 : 0.18,
                          ease: "easeOut",
                        }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mx-3 my-4 rounded-2xl bg-primary/8 border border-primary/15 p-4">
          <p className="text-xs font-semibold text-primary mb-1">Driver portal</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
             Go online from Home to start receiving nearby ride requests. Accepted rides appear here automatically.
          </p>
        </div>

        <div className="border-t border-border px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
              {(user?.name ?? "D").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">
                {user?.name ?? "Driver"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">Driver</p>
            </div>
          </div>
          <AccountSwitcher>
            <Link to="/dashboard" className="mt-1 block">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <Car className="h-3.5 w-3.5" />
                Passenger app
              </Button>
            </Link>
            <button
              onClick={handleSignOut}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </AccountSwitcher>
        </div>
      </aside>

      {/* Main */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:ml-[220px]">
        <header className="hidden h-[64px] shrink-0 items-center justify-between border-b border-border px-8 lg:flex">
          <h1 className="font-serif text-[20px] font-bold tracking-tight text-foreground leading-tight">
            {pageTitleFor(location.pathname)}
          </h1>
          <span className="rounded-full bg-drio-success/15 px-3 py-1 text-[11px] font-semibold text-drio-success">
            ● Driver
          </span>
        </header>

        {/* Mobile header */}
        <header className="relative z-[60] flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
              <Logo className="!text-[1rem]" />
            </span>
            <h1 className="truncate text-[14px] font-semibold text-foreground">
              {pageTitleFor(location.pathname)}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <AccountSwitcher compact placement="bottom">
              <span />
            </AccountSwitcher>
            <span className="rounded-full bg-drio-success/15 px-2.5 py-1 text-[10px] font-semibold text-drio-success">
              ● Driver
            </span>
          </div>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(60px+env(safe-area-inset-bottom))] lg:pb-0">
          {incomingRide ? (
            <div className="contents lg:block lg:shrink-0 lg:p-4">
              <IncomingRideRequest
                rideId={incomingRide.rideId}
                pickup={incomingRide.pickup}
                destination={incomingRide.destination}
                fare={incomingRide.fare}
                distance={incomingRide.distance}
                passengerName={incomingRide.passengerName}
                passengerImage={incomingRide.passengerImage}
                expiresAt={incomingRide.expiresAt}
                onDismiss={handleDismissIncomingRide}
                onAccept={handleAcceptRide}
                accepting={acceptingRideId === incomingRide.rideId}
                inline
              />
            </div>
          ) : null}
          <Outlet
            context={
              { connected, connect, disconnect, emitLocation, rideRefreshKey } satisfies DriverDashboardContext
            }
          />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 w-screen lg:hidden"
          aria-label="Driver navigation"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-sidebar/90 backdrop-blur-xl border-t border-border" />

          <div className="relative flex h-[60px] items-stretch">
            {navItems.map((item) => {
              const Icon = item.icon;
              const accent = navAccentStyles[item.accent];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="relative flex flex-1 flex-col items-center justify-center gap-[3px] transition-colors duration-150 motion-safe:active:scale-[0.98] motion-reduce:transition-none"
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="driver-nav-pill"
                          className={cn("absolute inset-x-[20%] top-[6px] h-[32px] rounded-xl", {
                            "bg-primary/10": item.accent === "primary",
                            "bg-drio-blue/10": item.accent === "blue",
                            "bg-drio-success/10": item.accent === "green",
                            "bg-drio-violet/10": item.accent === "violet",
                          })}
                           transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center">
                        <Icon
                          className={cn("h-[18px] w-[18px] transition-colors duration-150", {
                            [accent.chip.replace("bg-", "text-").split(" ")[0] + " " + accent.button.split(" ")[1]]: isActive,
                            "text-muted-foreground": !isActive,
                          })}
                        />
                      </span>
                      <span
                        className={cn(
                          "relative z-10 text-[10px] font-semibold tracking-wide leading-none transition-colors duration-150",
                          isActive ? accent.button.split(" ")[1] : "text-muted-foreground/70"
                        )}
                      >
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

    </div>
  );
}