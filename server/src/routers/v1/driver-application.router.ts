import express from "express";
import multer from "multer";
import { requireAuth } from "../../middlewares/rbac.middleware";
import { BadRequestError } from "../../utils/errors/app.error";
import {
    createDriverApplicationController,
    getMyDriverApplicationController,
    uploadDriverDocumentController,
} from "../../controllers/driver-application.controller";
import {
    DRIVER_DOCUMENT_MIME_TYPES,
    MAX_DRIVER_DOCUMENT_SIZE_BYTES,
} from "../../services/driver-application.service";

const driverApplicationRouter = express.Router();

driverApplicationRouter.use(requireAuth);

const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_DRIVER_DOCUMENT_SIZE_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if ((DRIVER_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new BadRequestError(
                    "Unsupported file type. Only JPG, PNG, WEBP or PDF documents are accepted"
                )
            );
        }
    },
});

const uploadSingleDocument = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) => {
    documentUpload.single("file")(req, res, (err: unknown) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                return next(
                    new BadRequestError(
                        err.code === "LIMIT_FILE_SIZE"
                            ? "Document is too large. Maximum allowed size is 5 MB"
                            : `Upload failed (${err.code})`
                    )
                );
            }
            return next(err);
        }
        return next();
    });
};

driverApplicationRouter.get("/me", getMyDriverApplicationController);

driverApplicationRouter.post("/", createDriverApplicationController);

driverApplicationRouter.post("/documents", uploadSingleDocument, uploadDriverDocumentController);

export default driverApplicationRouter;