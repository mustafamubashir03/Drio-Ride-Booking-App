import { NextFunction, Request, Response } from "express";
import {
    acceptDriverRideService,
    cancelDriverRideService,
    completeDriverRideService,
    confirmBookingService,
    getDriverActiveRideService,
    getDriverRideService,
    getDriverRatingSummaryService,
    listDriverRidesService,
    markDriverArrivedService,
    markDriverArrivingService,
    startDriverRideService,
} from "../services/driver-ride.service";

const driverIdOf = (req: Request) => req.authUser!.id;

const bookingIdOf = (req: Request) => String(req.params.bookingId);

export const getDriverActiveRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await getDriverActiveRideService(driverIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const listDriverRidesController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const rides = await listDriverRidesService(driverIdOf(req));
        return res.status(200).json({ success: true, rides });
    } catch (error) {
        next(error);
    }
};

export const getDriverRatingController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const rating = await getDriverRatingSummaryService(driverIdOf(req));
        return res.status(200).json({ success: true, rating });
    } catch (error) {
        next(error);
    }
};

export const getDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await getDriverRideService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const acceptDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await acceptDriverRideService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const confirmDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await confirmBookingService({
            driverId: driverIdOf(req),
            bookingId: bookingIdOf(req),
        });
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const markDriverArrivingController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await markDriverArrivingService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const markDriverArrivedController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await markDriverArrivedService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const startDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await startDriverRideService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const completeDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await completeDriverRideService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};

export const cancelDriverRideController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const ride = await cancelDriverRideService(
            driverIdOf(req),
            bookingIdOf(req));
        return res.status(200).json({ success: true, ride });
    } catch (error) {
        next(error);
    }
};