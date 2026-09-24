import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2, MapPin, Navigation, Timer, UserRound, X } from "lucide-react";
import { useMotionSystem } from "@/motion/use-motion";
import { formatFare } from "@/lib/format";

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

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

  const cardVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: reduced ? 0 : 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
    exit: { opacity: 0, scale: 0.98, transition: { duration: reduced ? 0 : 0.2, ease: [0.55, 0.055, 0.675, 0.19] as const } },
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={rideId}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[380px]"
      >
        <Card className="pointer-events-auto max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain shadow-2xl border-destructive/30 bg-card lg:max-h-none lg:overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/15">
                    <Timer className="h-4 w-4 text-destructive" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground">New Ride Request</p>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Expires in <span className="font-mono font-semibold text-destructive">{remainingSeconds}s</span>
                </p>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Dismiss ride request"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Separator className="my-3" />

            {passengerName && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-secondary/50 border border-border px-3 py-2">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="truncate text-[12.5px] font-medium text-foreground">
                  {passengerName}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pickup</p>
                  <p className="truncate text-[13px] font-medium text-foreground">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-drio-blue" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Destination</p>
                  <p className="truncate text-[13px] font-medium text-foreground">{destination}</p>
                </div>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fare</p>
                <p className="mt-0.5 text-[14px] font-bold text-foreground">{formatFare(fare)}</p>
              </div>
              {distance !== undefined && (
                <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Distance</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-foreground">{distance.toFixed(1)} km</p>
                </div>
              )}
              <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Timer</p>
                <p className="mt-0.5 text-[14px] font-bold text-destructive font-mono">{remainingSeconds}s</p>
              </div>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-destructive via-destructive/80 to-amber-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 justify-center gap-2"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
                Dismiss
              </Button>
              <Button
                className="flex-1 justify-center gap-2"
                onClick={() => onAccept?.(rideId)}
                disabled={accepting}
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
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