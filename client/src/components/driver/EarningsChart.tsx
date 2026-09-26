import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, TrendingUp } from "lucide-react";
import type { DriverEarningsSeries } from "@/lib/driver-api";
import { formatFare } from "@/lib/format";

/**
 * Earnings over time.
 *
 * Built on Recharts but heavily customised rather than left as a library demo:
 * no legend, no default grid box, a single Drio-accent series with one subtle
 * gradient fill, tabular-figure currency, and axes reduced to the minimum that
 * still makes the shape readable. Drio tokens only - one accent, no rainbow.
 *
 * Reads exclusively from the server-provided series; nothing is derived,
 * smoothed or invented on the client.
 */

/**
 * The server buckets earnings by UTC day, so every label must be rendered in
 * UTC too. Formatting a UTC-midnight timestamp in local time shifts the label
 * back a day for anyone west of UTC, which would file earnings under the wrong
 * date. This keeps the label and the bucket in agreement.
 */
const fmtUTC = (
  iso: string,
  opts: Intl.DateTimeFormatOptions,
): string =>
  new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** Collapse long ranges into readable buckets without inventing values. */
function bucketise(
  points: DriverEarningsSeries["points"],
  days: number,
): { label: string; total: number; rides: number; from: string; to: string }[] {
  if (days <= 7) {
    return points.map((p) => ({
      label: fmtUTC(p.date, { weekday: "short" }),
      total: p.total,
      rides: p.rides,
      from: p.date,
      to: p.date,
    }));
  }
  if (days <= 30) return points.map(toBucket);
  // 90 days -> 13 weekly buckets keeps the x-axis legible on a phone.
  return weeklyBuckets(points);
}

const toBucket = (p: DriverEarningsSeries["points"][number]) => ({
  label: fmtUTC(p.date, { day: "numeric", month: "short" }),
  total: p.total,
  rides: p.rides,
  from: p.date,
  to: p.date,
});

function weeklyBuckets(points: DriverEarningsSeries["points"]) {
  const out: ReturnType<typeof toBucket>[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const slice = points.slice(i, i + 7);
    if (slice.length === 0) continue;
    out.push({
      label: fmtUTC(slice[0].date, { day: "numeric", month: "short" }),
      total: slice.reduce((s, p) => s + p.total, 0),
      rides: slice.reduce((s, p) => s + p.rides, 0),
      from: slice[0].date,
      to: slice[slice.length - 1].date,
    });
  }
  return out;
}

function ChartTooltip({
  active,
  payload,
  days,
}: {
  active?: boolean;
  payload?: { payload: { total: number; rides: number; from: string; to: string } }[];
  days: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const range =
    d.from === d.to
      ? fmtUTC(d.from, {
          day: "numeric",
          month: "short",
          ...(days > 30 ? { year: "numeric" } : {}),
        })
      : `${fmtUTC(d.from, { day: "numeric", month: "short" })} – ${fmtUTC(d.to, { day: "numeric", month: "short" })}`;

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] text-muted-foreground">{range}</p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">
        {formatFare(d.total)}
      </p>
      {d.rides > 0 && (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {d.rides} {d.rides === 1 ? "ride" : "rides"}
        </p>
      )}
    </div>
  );
}

export default function EarningsChart({
  series,
  isPending,
  error,
  onRetry,
}: {
  series: DriverEarningsSeries | undefined;
  isPending: boolean;
  error: Error | null;
  onRetry?: () => void;
}) {
  const data = useMemo(
    () => (series ? bucketise(series.points, series.days) : []),
    [series],
  );
  const hasData = data.some((d) => d.total > 0);
  const average = useMemo(() => {
    const earning = data.filter((d) => d.total > 0);
    if (earning.length === 0) return null;
    return Math.round(
      earning.reduce((s, d) => s + d.total / Math.max(d.rides, 1), 0) /
        earning.length,
    );
  }, [data]);

  if (isPending) {
    // Skeleton rather than a spinner: it matches the card's shape and does not
    // reflow when the data lands.
    return (
      <div className="rounded-2xl border border-border bg-card p-4" aria-busy="true">
        <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-7 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-5 h-32 w-full animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
        <span className="sr-only">Loading earnings</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-card px-4 text-center"
      >
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
        <p className="text-[12.5px] text-muted-foreground">
          {error.message || "Could not load your earnings trend."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!series || !hasData) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card px-4 text-center">
        <TrendingUp className="h-5 w-5 text-muted-foreground/70" aria-hidden />
        <p className="text-[12.5px] font-medium text-foreground">No earnings yet</p>
        <p className="max-w-[24ch] text-[11.5px] leading-relaxed text-muted-foreground">
          {series
            ? "Completed rides in this period will appear here."
            : "Completed rides will appear here once you finish your first trip."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {/* Summary */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Earnings
          </p>
          <p className="mt-1 font-serif text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
            {formatFare(series.total)}
          </p>
        </div>
        <dl className="flex items-center gap-4 text-right">
          <div>
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Rides
            </dt>
            <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-foreground">
              {series.rides}
            </dd>
          </div>
          {average !== null && (
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                Avg / ride
              </dt>
              <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-foreground">
                {formatFare(average)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Plot. Fixed height on mobile so the card cannot grow unbounded, and
          a little taller once there is room. */}
      <div className="mt-4 h-40 w-full sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="drio-earnings-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-drio-accent)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-drio-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Horizontal rules only, very low contrast - enough to read value
                against, not enough to compete with the data. */}
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              dy={4}
            />
            <YAxis
              width={38}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
            />
            <Tooltip
              content={<ChartTooltip days={series.days} />}
              cursor={{ stroke: "var(--color-drio-accent)", strokeOpacity: 0.28 }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--color-drio-accent)"
              strokeWidth={2}
              fill="url(#drio-earnings-fill)"
              // Dot on hover only: keeps the resting chart calm while still
              // giving a precise touch/hover target.
              activeDot={{
                r: 4,
                fill: "var(--color-drio-accent)",
                stroke: "var(--color-card)",
                strokeWidth: 2,
              }}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[10.5px] text-muted-foreground">
        Based on completed ride fares
        {series.days >= 90 ? ", grouped by week" : series.days > 7 ? ", by day" : ""}.
      </p>
    </div>
  );
}
