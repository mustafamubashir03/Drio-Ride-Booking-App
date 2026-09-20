import { Schema, model, Types } from "mongoose";

export const DRIVER_APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;

export type DriverApplicationStatus = (typeof DRIVER_APPLICATION_STATUSES)[number];

export const DRIVER_AVAILABILITY_STATUSES = ["offline", "online"] as const;

export type DriverAvailabilityStatus = (typeof DRIVER_AVAILABILITY_STATUSES)[number];

export type DriverApplicationDocument = {
    documentType: string;
    publicId: string;
    secureUrl: string;
    originalFilename?: string | null;
    uploadedAt?: Date | null;
};

interface DriverApplication {
    user: Types.ObjectId;
    status: DriverApplicationStatus;
    submittedAt: Date;
    reviewedAt?: Date | null;
    reviewedBy?: Types.ObjectId | null;
    adminNote?: string | null;
    rejectionReason?: string | null;
    documents?: DriverApplicationDocument[];
    availabilityStatus?: DriverAvailabilityStatus;
    availabilityUpdatedAt?: Date | null;
}

const driverApplicationDocumentSchema = new Schema<DriverApplicationDocument>({
    documentType: { type: String, required: true },
    publicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
    originalFilename: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
}, {
    _id: false,
});

const driverApplicationSchema = new Schema<DriverApplication>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: DRIVER_APPLICATION_STATUSES,
        default: "pending",
    },
    submittedAt: { type: Date, required: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    adminNote: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    documents: {
        type: [driverApplicationDocumentSchema],
        default: [],
    },
    availabilityStatus: {
        type: String,
        enum: DRIVER_AVAILABILITY_STATUSES,
        default: "offline",
    },
    availabilityUpdatedAt: { type: Date, default: null },
}, {
    collection: "driverapplications",
    versionKey: false,
});

driverApplicationSchema.index({ user: 1 }, { unique: true });

const DriverApplicationModel = model<DriverApplication>(
    "DriverApplication",
    driverApplicationSchema,
    "driverapplications"
);

export default DriverApplicationModel;