import { Types } from "mongoose";
import DriverApplicationModel, {
    DriverApplicationDocument,
    DriverApplicationStatus,
    DriverAvailabilityStatus,
} from "../models/driver-application.model";

export const createDriverApplicationRepository = async (data: unknown) => {
    const application = new DriverApplicationModel(data);
    return await application.save();
};

export const findDriverAvailabilityByUserRepository = async (userId: string) => {
    return await DriverApplicationModel.findOne({
        user: new Types.ObjectId(userId),
    })
        .lean()
        .select("availabilityStatus availabilityUpdatedAt")
        .exec();
};

export const updateDriverAvailabilityByUserRepository = async (
    userId: string,
    availabilityStatus: DriverAvailabilityStatus
) => {
    return await DriverApplicationModel.findOneAndUpdate(
        { user: new Types.ObjectId(userId) },
        {
            $set: {
                availabilityStatus,
                availabilityUpdatedAt: new Date(),
            },
        },
        { new: true }
    )
        .lean()
        .select("availabilityStatus availabilityUpdatedAt")
        .exec();
};

export const findDriverApplicationByUserRepository = async (userId: string) => {
    return await DriverApplicationModel.findOne({
        user: new Types.ObjectId(userId),
    })
        .lean()
        .exec();
};

export const replaceDocumentInDriverApplicationRepository = async (
    userId: string,
    document: DriverApplicationDocument
) => {
    const filter = { user: new Types.ObjectId(userId) };
    await DriverApplicationModel.updateOne(filter, {
        $pull: { documents: { documentType: document.documentType } },
    });
    return await DriverApplicationModel.findOneAndUpdate(
        filter,
        {
            $push: { documents: document },
        },
        { new: true }
    )
        .lean()
        .exec();
};

export const listDriverApplicationDocumentsRepository = async (userId: string) => {
    const application = await DriverApplicationModel.findOne({
        user: new Types.ObjectId(userId),
    })
        .lean()
        .select("documents")
        .exec();
    return application?.documents ?? [];
};

export const findDriverApplicationByIdRepository = async (applicationId: string) => {
    return await DriverApplicationModel.findById(applicationId)
        .populate("user", "name email")
        .lean()
        .exec();
};

export const findByDriverApplicationStatusRepository = async (status: DriverApplicationStatus) => {
    return await DriverApplicationModel.find({ status }).lean().exec();
};

export const listDriverApplicationsRepository = async ({
    page = 1,
    limit = 10,
    status,
}: {
    page?: number;
    limit?: number;
    status?: DriverApplicationStatus;
}) => {
    const filter = status ? { status } : {} satisfies Record<string, never>;
    const total = await DriverApplicationModel.countDocuments(filter).exec();
    const applications = await DriverApplicationModel.find(filter)
        .sort({ submittedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email")
        .lean()
        .exec();
    return { applications, total };
};

export const updateDriverApplicationReviewRepository = async (
    applicationId: string,
    data: {
        status: "approved" | "rejected";
        reviewedAt: Date;
        reviewedBy: Types.ObjectId;
        adminNote?: string | null;
        rejectionReason?: string | null;
    }
) => {
    return await DriverApplicationModel.findByIdAndUpdate(
        applicationId,
        {
            $set: {
                status: data.status,
                reviewedAt: data.reviewedAt,
                reviewedBy: data.reviewedBy,
                adminNote: data.adminNote ?? null,
                rejectionReason: data.rejectionReason ?? null,
            },
        },
        { new: true }
    )
        .populate("user", "name email")
        .lean()
        .exec();
};