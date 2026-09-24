import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fetchDriverEarnings,
  type DriverEarningsSummary,
} from "@/lib/driver-api";
import { formatFare } from "@/lib/format";
import { Banknote, History, TrendingUp } from "lucide-react";
import { MotionPage } from "@/motion/MotionPage";

const DEFAULT_SUMMARY: DriverEarningsSummary = {
  today: { rides: 0, total: 0 },
  week: { rides: 0, total: 0 },
  all: { rides: 0, total: 0 },
};

export default function DriverEarnings() {
  const [earnings, setEarnings] = useState<DriverEarningsSummary>(DEFAULT_SUMMARY);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    setError(null);
    try {
      const value = await fetchDriverEarnings();
      if (seq !== requestSeq.current) return;
      setEarnings(value);
      setStatus("success");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not load your earnings.");
    }
  };

  useEffect(() => {
    void load();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    {
      label: "Today",
      rides: earnings.today.rides,
      total: earnings.today.total,
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Last 7 days",
      rides: earnings.week.rides,
      total: earnings.week.total,
      icon: History,
      color: "text-drio-success",
      bg: "bg-drio-success/10",
    },
    {
      label: "All time",
      rides: earnings.all.rides,
      total: earnings.all.total,
      icon: Banknote,
      color: "text-drio-violet",
      bg: "bg-drio-violet/10",
    },
  ];

  return (
    <MotionPage className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
        {status === "error" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/30 bg-card px-6 py-16 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <Banknote className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-[15px] font-semibold text-destructive">
              Could not load your earnings
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {error ?? "Something went wrong while loading your earnings."}
            </p>
            <Button size="sm" className="mt-6 font-semibold" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Banknote className="h-7 w-7 animate-pulse text-primary" />
            <p className="mt-4 text-[15px] font-semibold text-foreground">Loading your earnings…</p>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-3xl border border-border bg-card p-6">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </span>
                <p className="mt-4 text-[12px] font-medium text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-[1.65rem] font-bold tracking-tight text-foreground">
                  {formatFare(card.total)}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {card.rides} completed{" "}
                  {card.rides === 1 ? "trip" : "trips"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[13px] font-semibold text-foreground">
            How earnings are calculated
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Earnings reflect completed ride fares from the booking service (base
            fare plus per-kilometre charge). Trip totals update instantly as you
            complete rides and are grouped by completion date here.
          </p>
        </div>
          </>
        )}
      </div>
    </MotionPage>
  );
}