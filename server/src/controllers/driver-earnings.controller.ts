import { NextFunction, Request, Response } from "express";
import {
    getDriverEarningsService,
    getDriverEarningsSeriesService,
    normalizeEarningsRange,
} from "../services/driver-earnings.service";

export const getDriverEarningsController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const earnings = await getDriverEarningsService(req.authUser!.id);
        return res.status(200).json({ success: true, earnings });
    } catch (error) {
        next(error);
    }
};

/**
 * Read-only daily earnings series for the authenticated driver. Scoped to
 * req.authUser only, and served from the same router that already applies
 * requireAuth + requireDriverCapability, so it inherits the existing RBAC.
 */
export const getDriverEarningsSeriesController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const range = normalizeEarningsRange(req.query.days);
        const series = await getDriverEarningsSeriesService(req.authUser!.id, range);
        return res.status(200).json({ success: true, series });
    } catch (error) {
        next(error);
    }
};