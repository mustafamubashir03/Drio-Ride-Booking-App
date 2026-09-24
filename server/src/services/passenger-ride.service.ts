import { Types } from "mongoose";
import logger from "../config/logger.config";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors/app.error";
import {
    cancelBookingRepository,
    findBookingByIdRepository,
    reviewBookingRepository,
} from "../repositories/booking.repository";
import {
    clearDriverActiveRideService,
    deleteNotifiedDriversService,
    deleteRidePassengerService,
    deleteSearchStageService,
    getNotifiedDriversService,
} from "./location.service";
import { notifyDriver, notifyPassenger, removeRideNotification } from "./notification-bridge.service";

/**
 * Passenger-initiated ride lifecycle extensions:
 *   - cancel from pending / confirmed / arriving / arrived (in_progress stays
 *     locked — the trip has started and the driver can no longer be reached),
 *   - post-ride 1–5 star review, once, per booking.
 */

export const PASSENGER_CANCELLABLE_STATUSES = ["pending", "confirmed", "arriving", "arrived"] as const;

export const PASSENGER_CANCEL_REASONS = [
    "change_of_plan",
    "ride_no_longer_needed",
    "driver_took_too_long",
    "wrong_address",
    "other",
] as const;

const assertValidBookingId = (bookingId: string) => {
    if (!Types.ObjectId.isValid(bookingId)) {
        throw new BadRequestError("Invalid booking id");
    }
};

const toIdString = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === "object") {
        const id = value._id ?? value;
        return id?.toString?.() ?? null;
    }
    return value.toString();
};

const serializePassengerRide = (booking: any) => {
    const id = Types.ObjectId.isValid(booking._id) ? new Types.ObjectId(booking._id) : booking._id;
    const driver =
        booking.driver && typeof booking.driver === "object"
            ? { _id: String(booking.driver._id), name: booking.driver.name ?? null, image: booking.driver.image ?? null }
            : booking.driver
            ? { _id: String(booking.driver), name: null, image: null }
            : null;
    return {
        _id: id.toString(),
        status: booking.status,
        source: booking.source,
        destination: booking.destination,
        fare: booking.fare ?? null,
        distance: booking.distance ?? null,
        driver: driver ? driver._id : null,
        driverInfo: driver ? { name: driver.name, image: driver.image } : null,
        passenger:
            booking.passenger && typeof booking.passenger === "object"
                ? { _id: String(booking.passenger._id), name: booking.passenger.name ?? null, email: booking.passenger.email ?? null }
                : null,
        cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt).toISOString() : null,
        cancelledBy: booking.cancelledBy ?? null,
        cancellationReason: booking.cancellationReason ?? null,
        feedback: booking.feedback
            ? {
                  rating: booking.feedback.rating ?? null,
                  comment: booking.feedback.comment ?? null,
                  reviewedAt: booking.feedback.reviewedAt ? new Date(booking.feedback.reviewedAt).toISOString() : null,
              }
            : { rating: null, comment: null, reviewedAt: null },
        createdAt: id.getTimestamp().toISOString(),
    };
};

export const cancelPassengerRideService = async ({
    driverId,
    bookingId,
    passengerId,
    reason,
}: {
    driverId?: string | null;
    bookingId: string;
    passengerId: string;
    reason?: string;
}) => {
    assertValidBookingId(bookingId);
    const booking = await findBookingByIdRepository(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");

    const ownerId = toIdString(booking.passenger);
    if (ownerId !== passengerId) {
        throw new ForbiddenError("You do not have access to this booking");
    }

    const fromStatus = booking.status;
    if (!PASSENGER_CANCELLABLE_STATUSES.includes(fromStatus as any)) {
        if (fromStatus === "cancelled") {
            throw new ConflictError("This ride is already cancelled");
        }
        if (fromStatus === "completed") {
            throw new ConflictError("A completed ride cannot be cancelled");
        }
        throw new ConflictError(`A ${fromStatus} ride cannot be cancelled by the passenger`);
    }

    const cancelledAt = new Date();
    const updated = await cancelBookingRepository({
        bookingId,
        passengerId,
        fromStatus,
        cancelledBy: "passenger",
        reason: reason && (PASSENGER_CANCEL_REASONS as readonly string[]).includes(reason) ? reason : "other",
        cancelledAt,
    });
    if (!updated) {
        throw new ConflictError("The ride changed before your cancellation could be applied; please retry");
    }

    // Clean up dispatch state so no stale driver card survives and the search
    // lifecycle stops tracking this booking.
    const notified = await getNotifiedDriversService(bookingId);
    if (notified.length > 0) {
        await removeRideNotification(bookingId, notified);
        await deleteNotifiedDriversService(bookingId);
    }
    await deleteSearchStageService(bookingId);
    await deleteRidePassengerService(bookingId);

    const assignedDriverId = toIdString(updated.driver) ?? (driverId ?? null);
    if (assignedDriverId) {
        await clearDriverActiveRideService(assignedDriverId);
        await notifyDriver({ driverId: assignedDriverId, bookingId, status: "cancelled" });
    }

    await notifyPassenger({ bookingId, passengerId, status: "cancelled", driverId: assignedDriverId, cancelledBy: "passenger" });
    logger.info(`[PASSENGER-CANCEL] bookingId=${bookingId} from=${fromStatus} reason=${reason ?? "other"} driver=${assignedDriverId}`);

    return serializePassengerRide(updated);
};

export const reviewPassengerRideService = async ({
    bookingId,
    passengerId,
    rating,
    comment,
}: {
    bookingId: string;
    passengerId: string;
    rating: number;
    comment?: string | null;
}) => {
    assertValidBookingId(bookingId);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new BadRequestError("Rating must be a whole number between 1 and 5");
    }
    const trimmedComment = comment != null ? String(comment).trim() : null;
    if (trimmedComment != null && trimmedComment.length > 500) {
        throw new BadRequestError("Review comment cannot exceed 500 characters");
    }

    const booking = await findBookingByIdRepository(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");

    const ownerId = toIdString(booking.passenger);
    if (ownerId !== passengerId) {
        throw new ForbiddenError("You do not have access to this booking");
    }
    if (booking.status !== "completed") {
        throw new ConflictError("This ride can only be reviewed once it is completed");
    }

    const alreadyReviewed = booking.feedback?.reviewedAt != null;
    if (alreadyReviewed) {
        return { booking: serializePassengerRide(booking), alreadyReviewed: true };
    }

    const updated = await reviewBookingRepository({
        bookingId,
        passengerId,
        rating,
        comment: trimmedComment,
    });
    if (!updated) {
        // Lost race: someone else (same passenger, another tab) wrote first.
        const latest = await findBookingByIdRepository(bookingId);
        if (latest?.feedback?.reviewedAt != null) {
            return { booking: serializePassengerRide(latest), alreadyReviewed: true };
        }
        throw new ConflictError("This ride is no longer available for review");
    }

    logger.info(`[REVIEW] bookingId=${bookingId} rating=${rating} comment=${trimmedComment ?? "(none)"}`);
    return { booking: serializePassengerRide(updated), alreadyReviewed: false };
};