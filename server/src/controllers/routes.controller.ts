import { NextFunction, Request, Response } from "express";
import { getRoute, RouteCoordinates } from "../services/routes.service";
import { BadRequestError } from "../utils/errors/app.error";

const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

const parseCoordinatePair = (raw: unknown, name: string): RouteCoordinates => {
    if (typeof raw !== "string") {
        throw new BadRequestError(`${name} must be a longitude,latitude pair`);
    }
    const match = COORDINATE_PAIR.exec(raw);
    if (!match) {
        throw new BadRequestError(`${name} must be a longitude,latitude pair`);
    }
    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    if (longitude < -180 || longitude > 180) {
        throw new BadRequestError(`${name} longitude must be between -180 and 180 (OSRM expects longitude,latitude)`);
    }
    if (latitude < -90 || latitude > 90) {
        throw new BadRequestError(`${name} latitude must be between -90 and 90 (OSRM expects longitude,latitude)`);
    }
    return { longitude, latitude };
};

export const getRouteController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const from = parseCoordinatePair(req.query.from, "from");
        const to = parseCoordinatePair(req.query.to, "to");
        const route = await getRoute(from, to);
        res.status(200).json({ success: true, route });
    } catch (error) {
        next(error);
    }
};