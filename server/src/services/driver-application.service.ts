import { randomUUID } from "crypto";
import { Types } from "mongoose";
import logger from "../config/logger.config";
import {
    BadRequestError,
    ConflictError,
    InternalServerError,
    NotFoundError,
} from "../utils/errors/app.error";
import {
    createDriverApplicationRepository,
    findDriverApplicationByUserRepository,
    listDriverApplicationDocumentsRepository,
    replaceDocumentInDriverApplicationRepository,
} from "../repositories/driver-application.repository";
import {
    deleteCloudinaryAsset,
    isCloudinaryConfigured,
    uploadDriverDocumentBuffer,
} from "../lib/cloudinary";

export const DRIVER_DOCUMENT_TYPES = [
    "cnic",
    "license",
    "vehicle-registration",
] as const;

export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];

export const isDriverDocumentType = (value: string): value is DriverDocumentType => {
    return (DRIVER_DOCUMENT_TYPES as readonly string[]).includes(value);
};

export const DRIVER_DOCUMENT_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
] as const;

export const MAX_DRIVER_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadedFile = {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
};

export const getDriverApplicationByUserService = async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestError("Invalid user identifier");
    }
    return await findDriverApplicationByUserRepository(userId);
};

export const createDriverApplicationService = async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestError("Invalid user identifier");
    }

    const existing = await findDriverApplicationByUserRepository(userId);
    if (existing) {
        throw new ConflictError("You already have a driver application");
    }

    try {
        return await createDriverApplicationRepository({
            user: new Types.ObjectId(userId),
            status: "pending",
            submittedAt: new Date(),
        });
    } catch (error) {
        logger.error("Failed to create driver application", error);
        throw error;
    }
};

export const uploadDriverDocumentService = async ({
    userId,
    documentType,
    file,
}: {
    userId: string;
    documentType: string;
    file?: UploadedFile;
}) => {
    if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestError("Invalid user identifier");
    }

    if (!file || !file.buffer || !(file.buffer.length > 0)) {
        throw new BadRequestError("No file was provided");
    }

    if (!isDriverDocumentType(documentType)) {
        throw new BadRequestError(
            `Unsupported document type. Allowed types: ${DRIVER_DOCUMENT_TYPES.join(", ")}`
        );
    }

    if (!DRIVER_DOCUMENT_MIME_TYPES.includes(file.mimetype as (typeof DRIVER_DOCUMENT_MIME_TYPES)[number])) {
        throw new BadRequestError(
            "Unsupported file type. Only JPG, PNG, WEBP or PDF documents are accepted"
        );
    }

    if (file.size > MAX_DRIVER_DOCUMENT_SIZE_BYTES) {
        throw new BadRequestError("Document is too large. Maximum allowed size is 5 MB");
    }

    const application = await findDriverApplicationByUserRepository(userId);
    if (!application) {
        throw new NotFoundError("No driver application found. Create an application first");
    }

    if (application.status !== "pending") {
        throw new BadRequestError(
            `Your application is ${application.status} and can no longer be edited`
        );
    }

    if (!isCloudinaryConfigured()) {
        throw new InternalServerError("Document uploads are not available right now");
    }

    const previousDocuments = await listDriverApplicationDocumentsRepository(userId);
    const previous = previousDocuments.find((doc) => doc.documentType === documentType);

    const folder = `Drio/driver-documents/${userId}/${documentType}`;
    const publicId = `${documentType}-${randomUUID()}`;

    let uploadResult;
    try {
        uploadResult = await uploadDriverDocumentBuffer(file.buffer, { folder, publicId });
    } catch (error) {
        logger.error("Cloudinary document upload failed", {
            documentType,
            message: (error as Error).message,
        });
        throw new InternalServerError("Document upload failed. Please try again");
    }

    if (previous?.publicId) {
        await deleteCloudinaryAsset(previous.publicId);
    }

    const document = {
        documentType,
        publicId: uploadResult.publicId,
        secureUrl: uploadResult.secureUrl,
        originalFilename: file.originalname || null,
        uploadedAt: new Date(),
    };

    const updated = await replaceDocumentInDriverApplicationRepository(userId, document);
    const documents = updated?.documents ?? [];

    return { document, documents };
};