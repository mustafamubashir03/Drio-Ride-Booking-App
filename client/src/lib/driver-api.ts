import type { BookingStatus, BookingCoordinates } from "./bookings-api";

export const DRIVER_DOCUMENT_TYPES = ["cnic", "license", "vehicle-registration"] as const;
export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];
export const DRIVER_DOCUMENT_LABELS: Record<DriverDocumentType, string> = {
    cnic: "CNIC",
    license: "Driver's license",
    "vehicle-registration": "Vehicle registration",
};
export const DRIVER_DOCUMENT_MAX_SIZE = 5 * 1024 * 1024;
export type DriverApplicationStatus = "pending" | "approved" | "rejected";
export type DriverApplicationDocument = {
    documentType: DriverDocumentType;
    publicId: string;
    secureUrl: string;
    originalFilename: string | null;
    uploadedAt: string;
};
export type DriverApplication = {
    _id: string;
    user: string;
    status: DriverApplicationStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
    adminNote: string | null;
    rejectionReason: string | null;
    documents: DriverApplicationDocument[];
};

// The admin endpoints populate `user` with `name` and `email` (see
// findDriverApplicationByIdRepository / listDriverApplicationsRepository).
export type AdminDriverApplicationUser = {
    _id: string;
    name?: string | null;
    email?: string | null;
};

export type AdminDriverApplication = Omit<DriverApplication, "user"> & {
    user: AdminDriverApplicationUser;
};

export type DriverApplicationListResult = {
    applications: AdminDriverApplication[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
};

export type DriverApplicationsOverview = {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
};


export async function createDriverApplication(): Promise<DriverApplication> {
    const response = await fetch("/api/v1/driver-applications", { method: "POST" });
    const data = (await response.json()) as { success?: boolean; application?: DriverApplication; message?: string };
    if (!response.ok || !data.success || !data.application) {
        throw new Error(data.message ?? "Could not start your application");
    }
    return data.application;
}

export async function fetchMyDriverApplication(): Promise<DriverApplication | null> {
    const response = await fetch("/api/v1/driver-applications/me");
    const data = (await response.json()) as { success?: boolean; application?: DriverApplication | null; message?: string };
    if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not load your application");
    }
    return data.application ?? null;
}

export async function uploadDriverDocument(args: {
    documentType: DriverDocumentType;
    file: File;
}): Promise<{ document: DriverApplicationDocument; documents: DriverApplicationDocument[] }> {
    const formData = new FormData();
    formData.append("file", args.file);
    formData.append("documentType", args.documentType);

    const response = await fetch("/api/v1/driver-applications/documents", { method: "POST", body: formData });
    const data = (await response.json()) as {
        success?: boolean;
        document?: DriverApplicationDocument;
        documents?: DriverApplicationDocument[];
        message?: string;
    };
    if (!response.ok || !data.success || !data.document || !Array.isArray(data.documents)) {
        throw new Error(data.message ?? "Could not upload your document");
    }
    return { document: data.document, documents: data.documents };
}

export async function listDriverApplicationsAdminApi(args: {
    page?: number;
    limit?: number;
    status?: DriverApplicationStatus;
}): Promise<DriverApplicationListResult> {
    const query = new URLSearchParams();
    if (args.page) query.set("page", String(args.page));
    if (args.limit) query.set("limit", String(args.limit));
    if (args.status) query.set("status", args.status);
    const qs = query.toString();

    const response = await fetch(`/api/v1/admin/driver-applications${qs ? `?${qs}` : ""}`);
    const data = (await response.json()) as {
        success?: boolean;
        applications?: AdminDriverApplication[];
        pagination?: {
            page?: number;
            limit?: number;
            total?: number;
            pages?: number;
        };
        message?: string;
    };
    if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not load the driver applications");
    }
    return {
        applications: data.applications ?? [],
        pagination: {
            page: data.pagination?.page ?? 1,
            limit: data.pagination?.limit ?? args.limit ?? 10,
            total: data.pagination?.total ?? 0,
            pages: data.pagination?.pages ?? 1,
        },
    };
}

export async function getDriverApplicationAdminApi(applicationId: string): Promise<AdminDriverApplication> {
    const response = await fetch(`/api/v1/admin/driver-applications/${encodeURIComponent(applicationId)}`);
    const data = (await response.json()) as {
        success?: boolean;
        application?: AdminDriverApplication;
        message?: string;
    };
    if (!response.ok || !data.success || !data.application) {
        throw new Error(data.message ?? "Could not load the driver application");
    }
    return data.application;
}

export async function reviewDriverApplicationAdminApi(args: {
    applicationId: string;
    decision: "approved" | "rejected";
    adminNote?: string | null;
    rejectionReason?: string | null;
}): Promise<AdminDriverApplication> {
    const response = await fetch(
        `/api/v1/admin/driver-applications/${encodeURIComponent(args.applicationId)}/review`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                decision: args.decision,
                adminNote: args.adminNote ?? null,
                rejectionReason: args.rejectionReason ?? null,
            }),
        }
    );
    const data = (await response.json()) as {
        success?: boolean;
        application?: AdminDriverApplication;
        message?: string;
    };
    if (!response.ok || !data.success || !data.application) {
        throw new Error(data.message ?? "Could not update this driver application");
    }
    return data.application;
}

