import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchDriverRides,
  DRIVER_RIDE_STATUS_LABEL,
  type DriverRide,
} from "@/lib/driver-api";
import {
  formatDate,
  formatDistance,
  formatFare,
  formatPlace,
} from "@/lib/format";
import { Car, History, MapPin, Navigation, RefreshCcw } from "lucide-react";
import { MotionPage } from "@/motion/MotionPage";
import { motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";

const statusBadgeStyles: Record<DriverRide["status"], string> = {
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-500",
  confirmed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  arriving: "border-drio-blue/25 bg-drio-blue/10 text-drio-blue",
  arrived: "border-primary/25 bg-primary/10 text-primary",
  in_progress: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  completed: "border-drio-success/25 bg-drio-success/10 text-drio-success",
  cancelled: "border-destructive/25 bg-destructive/10 text-destructive",
};

function groupRidesByDate(rides: DriverRide[]) {
  const groups: Array<{ dateLabel: string; items: DriverRide[] }> = [];
  for (const ride of rides) {
    const dateLabel = formatDate(ride.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.items.push(ride);
      continue;
    }
    groups.push({ dateLabel, items: [ride] });
  }
  return groups;
}

export default function DriverRides() {
  const [rides, setRides] = useState<DriverRide[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const { stagger, reduced } = useMotionSystem();

  const load = async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    setError(null);
    try {
      const list = await fetchDriverRides();
      if (seq !== requestSeq.current) return;
      setRides(list);
      setStatus("success");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not load your rides.");
    }
  };

  useEffect(() => {
    void load();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupRidesByDate(rides);

  return (
    <MotionPage className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <History className="h-7 w-7 text-primary animate-pulse motion-reduce:animate-none" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              Loading your rides…
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/25 bg-destructive/5 px-6 py-20 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <History className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-[15px] font-semibold text-destructive">
              Could not load your rides
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {error ?? "Something went wrong while loading your rides."}
            </p>
            <Button size="sm" className="mt-6 font-semibold" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {status === "success" && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Car className="h-7 w-7 text-primary" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">No rides yet</p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Once a ride is assigned to you, it will show up here with its live
              status and earnings.
            </p>
            <Button size="sm" className="mt-6 font-semibold" onClick={() => void load()}>
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        )}

        {status === "success" && groups.length > 0 && (
          <motion.div
            className="space-y-6"
            variants={stagger.container}
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            {groups.map((group) => (
              <motion.div key={group.dateLabel} variants={stagger.item}>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.dateLabel}
                </p>
                <div className="space-y-3">
                  {group.items.map((ride) => (
                    <motion.div
                      key={ride._id}
                      title={`Booking ${ride._id}`}
                      variants={stagger.item}
                      className="overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-200"
                    >
                      <div className="flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-primary/80">
                          <Car className="h-6 w-6" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Pickup</p>
                              <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                                {formatPlace(ride.source)}
                              </p>
                            </div>
                          </div>
                          <div className="flex min-w-0 items-start gap-2.5">
                            <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-drio-blue" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Destination</p>
                              <p className="truncate text-[12.5px] leading-snug text-muted-foreground">
                                {formatPlace(ride.destination)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex w-full shrink-0 flex-col items-start sm:w-auto sm:items-end sm:text-right">
                          <p className="whitespace-nowrap text-[17px] font-bold tracking-tight tabular-nums text-foreground">
                            {formatFare(ride.fare)}
                          </p>
                          <p className="mt-0.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                            {ride.distance ? formatDistance(ride.distance) : "—"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`mt-2 font-semibold ${statusBadgeStyles[ride.status]}`}
                          >
                            {DRIVER_RIDE_STATUS_LABEL[ride.status]}
                          </Badge>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </MotionPage>
  );
}