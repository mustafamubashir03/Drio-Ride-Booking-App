
import { Request, Response, NextFunction } from "express";
import logger from "../config/logger.config";
import { addDriverLocationService } from "../services/driver.service";
import {
    getDriverAvailabilityService,
    updateDriverAvailabilityService,
} from "../services/driver-availability.service";
import type { DriverAvailabilityStatus } from "../models/driver-application.model";


export const updateLocationController = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude } = req.body;

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return res.status(400).json({ success: false, message: "Invalid location" });
        }

        if (!req.authUser?.id) {
            return res.status(400).json({ success: false, message: "User not found" });
        }


        const driver = await addDriverLocationService(req.authUser.id, lat, lng);
        return res.status(201).json({ success: true, message: "Location updated successfully", driver });


    }
    catch (error) {
        logger.error("Failed to update location", error);
        return res.status(500).json({ success: false, message: "Failed to update location" });
    }
}

export const getDriverAvailabilityController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const availability = await getDriverAvailabilityService(req.authUser!.id);
        return res.status(200).json({ success: true, availability });
    } catch (error) {
        next(error);
    }
}

export const updateDriverAvailabilityController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const availability = await updateDriverAvailabilityService(
            req.authUser!.id,
            req.body.availabilityStatus as DriverAvailabilityStatus
        );
        return res.status(200).json({ success: true, availability });
    } catch (error) {
        next(error);
    }
}