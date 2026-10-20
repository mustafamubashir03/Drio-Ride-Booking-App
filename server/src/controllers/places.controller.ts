import { NextFunction, Request, Response } from "express";
import { reverseGeocode, searchPlaces } from "../services/places.service";

const MIN_QUERY_LENGTH = 2;

export const searchPlacesController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const query = rawQuery.trim();

    if (query.length < MIN_QUERY_LENGTH) {
        res.status(200).json({ results: [] });
        return;
    }

    try {
        const results = await searchPlaces(query);
        res.status(200).json({ results });
    } catch (error) {
        next(error);
    }
};

export const reverseGeocodeController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // validateQueryParams has already checked the values coerce into range.
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    try {
        const place = await reverseGeocode(latitude, longitude);
        res.status(200).json({ place });
    } catch (error) {
        next(error);
    }
};