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