import { Types } from "mongoose";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors/app.error";
import {
    assignBookingToDriverRepository,
    findDriverActiveBookingRepository,
    findDriverBookingByIdRepository,
    listDriverBookingsRepository,
    transitionDriverBookingRepository,
} from "../repositories/driver-ride.repository";

/**
 * Driver ride lifecycle:
 *   pending → confirmed
 *   confirmed → arriving | cancelled
 *   arriving → arrived | cancelled
 *   arrived → in_progress | cancelled
 *   in_progress → completed
 * completed/cancelled are terminal. Any other transition is a 409 conflict.
 */
const DRIVER_RIDE_TRANSITIONS: Record<string, readonly string[]> = {
    pending: ["confirmed"],
    confirmed: ["arriving", "cancelled"],
    arriving: ["arrived", "cancelled"],
    arrived: ["in_progress", "cancelled"],
    in_progress: ["completed"],
    completed: [],
    cancelled: [],
};

const assertValidBookingId = (bookingId: string) => {
    if (!Types.ObjectId.isValid(bookingId)) {
        throw new BadRequestError("Invalid booking id");
    }
};

const toObjectId = (id: Types.ObjectId | string) =>
    id instanceof Types.ObjectId ? id : new Types.ObjectId(id);

const passengerOf = (passenger: any) => {
    if (!passenger) return null;
    if (typeof passenger === "object") {
        return {
            _id: toObjectId(passenger._id ?? passenger).toString(),
            name: passenger.name ?? null,
            email: passenger.email ?? null,
        };
    }
    return { _id: passenger.toString(), name: null, email: null };
};

export const serializeDriverRide = (booking: any) => {
    const id = toObjectId(booking._id);
    return {
        _id: id.toString(),
        status: booking.status,
        source: booking.source,
        destination: booking.destination,
        fare: booking.fare ?? null,
        distance: booking.distance ?? null,
        driver: booking.driver ? toObjectId(booking.driver).toString() : null,
        passenger: passengerOf(booking.passenger),
        createdAt: id.getTimestamp().toISOString(),
        assignedAt: booking.assignedAt
            ? new Date(booking.assignedAt).toISOString()
            : null,
    };
};

/**
 * Assignment boundary for a booking → driver. This is the only place a
 * pending booking gets a driver. A future dispatch/realtime layer (Redis +
 * Socket.IO) will call this service once a driver is matched; no dispatch
 * engine exists yet.
 */
export const assignBookingToDriverService = async ({
    bookingId,
    driverId,
}: {
    bookingId: string;
    driverId: string;
}) => {
    assertValidBookingId(bookingId);
    const current = await findDriverBookingByIdRepository(bookingId);
    if (!current) throw new NotFoundError("Booking not found");
    if (current.status !== "pending") {
        throw new ConflictError("Only pending bookings can be assigned to a driver");
    }
    if (current.driver && toObjectId(current.driver).toString() === driverId) {
        return serializeDriverRide(current);
    }
    const booking = await assignBookingToDriverRepository({ bookingId, driverId });
    if (!booking) {
        throw new ConflictError("This booking is no longer pending");
    }
    return serializeDriverRide(booking);
};

export const getDriverActiveRideService = async (driverId: string) => {
    const booking = await findDriverActiveBookingRepository(driverId);
    return booking ? serializeDriverRide(booking) : null;
};

export const listDriverRidesService = async (driverId: string) => {
    const bookings = await listDriverBookingsRepository(driverId);
    return bookings.map((booking) => serializeDriverRide(booking));
};

export const getDriverRideService = async (
    driverId: string,
    bookingId: string
) => {
    assertValidBookingId(bookingId);
    const booking = await findDriverBookingByIdRepository(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");
    if (!booking.driver || toObjectId(booking.driver).toString() !== driverId) {
        throw new ForbiddenError("You do not have access to this booking");
    }
    return serializeDriverRide(booking);
};

const transitionDriverRideService = async ({
    driverId,
    bookingId,
    toStatus,
}: {
    driverId: string;
    bookingId: string;
    toStatus: string;
}) => {
    assertValidBookingId(bookingId);
    const booking = await findDriverBookingByIdRepository(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");
    if (!booking.driver || toObjectId(booking.driver).toString() !== driverId) {
        throw new ForbiddenError("You do not have access to this booking");
    }

    const fromStatus = booking.status;
    const allowed = DRIVER_RIDE_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
        const options = allowed.length > 0 ? allowed.join(", ") : "none";
        throw new ConflictError(
            `Cannot move a ${fromStatus} booking to ${toStatus} (allowed: ${options})`
        );
    }

    const updated = await transitionDriverBookingRepository({
        bookingId,
        driverId,
        fromStatus,
        toStatus,
    });
    if (!updated) {
        throw new ConflictError("This booking's status changed; please refresh");
    }
    return serializeDriverRide(updated);
};

export const acceptDriverRideService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "confirmed" });

export const markDriverArrivingService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "arriving" });

export const markDriverArrivedService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "arrived" });

export const startDriverRideService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "in_progress" });

export const completeDriverRideService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "completed" });

export const cancelDriverRideService = (driverId: string, bookingId: string) =>
    transitionDriverRideService({ driverId, bookingId, toStatus: "cancelled" });