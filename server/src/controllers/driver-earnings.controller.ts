import { NextFunction, Request, Response } from "express";
import { getDriverEarningsService } from "../services/driver-earnings.service";

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