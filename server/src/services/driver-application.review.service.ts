import { Types } from "mongoose";
import logger from "../config/logger.config";
import {
    BadRequestError,
    ConflictError,
    InternalServerError,
    NotFoundError,
} from "../utils/errors/app.error";
import {
    findDriverApplicationByIdRepository,
    listDriverApplicationsRepository,
    updateDriverApplicationReviewRepository,
} from "../repositories/driver-application.repository";
import { sendMail } from "../lib/mailer";

type DriverApplicationStatus = "pending" | "approved" | "rejected";

type DriverApplicationReview = {
    status: "approved" | "rejected";
    reviewedAt: Date;
    reviewedBy: string;
    adminNote?: string | null;
    rejectionReason?: string | null;
};

const resolveUserContact = (
    user: unknown
): { name: string | null; email: string | null } => {
    if (!user || typeof user !== "object") {
        return { name: null, email: null };
    }
    const record = user as Record<string, unknown>;
    return {
        name: typeof record.name === "string" ? record.name : null,
        email: typeof record.email === "string" ? record.email : null,
    };
};

const buildApplicationReviewEmail = ({
    application,
    decision,
    reason,
    adminNote,
}: {
    application: unknown;
    decision: "approved" | "rejected";
    reason: string | null;
    adminNote: string | null;
}) => {
    const contact = resolveUserContact(
        application && typeof application === "object"
            ? (application as Record<string, unknown>).user
            : null
    );

    const headline =
        decision === "approved"
            ? "Your driver application was approved"
            : "Update on your driver application";

    const isApproved = decision === "approved";
    const body = isApproved
        ? `Your application to drive with Drio has been approved. You can now open
           the driver portal and start taking trips from the same Drio account.`
        : `We could not approve your driver application right now.${
              reason ? ` Reason: ${reason}` : ""
          }`;

    return {
        to: contact.email ?? "",
        subject: headline,
        html: `
            <p>Hi ${contact.name ?? "there"},</p>
            <p>${body}</p>
            ${
                adminNote
                    ? `<p><strong>Note from the team:</strong> ${adminNote}</p>`
                    : ""
            }
            <p>&mdash; The Drio team</p>
        `,
        text: body,
    };
};

export const listDriverApplicationsService = async ({
    page = 1,
    limit = 10,
    status,
}: {
    page?: number;
    limit?: number;
    status?: DriverApplicationStatus;
}) => {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));

    const { applications, total } = await listDriverApplicationsRepository({
        page: safePage,
        limit: safeLimit,
        status,
    });

    return {
        applications,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
};

export const getDriverApplicationByIdService = async (applicationId: string) => {
    if (!Types.ObjectId.isValid(applicationId)) {
        throw new BadRequestError("Invalid application identifier");
    }
    const application = await findDriverApplicationByIdRepository(applicationId);
    if (!application) {
        throw new NotFoundError("Driver application not found");
    }
    return application;
};

export const reviewDriverApplicationService = async ({
    applicationId,
    reviewedBy,
    decision,
    adminNote,
    rejectionReason,
}: {
    applicationId: string;
    reviewedBy: string;
    decision: "approved" | "rejected";
    adminNote?: string | null;
    rejectionReason?: string | null;
}) => {
    if (!Types.ObjectId.isValid(applicationId)) {
        throw new BadRequestError("Invalid application identifier");
    }

    const application = await findDriverApplicationByIdRepository(applicationId);
    if (!application) {
        throw new NotFoundError("Driver application not found");
    }

    if (application.status !== "pending") {
        throw new ConflictError(
            `This application has already been reviewed (status: ${application.status})`
        );
    }

    if (decision === "rejected" && !rejectionReason?.trim()) {
        throw new BadRequestError("A rejection reason is required");
    }

    const review: DriverApplicationReview = {
        status: decision,
        reviewedAt: new Date(),
        reviewedBy,
        adminNote: adminNote?.trim() || null,
        rejectionReason:
            decision === "rejected" ? rejectionReason?.trim() || null : null,
    };

    let updated;
    try {
        updated = await updateDriverApplicationReviewRepository(applicationId, {
            status: review.status,
            reviewedAt: review.reviewedAt,
            reviewedBy: new Types.ObjectId(review.reviewedBy),
            adminNote: review.adminNote,
            rejectionReason: review.rejectionReason,
        });
    } catch (error) {
        logger.error("Failed to review driver application", error);
        throw new InternalServerError("Failed to review the driver application");
    }

    // Notify the applicant using the user info resolved by the repository.
    try {
        await sendMail(
            buildApplicationReviewEmail({
                application: updated,
                decision,
                reason: review.rejectionReason ?? null,
                adminNote: review.adminNote ?? null,
            })
        );
    } catch (error) {
        logger.error("Failed to send driver application review email", error);
    }

    return updated;
};
