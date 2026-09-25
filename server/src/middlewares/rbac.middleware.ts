import { NextFunction, Request, Response } from "express";
import { getAuth } from "../lib/auth";
import { RoleModel } from "../models";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";

type AuthUser = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role?: string;
};

declare global {
    namespace Express {
        interface Request {
            authUser?: AuthUser;
        }
    }
}

// Disable the cookie cache so role changes take effect immediately.
export async function getSessionUser(req: Request): Promise<AuthUser | null> {
    const session = await getAuth().api.getSession({
        headers: req.headers as unknown as Headers,
        query: { disableCookieCache: "true" },
    });
    return session?.user as AuthUser | null;
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await getSessionUser(req);
        if (!user) throw new UnauthorizedError("Authentication required");
        req.authUser = user;
        next();
    } catch (err) {
        next(err);
    }
};

export const requireRole = (...roles: string[]) => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.authUser) throw new UnauthorizedError("Authentication required");
            if (!req.authUser.role || !roles.includes(req.authUser.role)) {
                throw new ForbiddenError(`Forbidden: requires role ${roles.join(" or ")}`);
            }
            next();
        } catch (err) {
            next(err);
        }
    };
};

export const requirePermission = (...permissions: string[]) => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.authUser) throw new UnauthorizedError("Authentication required");
            if (!req.authUser.role) throw new ForbiddenError("Forbidden: no role assigned");

            const role = await RoleModel.findOne({ name: req.authUser.role }).lean().exec();
            const granted = role?.permissions ?? [];

            const missing = permissions.filter((p) => !granted.includes(p));
            if (missing.length > 0) {
                throw new ForbiddenError(`Forbidden: missing permission(s): ${missing.join(", ")}`);
            }
            next();
        } catch (err) {
            next(err);
        }
    };
};