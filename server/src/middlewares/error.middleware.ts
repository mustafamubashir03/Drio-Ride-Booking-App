import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors/app.error";

const resolveStatusCode = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599
        ? value
        : fallback;

export const appErrorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {

    console.log(err);

    if (res.headersSent) {
        next(err);
        return;
    }

    const statusCode = resolveStatusCode(
        (err as AppError & { status?: unknown }).statusCode ?? (err as { status?: unknown }).status,
        500,
    );

    res.status(statusCode).json({
        success: false,
        message: err.message
    });
}

export const genericErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.log(err);

    if (res.headersSent) {
        next(err);
        return;
    }

    res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
}