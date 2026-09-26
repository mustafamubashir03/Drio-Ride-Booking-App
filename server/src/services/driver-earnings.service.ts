import { Types } from "mongoose";
import { listCompletedDriverBookingsRepository } from "../repositories/driver-ride.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DriverEarningsSummary = {
    today: { rides: number; total: number };
    week: { rides: number; total: number };
    all: { rides: number; total: number };
};

const emptySummary = (): DriverEarningsSummary => ({
    today: { rides: 0, total: 0 },
    week: { rides: 0, total: 0 },
    all: { rides: 0, total: 0 },
});

export type DriverEarningsPoint = {
    /** UTC day start, ISO-8601. */
    date: string;
    rides: number;
    total: number;
};

export type DriverEarningsSeries = {
    days: number;
    currency: string;
    total: number;
    rides: number;
    points: DriverEarningsPoint[];
};

/** Guard rails so a hand-edited query cannot request an unbounded scan. */
const ALLOWED_RANGES = [7, 30, 90] as const;
export type EarningsRangeDays = (typeof ALLOWED_RANGES)[number];

export const normalizeEarningsRange = (value: unknown): EarningsRangeDays => {
    const parsed = Number(value);
    return (ALLOWED_RANGES as readonly number[]).includes(parsed)
        ? (parsed as EarningsRangeDays)
        : 7;
};

/**
 * Daily earnings time series for one driver.
 *
 * Reads the exact same source and applies the exact same time rule as
 * getDriverEarningsService (completed bookings, fare summed, day derived from
 * the booking's ObjectId timestamp), so the chart can never disagree with the
 * headline totals. No new business logic and no second source of truth.
 */
export const getDriverEarningsSeriesService = async (
    driverId: string,
    rangeDays: EarningsRangeDays = 7
): Promise<DriverEarningsSeries> => {
    const bookings = await listCompletedDriverBookingsRepository(driverId);

    // Bucket boundaries in UTC, oldest first, so a ride is always counted in
    // exactly one bucket.
    const now = new Date();
    const startOfTodayUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    );
    const firstDayStart = startOfTodayUtc - (rangeDays - 1) * DAY_MS;

    const buckets = new Map<number, DriverEarningsPoint>();
    for (let i = 0; i < rangeDays; i += 1) {
        const dayStart = firstDayStart + i * DAY_MS;
        buckets.set(dayStart, {
            date: new Date(dayStart).toISOString(),
            rides: 0,
            total: 0,
        });
    }

    for (const booking of bookings) {
        const id =
            booking._id instanceof Types.ObjectId
                ? booking._id
                : new Types.ObjectId(String(booking._id));
        const completedAt = id.getTimestamp().getTime();
        if (completedAt < firstDayStart) continue;
        if (completedAt >= startOfTodayUtc + DAY_MS) continue;

        // Snap to the UTC day that contains this ride. Deriving the day from the
        // epoch directly avoids the sign problem of subtracting from
        // startOfTodayUtc, where a ride later today yields a negative offset
        // and Math.floor would round it into the following day.
        const dayStart = Math.floor(completedAt / DAY_MS) * DAY_MS;
        const bucket = buckets.get(dayStart);
        if (!bucket) continue;

        bucket.rides += 1;
        bucket.total += typeof booking.fare === "number" ? booking.fare : 0;
    }

    const points = [...buckets.values()].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return {
        days: rangeDays,
        currency: "PKR",
        total: points.reduce((sum, p) => sum + p.total, 0),
        rides: points.reduce((sum, p) => sum + p.rides, 0),
        points,
    };
};

export const getDriverEarningsService = async (
    driverId: string
): Promise<DriverEarningsSummary> => {
    const bookings = await listCompletedDriverBookingsRepository(driverId);

    const now = new Date();
    const startOfToday = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    );
    const startOfWeek = startOfToday - 6 * DAY_MS;

    const summary = emptySummary();
    for (const booking of bookings) {
        const id =
            booking._id instanceof Types.ObjectId
                ? booking._id
                : new Types.ObjectId(booking._id);
        const completedAt = id.getTimestamp().getTime();
        const fare = typeof booking.fare === "number" ? booking.fare : 0;

        summary.all.rides += 1;
        summary.all.total += fare;

        if (completedAt >= startOfWeek) {
            summary.week.rides += 1;
            summary.week.total += fare;
        }
        if (completedAt >= startOfToday) {
            summary.today.rides += 1;
            summary.today.total += fare;
        }
    }
    return summary;
};