// Overview metrics are derived from the real list endpoint: the server returns
// the exact count for each status filter via `pagination.total`.
export async function getDriverApplicationsOverview(): Promise<DriverApplicationsOverview> {
    const [all, pending, approved, rejected] = await Promise.all([
        listDriverApplicationsAdminApi({ limit: 1 }),
        listDriverApplicationsAdminApi({ limit: 1, status: "pending" }),
        listDriverApplicationsAdminApi({ limit: 1, status: "approved" }),
        listDriverApplicationsAdminApi({ limit: 1, status: "rejected" }),
    ]);
    return {
        total: all.pagination.total,
        pending: pending.pagination.total,
        approved: approved.pagination.total,
        rejected: rejected.pagination.total,
    };
}

// ── Driver portal: availability, rides, earnings ─────────────────────────

export type DriverAvailabilityStatus = "offline" | "online";

export type DriverAvailability = {
    status: DriverAvailabilityStatus;
    updatedAt: string | null;
};

export type DriverRidePassenger = {
    _id: string;
    name: string | null;
    email: string | null;
} | null;

export type DriverRide = {
    _id: string;
    status: BookingStatus;
    source: BookingCoordinates;
    destination: BookingCoordinates;
    fare: number | null;
    distance: number | null;
    driver: string | null;
    passenger: DriverRidePassenger;
    createdAt: string;
    assignedAt: string | null;
};

export type DriverEarningsSummary = {
    today: { rides: number; total: number };
    week: { rides: number; total: number };
    all: { rides: number; total: number };
};

export const DRIVER_RIDE_STATUS_LABEL: Record<BookingStatus, string> = {
    pending: "Waiting for accept",
    confirmed: "Accepted",
    arriving: "Heading to pickup",
    arrived: "Arrived",
    in_progress: "On trip",
    completed: "Completed",
    cancelled: "Cancelled",
};

async function readDriverRide(
    response: Response,
    fallback: string
): Promise<DriverRide> {
    let data: { success?: boolean; ride?: DriverRide; message?: string } = {};
    try {
        data = (await response.json()) as typeof data;
    } catch {
        // fall through; the !response.ok check below sets the generic message
    }
    if (!response.ok || !data.success || !data.ride) {
        throw new Error(data.message ?? fallback);
    }
    return data.ride;
}

export async function fetchDriverAvailability(): Promise<DriverAvailability> {
    const response = await fetch("/api/v1/driver/status");
    const data = (await response.json()) as {
        success?: boolean;
        availability?: DriverAvailability;
        message?: string;
    };
    if (!response.ok || !data.success || !data.availability) {
        throw new Error(data.message ?? "Could not load your availability");
    }
    return data.availability;
}

export async function setDriverAvailability(
    status: DriverAvailabilityStatus
): Promise<DriverAvailability> {
    const response = await fetch("/api/v1/driver/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: status }),
    });
    const data = (await response.json()) as {
        success?: boolean;
        availability?: DriverAvailability;
        message?: string;
    };
    if (!response.ok || !data.success || !data.availability) {
        throw new Error(data.message ?? "Could not update your availability");
    }
    return data.availability;
}

export async function fetchDriverActiveRide(): Promise<DriverRide | null> {
    const response = await fetch("/api/v1/driver/rides/active");
    const data = (await response.json()) as {
        success?: boolean;
        ride?: DriverRide | null;
        message?: string;
    };
    if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not load your active ride");
    }
    return data.ride ?? null;
}

export async function fetchDriverRides(): Promise<DriverRide[]> {
    const response = await fetch("/api/v1/driver/rides");
    const data = (await response.json()) as {
        success?: boolean;
        rides?: DriverRide[];
        message?: string;
    };
    if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Could not load your rides");
    }
    return data.rides ?? [];
}

export async function fetchDriverRide(bookingId: string): Promise<DriverRide> {
    const response = await fetch(
        `/api/v1/driver/rides/${encodeURIComponent(bookingId)}`
    );
    return readDriverRide(response, "Could not load this ride");
}

export type DriverRideAction =
    | "accept"
    | "arriving"
    | "arrived"
    | "start"
    | "complete"
    | "cancel";

export async function transitionDriverRide(
    bookingId: string,
    action: DriverRideAction
): Promise<DriverRide> {
    const response = await fetch(
        `/api/v1/driver/rides/${encodeURIComponent(bookingId)}/${action}`,
        { method: "POST" }
    );
    return readDriverRide(response, "Could not update this ride");
}

export async function fetchDriverEarnings(): Promise<DriverEarningsSummary> {
    const response = await fetch("/api/v1/driver/earnings");
    const data = (await response.json()) as {
        success?: boolean;
        earnings?: DriverEarningsSummary;
        message?: string;
    };
    if (!response.ok || !data.success || !data.earnings) {
        throw new Error(data.message ?? "Could not load your earnings");
    }
    return data.earnings;
}