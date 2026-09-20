import { Request, Response } from "express";
import logger from "../config/logger.config";
import {
    listDriverApplicationsService,
    getDriverApplicationByIdService,
    reviewDriverApplicationService,
} from "../services/driver-application.review.service";
import {
    BadRequestError,
    NotFoundError,
} from "../utils/errors/app.error";
import { Types } from "mongoose";

export const listDriverApplicationsAdminController = async (
    req: Request,
    res: Response
) => {
    try {
        const result = await listDriverApplicationsService({
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 10,
            status:
                req.query.status === "approved" ||
                req.query.status === "rejected" ||
                req.query.status === "pending"
                    ? req.query.status
                    : undefined,
        });

        return res.status(200).json({
            success: true,
            applications: result.applications,
            pagination: result.pagination,
        });
    } catch (error) {
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error("Failed to list driver applications", error);
        return res
            .status(500)
            .json({ success: false, message: "Failed to list driver applications" });
    }
};

export const getDriverApplicationAdminController = async (
    req: Request,
    res: Response
) => {
    try {
        const applicationIdRaw = req.params.applicationId;
        const applicationId = Array.isArray(applicationIdRaw) ? applicationIdRaw[0] : applicationIdRaw;
        if (!Types.ObjectId.isValid(applicationId)) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid application identifier" });
        }

        const application = await getDriverApplicationByIdService(applicationId as string);

        return res.status(200).json({ success: true, application });
    } catch (error) {
        if (error instanceof NotFoundError) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error("Failed to get driver application", error);
        return res
            .status(500)
            .json({ success: false, message: "Failed to get driver application" });
    }
};

export const reviewDriverApplicationAdminController = async (
    req: Request,
    res: Response
) => {
    try {
        const applicationIdRaw = req.params.applicationId;
        const applicationId = Array.isArray(applicationIdRaw) ? applicationIdRaw[0] : applicationIdRaw;
        const { decision, adminNote, rejectionReason } = req.body ?? {};

        if (!Types.ObjectId.isValid(applicationId)) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid application identifier" });
        }

        if (decision !== "approved" && decision !== "rejected") {
            return res
                .status(400)
                .json({ success: false, message: "decision must be approved or rejected" });
        }

        const updated = await reviewDriverApplicationService({
            applicationId: applicationId as string,
            reviewedBy: req.authUser?.id ?? "",
            decision: decision as "approved" | "rejected",
            adminNote: typeof adminNote === "string" ? adminNote : null,
            rejectionReason: typeof rejectionReason === "string" ? rejectionReason : null,
        });

        return res.status(200).json({ success: true, application: updated });
    } catch (error: unknown) {
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error instanceof NotFoundError) {
            return res.status(404).json({ success: false, message: error.message });
        }
        logger.error("Failed to review driver application", error);
        return res
            .status(500)
            .json({ success: false, message: "Failed to review driver application" });
    }
};
