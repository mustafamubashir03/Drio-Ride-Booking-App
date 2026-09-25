import logger from "../config/logger.config";
import { Response, Request } from "express";
import { createBookingService, listBookingsService } from "../services/passenger.service";
import { getDriverLocationMetadata } from "../services/location.service";
import { Types } from "mongoose";
import { cancelPassengerRideService, reviewPassengerRideService } from "../services/passenger-ride.service";
import { getDriverRatingSummariesRepository } from "../repositories/booking.repository";


export const createBookingController = async (req: Request, res: Response) => {
    try {
        const { source, destination } = req.body;
        const passengerId = req.authUser!.id;
        logger.info(`[CONTROLLER] createBookingController: passengerId=${passengerId}, source=${JSON.stringify(source)}, destination=${JSON.stringify(destination)}`);
        const booking = await createBookingService({
            passengerId,
            source,
            destination,
            passengerName: req.authUser!.name,
            passengerImage: req.authUser!.image,
        });
        logger.info(`[CONTROLLER] createBookingService returned: ${booking ? `bookingId=${booking._id}` : 'null'}`);
        if (!booking) {
            logger.warn(`[CONTROLLER] createBookingService returned null`);
            return res.status(400).json({ success: false, message: "Failed to create booking" });
        }
        logger.info(`[CONTROLLER] Booking created successfully: bookingId=${booking._id}`);
        return res.status(201).json({ success: true, booking })
    }
    catch (error) {
        logger.error("[CONTROLLER] Failed to create booking", error);
        res.status(500).json({ success: false, message: "Failed to create booking" });
    }
}

export const listBookingsController = async (req: Request, res: Response) => {
    try {
        const passengerId = req.authUser!.id;
        logger.info(`[CONTROLLER] listBookingsController: passengerId=${passengerId}`);
        if (!Types.ObjectId.isValid(passengerId)) {
            logger.warn(`[CONTROLLER] Invalid passengerId: ${passengerId}`);
            return res.status(200).json({ success: true, bookings: [] });
        }

        const bookings = await listBookingsService(passengerId);
        logger.info(`[CONTROLLER] listBookingsService returned ${bookings.length} bookings`);

        const driverIds = bookings.flatMap((booking: any) => {
            const driver = booking.driver;
            if (!driver) return [];
            return [String(typeof driver === "object" ? driver._id : driver)];
        });
        const driverRatings = await getDriverRatingSummariesRepository(driverIds);

        const cleanDisplayName = (value?: string) =>
            value && /[+-]?\d+\.\d{2,}\s*,\s*[+-]?\d+\.\d{2,}/.test(value)
                ? value.split(" · ")[0].trim()
                : value;

        const serialized = await Promise.all(bookings.map(async (booking: any) => {
            const id = booking._id instanceof Types.ObjectId
                ? booking._id
                : new Types.ObjectId(booking._id);

            const driver =
                booking.driver && typeof booking.driver === "object"
                    ? (booking.driver as { _id: unknown; name?: string; image?: string })
                    : null;
            const driverId = driver ? String(driver._id) : null;

            return {
                _id: id.toString(),
                status: booking.status,
                fare: booking.fare ?? null,
                source: {
                    ...booking.source,
                    displayName: cleanDisplayName(booking.source?.displayName),
                },
                destination: {
                    ...booking.destination,
                    displayName: cleanDisplayName(booking.destination?.displayName),
                },
                driver: driverId,
                driverInfo: driver
                    ? { name: driver.name ?? null, image: driver.image ?? null }
                    : null,
                driverRating: driverId
                    ? driverRatings.get(driverId) ?? { average: null, count: 0 }
                    : null,
                // Most recent driver position from Redis (30s TTL). Used to
                // reconstruct the moving driver marker after a reload until
                // the socket stream resumes.
                driverLocation: driverId
                    ? await getDriverLocationMetadata(driverId)
                    : null,
                cancelledAt: booking.cancelledAt
                    ? new Date(booking.cancelledAt).toISOString()
                    : null,
                cancelledBy: booking.cancelledBy ?? null,
                // The raw internal reason is not exposed to the client; the UI
                // renders a friendly message from the state/cancelledBy pair.
                feedback: booking.feedback
                    ? {
                          rating: booking.feedback.rating ?? null,
                          comment: booking.feedback.comment ?? null,
                          reviewedAt: booking.feedback.reviewedAt
                              ? new Date(booking.feedback.reviewedAt).toISOString()
                              : null,
                      }
                    : { rating: null, comment: null, reviewedAt: null },
                createdAt: (id.getTimestamp()).toISOString(),
            };
        }));

        return res.status(200).json({ success: true, bookings: serialized });
    }
    catch (error) {
        logger.error("[CONTROLLER] Failed to list bookings", error);
        res.status(500).json({ success: false, message: "Failed to list bookings" });
    }
}

export const cancelBookingController = async (req: Request, res: Response) => {
    try {
        const { bookingId } = req.params;
        const passengerId = req.authUser!.id;
        const { reason } = req.body ?? {};
        logger.info(`[CONTROLLER] cancelBookingController: bookingId=${bookingId}, passengerId=${passengerId}, reason=${reason}`);
        const bookingIdStr = Array.isArray(bookingId) ? bookingId[0] : bookingId;
        const ride = await cancelPassengerRideService({ bookingId: bookingIdStr, passengerId, reason });
        return res.status(200).json({ success: true, ride });
    }
    catch (error: any) {
        logger.error("[CONTROLLER] Failed to cancel booking", error);
        return res.status(error.statusCode ?? 500).json({ success: false, message: error.message ?? "Failed to cancel booking" });
    }
}

export const reviewBookingController = async (req: Request, res: Response) => {
    try {
        const { bookingId } = req.params;
        const passengerId = req.authUser!.id;
        const { rating, comment } = req.body ?? {};
        logger.info(`[CONTROLLER] reviewBookingController: bookingId=${bookingId}, passengerId=${passengerId}, rating=${rating}`);
        const bookingIdStr = Array.isArray(bookingId) ? bookingId[0] : bookingId;
        const { booking, alreadyReviewed } = await reviewPassengerRideService({ bookingId: bookingIdStr, passengerId, rating, comment });
        return res.status(alreadyReviewed ? 200 : 201).json({ success: true, ride: booking, alreadyReviewed });
    }
    catch (error: any) {
        logger.error("[CONTROLLER] Failed to review booking", error);
        return res.status(error.statusCode ?? 500).json({ success: false, message: error.message ?? "Failed to review booking" });
    }
}

