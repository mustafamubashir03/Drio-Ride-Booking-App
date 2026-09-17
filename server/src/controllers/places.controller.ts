import { NextFunction, Request, Response } from "express";
import { searchPlaces } from "../services/places.service";

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