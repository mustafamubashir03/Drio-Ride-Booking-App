import Booking from "../models/booking.model"
import { Types } from "mongoose"
import logger from "../config/logger.config"


export type BookingCancellationMeta = {
    fromStatus: string
    cancelledBy: "passenger" | "driver" | "system"
    reason: string
    cancelledAt: Date
    requireUnassigned?: boolean
}

export const createBookingRepository = async (bookingData: any) => {
    logger.info(`[REPO] createBookingRepository: data=${JSON.stringify(bookingData)}`);
    const booking = new Booking(bookingData)
    const saved = await booking.save()
    logger.info(`[REPO] Booking saved: bookingId=${saved._id}, passenger=${saved.passenger}, status=${saved.status}`);
    return saved
}

export const listBookingsRepository = async (passengerId: string) => {
    logger.info(`[REPO] listBookingsRepository: passengerId=${passengerId}`);
    const bookings = await Booking.find({ passenger: passengerId })
        .sort({ _id: -1 })
        .populate("driver", "name image")
        .lean()
        .exec()
    logger.info(`[REPO] Found ${bookings.length} bookings for passengerId=${passengerId}`);
    return bookings
}

export type DriverRatingSummary = {
    average: number | null
    count: number
}

export const getDriverRatingSummariesRepository = async (driverIds: string[]) => {
    const ids = [...new Set(driverIds)]
        .filter((driverId) => Types.ObjectId.isValid(driverId))
        .map((driverId) => new Types.ObjectId(driverId))

    if (ids.length === 0) return new Map<string, DriverRatingSummary>()

    const rows = await Booking.aggregate([
        {
            $match: {
                driver: { $in: ids },
                status: "completed",
                "feedback.reviewedAt": { $ne: null },
                "feedback.rating": {
                    $type: "number",
                    $gte: 1,
                    $lte: 5,
                },
            },
        },
        {
            $group: {
                _id: "$driver",
                average: { $avg: "$feedback.rating" },
                count: { $sum: 1 },
            },
        },
    ]).exec()

    return new Map<string, DriverRatingSummary>(
        rows.map((row) => [
            String(row._id),
            { average: row.average, count: row.count },
        ]),
    )
}

export const findBookingByIdRepository = async (bookingId: string) => {
    return await Booking.findById(bookingId)
        .populate("passenger", "name email")
        .populate("driver", "name image")
        .lean()
        .exec()
}

/**
 * Passive endpoints (list/get) should never mutate; this deals with the
 * booking whose driver cancelled it heading to confirmed/arriving/arrived — the
 * exact same transition rules the driver-ride service enforces, but triggered
 * from the passenger side. Only returns when `pending + driver:null`, so a
 * ride already claimed (or already terminal) is left untouched.
 */
export const cancelBookingRepository = async ({
    bookingId,
    passengerId,
    fromStatus,
    cancelledBy,
    reason,
    cancelledAt,
    requireUnassigned = false,
}: {
    bookingId: string
    passengerId: string
} & BookingCancellationMeta) => {
    return await Booking.findOneAndUpdate(
        {
            _id: new Types.ObjectId(bookingId),
            passenger: new Types.ObjectId(passengerId),
            status: fromStatus,
            ...(requireUnassigned ? { driver: null } : {}),
        },
        {
            $set: {
                status: "cancelled",
                cancelledAt,
                cancelledBy,
                cancellationReason: reason,
            },
        },
        { new: true }
    )
        .populate("passenger", "name email")
        .populate("driver", "name image")
        .lean()
        .exec()
}

export const reviewBookingRepository = async ({
    bookingId,
    passengerId,
    rating,
    comment,
}: {
    bookingId: string
    passengerId: string
    rating: number
    comment: string | null
}) => {
    return await Booking.findOneAndUpdate(
        {
            _id: new Types.ObjectId(bookingId),
            passenger: new Types.ObjectId(passengerId),
            driver: { $ne: null },
            status: "completed",
            "feedback.reviewedAt": null,
        },
        {
            $set: {
                feedback: { rating, comment, reviewedAt: new Date() },
            },
        },
        { new: true }
    )
        .populate("passenger", "name email")
        .populate("driver", "name image")
        .lean()
        .exec()
}

export const findPendingSearchingBookingsRepository = async () => {
    return await Booking.find({ status: "pending", driver: null })
        .populate("passenger", "name email image")
        .sort({ _id: -1 })
        .limit(100)
        .lean()
        .exec()
}

export const deleteBookingsByIdsRepository = async (ids: string[]) => {
    if (ids.length === 0) return;
    await Booking.deleteMany({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    });
}