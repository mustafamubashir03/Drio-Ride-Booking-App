import logger from "../config/logger.config";
import { Response, Request } from "express";
import { createBookingService } from "../services/passenger.service";


export const createBooking = async (req: Request, res: Response) => {
    try {
        const { source, destination } = req.body;
        const booking = await createBookingService({ passengerId: (req as any).auth?.userId, source, destination });
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
