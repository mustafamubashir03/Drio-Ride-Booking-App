import { Suspense, lazy, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DriverEarningsSummary, type EarningsRangeDays } from "@/lib/driver-api";
import {
  useDriverEarningsQuery,
  useDriverEarningsSeriesQuery,
} from "@/hooks/queries/use-driver";
import { formatFare } from "@/lib/format";
import { Banknote, History, TrendingUp } from "lucide-react";
import { MotionPage } from "@/motion/MotionPage";
import { motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
import { cn } from "@/lib/utils";

/**
 * Recharts is a large dependency and only the driver earnings page needs it.
 * Lazy-loading keeps it out of the bundle every passenger downloads.
 */
const EarningsChart = lazy(() => import("@/components/driver/EarningsChart"));

/** Matches the chart card's own skeleton so the swap does not reflow. */
function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4" aria-busy="true">
      <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-7 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-5 h-40 w-full animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none sm:h-48" />
    </div>
  );
}

const DEFAULT_SUMMARY: DriverEarningsSummary = {
  today: { rides: 0, total: 0 },
  week: { rides: 0, total: 0 },
  all: { rides: 0, total: 0 },
};

const RANGES: { value: EarningsRangeDays; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "3 months" },
];

export default function DriverEarnings() {
  const { data, isPending, isError, isSuccess, error, refetch } = useDriverEarningsQuery();
  const [range, setRange] = useState<EarningsRangeDays>(7);
  const seriesQuery = useDriverEarningsSeriesQuery(range);
  const earnings = data ?? DEFAULT_SUMMARY;
  const { stagger, reduced } = useMotionSystem();

  const cards = [
    {
      label: "Today",
      rides: earnings.today.rides,
      total: earnings.today.total,
      icon: TrendingUp,
      color: "text-primary",
    },
    {
      label: "Last 7 days",
      rides: earnings.week.rides,
      total: earnings.week.total,
      icon: History,
      color: "text-drio-success",
    },
    {
      label: "All time",
      rides: earnings.all.rides,
      total: earnings.all.total,
      icon: Banknote,
      color: "text-drio-violet",
    },
  ];

  return (
    <MotionPage className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
        {isError && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-destructive/25 bg-destructive/5 px-6 py-16 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <Banknote className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-[15px] font-semibold text-destructive">
              Could not load your earnings
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {(error instanceof Error ? error.message : null) ?? "Something went wrong while loading your earnings."}
            </p>
            <Button size="sm" className="mt-6 font-semibold" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {isPending && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <Banknote className="h-7 w-7 animate-pulse text-primary motion-reduce:animate-none" />
            <p className="mt-4 text-[15px] font-semibold text-foreground">Loading your earningsâ€¦</p>
          </div>
        )}

        {isSuccess && (
          <>
            <motion.div
              className="grid gap-4 sm:grid-cols-3"
              variants={stagger.container}
              initial={reduced ? false : "hidden"}
              animate={reduced ? undefined : "visible"}
            >
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.label}
                    variants={stagger.item}
                    className="rounded-3xl border border-border bg-card p-6 transition-colors duration-200"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                      <Icon className={`h-5 w-5 ${card.color}`} />
                    </span>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-1 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-foreground">
                      {formatFare(card.total)}
                    </p>
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                      {card.rides} completed{" "}
                      {card.rides === 1 ? "trip" : "trips"}
                    </p>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-foreground">Earnings trend</h2>
                {/* Restrained period control: three small pills, no extra chrome. */}
                <div
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1"
                  role="group"
                  aria-label="Earnings period"
                >
                  {RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRange(r.value)}
                      aria-pressed={range === r.value}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                        range === r.value
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <Suspense fallback={<ChartSkeleton />}>
                <EarningsChart
                  series={seriesQuery.data}
                  isPending={seriesQuery.isPending}
                  error={
                    seriesQuery.error instanceof Error ? seriesQuery.error : null
                  }
                  onRetry={() => void seriesQuery.refetch()}
                />
              </Suspense>
            </div>

            <div className="rounded-2xl border border-border bg-muted/25 p-5">
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