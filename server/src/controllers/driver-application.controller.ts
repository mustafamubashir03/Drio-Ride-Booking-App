import { Response, Request } from "express";
import { Types } from "mongoose";
import logger from "../config/logger.config";
import {
    BadRequestError,
    ConflictError,
    InternalServerError,
    NotFoundError,
} from "../utils/errors/app.error";
import {
    createDriverApplicationService,
    getDriverApplicationByUserService,
    uploadDriverDocumentService,
} from "../services/driver-application.service";

const toObjectId = (value: unknown) =>
    value instanceof Types.ObjectId ? value : new Types.ObjectId(value as string);

const serializeDriverApplication = (application: any) => {
    if (!application) return null;

    return {
        _id: toObjectId(application._id).toString(),
        user: toObjectId(application.user).toString(),
        status: application.status,
        submittedAt: application.submittedAt
            ? new Date(application.submittedAt).toISOString()
            : null,
        reviewedAt: application.reviewedAt
            ? new Date(application.reviewedAt).toISOString()
            : null,
        reviewedBy: application.reviewedBy
            ? toObjectId(application.reviewedBy).toString()
            : null,
        adminNote: application.adminNote ?? null,
        rejectionReason: application.rejectionReason ?? null,
        documents: Array.isArray(application.documents) ? application.documents : [],
    };
};

export const getMyDriverApplicationController = async (req: Request, res: Response) => {
    try {
        const application = await getDriverApplicationByUserService(req.authUser!.id);
        return res.status(200).json({
            success: true,
            application: serializeDriverApplication(application),
        });
    } catch (error) {
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error("Failed to get driver application", error);
        return res.status(500).json({ success: false, message: "Failed to get driver application" });
    }
};

export const createDriverApplicationController = async (req: Request, res: Response) => {
    try {
        const application = await createDriverApplicationService(req.authUser!.id);
        return res.status(201).json({
            success: true,
            application: serializeDriverApplication(application),
        });
    } catch (error) {
        if (error instanceof ConflictError) {
            return res.status(409).json({ success: false, message: error.message });
        }
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error("Failed to create driver application", error);
        return res.status(500).json({ success: false, message: "Failed to create driver application" });
    }
};

export const uploadDriverDocumentController = async (req: Request, res: Response) => {
    try {
        const file = req.file as Express.Multer.File | undefined;
        const documentType = String(req.body?.documentType ?? "").trim();

        const result = await uploadDriverDocumentService({
            userId: req.authUser!.id,
            documentType,
            file: file
                ? {
                      buffer: file.buffer,
                      mimetype: file.mimetype,
                      originalname: file.originalname,
                      size: file.size,
                  }
                : undefined,
        });

        const serializedDocuments = Array.isArray(result.documents)
            ? result.documents.map((doc: any) => ({ ...doc }))
            : [];

        return res.status(201).json({
            success: true,
            document: result.document,
            documents: serializedDocuments,
        });
    } catch (error) {
        if (error instanceof BadRequestError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error instanceof NotFoundError) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error instanceof InternalServerError) {
            return res.status(500).json({ success: false, message: error.message });
        }
        logger.error("Failed to upload driver document", error);
        return res.status(500).json({ success: false, message: "Failed to upload driver document" });
    }
};