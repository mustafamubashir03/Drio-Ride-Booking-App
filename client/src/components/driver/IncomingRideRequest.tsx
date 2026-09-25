import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2, MapPin, Navigation, Timer, UserRound, X } from "lucide-react";
import { useMotionSystem } from "@/motion/use-motion";
import { formatFare } from "@/lib/format";
import { cn } from "@/lib/utils";

interface IncomingRideRequestProps {
  rideId: string;
  pickup: string;
  destination: string;
  fare: number;
  distance?: number;
  passengerName?: string;
  expiresAt: number;
  onDismiss: () => void;
  onAccept?: (rideId: string) => void;
  accepting?: boolean;
  inline?: boolean;
}

export function IncomingRideRequest({
  rideId,
  pickup,
  destination,
  fare,
  distance,
  passengerName,
  expiresAt,
  onDismiss,
  onAccept,
  accepting,
  inline = false,
}: IncomingRideRequestProps) {
  const { reduced } = useMotionSystem();
  const [totalSeconds] = useState(() => {
    const raw = Math.ceil((expiresAt - Date.now()) / 1000);
    return Math.max(1, raw);
  });
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const raw = Math.ceil((expiresAt - Date.now()) / 1000);
    return Math.max(0, raw);
  });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
  }, [rideId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

  const cardVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: reduced ? 0 : 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
    exit: { opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: reduced ? 0 : 0.2, ease: [0.55, 0.055, 0.675, 0.19] as const } },
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={rideId}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn(
          "pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 w-auto",
          inline
            ? "lg:relative lg:inset-auto lg:z-auto lg:w-full"
            : "lg:hidden",
        )}
      >
         <Card
           ref={cardRef}
           tabIndex={-1}
           role="dialog"
           aria-label="New ride request"
           className="pointer-events-auto max-h-[calc(100dvh-8.25rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain border-destructive/25 bg-card/95 shadow-xl backdrop-blur-sm focus-within:border-destructive/40 focus-within:ring-1 focus-within:ring-destructive/20 lg:max-h-none lg:overflow-hidden lg:shadow-2xl"
         >
           <span className="sr-only" role="status">New ride request received</span>
           <CardContent>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                    <Timer className="h-4 w-4 text-destructive" />
                  </div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground">New Ride Request</p>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                   Expires in <span aria-live="off" className="font-mono font-semibold tabular-nums text-destructive">{remainingSeconds}s</span>
                </p>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Dismiss ride request"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Separator className="my-3" />

            {passengerName && (
              <div className="mb-3 flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/35 px-3 py-2.5">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="truncate text-[12.5px] font-medium text-foreground">
                  {passengerName}
                </p>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Pickup</p>
                  <p className="truncate text-[13px] font-medium leading-snug text-foreground">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-drio-blue" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Destination</p>
                  <p className="truncate text-[13px] font-medium leading-snug text-foreground">{destination}</p>
                </div>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/80 bg-muted/35 px-2.5 py-2.5 text-center transition-colors duration-200">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Fare</p>
                <p className="mt-0.5 text-[14px] font-bold leading-tight tabular-nums text-foreground">{formatFare(fare)}</p>
              </div>
              {distance !== undefined && (
                <div className="rounded-xl border border-border/80 bg-muted/35 px-2.5 py-2.5 text-center transition-colors duration-200">
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Distance</p>
                  <p className="mt-0.5 text-[13px] font-semibold leading-tight tabular-nums text-foreground">{distance.toFixed(1)} km</p>
                </div>
              )}
              <div className="rounded-xl border border-border/80 bg-muted/35 px-2.5 py-2.5 text-center transition-colors duration-200">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Timer</p>
                <p className="mt-0.5 font-mono text-[14px] font-bold leading-tight tabular-nums text-destructive">{remainingSeconds}s</p>
              </div>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-destructive to-amber-500"
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  transition: reduced ? "none" : "width 1000ms linear",
                }}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="min-w-0 flex-1 justify-center gap-2 motion-reduce:transform-none motion-reduce:active:scale-100"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
                Dismiss
              </Button>
              <Button
                className="min-w-0 flex-1 justify-center gap-2 motion-reduce:transform-none motion-reduce:active:scale-100"
                onClick={() => onAccept?.(rideId)}
                disabled={accepting}
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {accepting ? "Confirming…" : "Accept Booking"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}