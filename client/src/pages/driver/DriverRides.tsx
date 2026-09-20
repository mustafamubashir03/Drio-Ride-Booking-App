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

const statusBadgeStyles: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  confirmed: "bg-drio-success/15 text-drio-success border-drio-success/25",
  arriving: "bg-amber-500/15 text-amber-500 border-amber-500/25",
  arrived: "bg-primary/15 text-primary border-primary/25",
  in_progress: "bg-drio-success/15 text-drio-success border-drio-success/25",
  completed: "bg-primary/15 text-primary border-primary/25",
  cancelled: "bg-muted/40 text-muted-foreground border-border",
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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <History className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              Loading your rides…
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/30 bg-card px-6 py-20 text-center">
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
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
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
          <>
            {groups.map((group, idx) => (
              <div key={idx}>
                <p className="mb-3 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
                  {group.dateLabel}
                </p>
                <div className="space-y-3">
                  {group.items.map((ride) => (
                    <div
                      key={ride._id}
                      title={`Booking ${ride._id}`}
                      className="rounded-2xl border border-border bg-card overflow-hidden"
                    >
                      <div className="flex items-center gap-4 px-5 py-4">
                        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-secondary border border-border">
                          <Car className="h-6 w-6 text-muted-foreground/40" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2.5 mb-1.5">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {formatPlace(ride.source)}
                            </p>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <Navigation className="mt-0.5 h-3 w-3 shrink-0 text-drio-blue" />
                            <p className="truncate text-[12.5px] text-muted-foreground">
                              {formatPlace(ride.destination)}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[16px] font-sans font-bold text-foreground">
                            {formatFare(ride.fare)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {ride.distance ? formatDistance(ride.distance) : "—"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`mt-1.5 ${statusBadgeStyles[ride.status]}`}
                          >
                            {DRIVER_RIDE_STATUS_LABEL[ride.status]}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}