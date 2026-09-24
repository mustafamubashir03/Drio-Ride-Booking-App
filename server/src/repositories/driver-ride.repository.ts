import { Types } from "mongoose";
import Booking from "../models/booking.model";

export const DRIVER_ACTIVE_BOOKING_STATUSES = [
    "pending",
    "confirmed",
    "arriving",
    "arrived",
    "in_progress",
] as const;

export const assignBookingToDriverRepository = async ({
    bookingId,
    driverId,
}: {
    bookingId: string;
    driverId: string;
}) => {
    return await Booking.findOneAndUpdate(
        {
            _id: new Types.ObjectId(bookingId),
            status: "pending",
        },
        {
            $set: {
                driver: new Types.ObjectId(driverId),
                assignedAt: new Date(),
            },
        },
        { new: true }
    )
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const findDriverActiveBookingRepository = async (driverId: string) => {
    return await Booking.findOne({
        driver: new Types.ObjectId(driverId),
        status: { $in: [...DRIVER_ACTIVE_BOOKING_STATUSES] },
    })
        .sort({ _id: 1 })
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const listDriverBookingsRepository = async (driverId: string) => {
    return await Booking.find({ driver: new Types.ObjectId(driverId) })
        .sort({ _id: -1 })
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const findDriverBookingByIdRepository = async (bookingId: string) => {
    return await Booking.findById(bookingId)
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const transitionDriverBookingRepository = async ({
    bookingId,
    driverId,
    fromStatus,
    toStatus,
}: {
    bookingId: string;
    driverId: string;
    fromStatus: string;
    toStatus: string;
}) => {
    const set: Record<string, unknown> = { status: toStatus };
    if (toStatus === "cancelled") {
        set.cancelledAt = new Date();
        set.cancelledBy = "driver";
        set.cancellationReason = "driver_cancelled";
    }
    return await Booking.findOneAndUpdate(
        {
            _id: new Types.ObjectId(bookingId),
            driver: new Types.ObjectId(driverId),
            status: fromStatus,
        },
        {
            $set: set,
        },
        { new: true }
    )
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const confirmBookingRepository = async ({
    bookingId,
    driverId,
}: {
    bookingId: string;
    driverId: string;
}) => {
    return await Booking.findOneAndUpdate(
        {
            _id: new Types.ObjectId(bookingId),
            status: "pending",
            driver: null,
        },
        {
            $set: {
                status: "confirmed",
                driver: new Types.ObjectId(driverId),
                assignedAt: new Date(),
            },
        },
        { new: true }
    )
        .populate("passenger", "name email")
        .lean()
        .exec();
};

export const listCompletedDriverBookingsRepository = async (
    driverId: string
) => {
    return await Booking.find({
        driver: new Types.ObjectId(driverId),
        status: "completed",
    })
        .select("fare _id")
        .lean()
        .exec();
};