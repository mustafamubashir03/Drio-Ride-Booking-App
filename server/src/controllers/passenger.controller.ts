import logger from "../config/logger.config";
import { Response, Request } from "express";
import { createBookingService, listBookingsService } from "../services/passenger.service";
import { Types } from "mongoose";


export const createBookingController = async (req: Request, res: Response) => {
    try {
        const { source, destination } = req.body;
        const booking = await createBookingService({ passengerId: req.authUser!.id, source, destination });
        if (!booking) {
            return res.status(400).json({ success: false, message: "Failed to create booking" });
        }

        return res.status(201).json({ success: true, booking })
    }
    catch (error) {
        logger.error("Failed to create booking", error);
        res.status(500).json({ success: false, message: "Failed to create booking" });
    }
}

export const listBookingsController = async (req: Request, res: Response) => {
    try {
        const passengerId = req.authUser!.id;
        if (!Types.ObjectId.isValid(passengerId)) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        const bookings = await listBookingsService(passengerId);

        const serialized = bookings.map((booking: any) => {
            const id = booking._id instanceof Types.ObjectId
                ? booking._id
                : new Types.ObjectId(booking._id);

            return {
                _id: id.toString(),
                status: booking.status,
                source: booking.source,
                destination: booking.destination,
                driver: booking.driver ? booking.driver.toString() : null,
                createdAt: (id.getTimestamp()).toISOString(),
            };
        });

        return res.status(200).json({ success: true, bookings: serialized });
    }
    catch (error) {
        logger.error("Failed to list bookings", error);
        res.status(500).json({ success: false, message: "Failed to list bookings" });
    }
}

