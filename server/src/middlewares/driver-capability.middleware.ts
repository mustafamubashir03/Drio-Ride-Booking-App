import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/errors/app.error";
import { findDriverApplicationByUserRepository } from "../repositories/driver-application.repository";

/**
 * Driver capability: caller may use driver functionality when they
 * _are_ a driver/admin by role, OR hold an approved driver application
 * (durable backend truth). user.role is never mutated here — an admin
 * who is also an approved driver keeps both capabilities, and a rejected
 * or pending applicant stays gated out.
 */
export const requireDriverCapability = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        if (!req.authUser) {
            throw new UnauthorizedError("Authentication required");
        }
        const role = req.authUser.role;
        if (role === "driver" || role === "admin") {
            next();
            return;
        }
        const application = await findDriverApplicationByUserRepository(
            req.authUser.id
        );
        if (application?.status === "approved") {
            next();
            return;
        }
        throw new ForbiddenError(
            "Forbidden: requires an approved driver application"
        );
    } catch (err) {
        next(err);
    }
};