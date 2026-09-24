export type BookingStatus = 'pending' | 'confirmed' | 'arriving' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export type BookingCoordinates = {
    name?: string;
    displayName?: string;
    latitude: number;
    longitude: number;
};

export type BookingDriverInfo = {
    name: string | null;
    image: string | null;
} | null;

export type BookingDriverLocation = {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    /** GPS fix time reported by the client / when the socket server accepted it. */
    timestamp?: number | null;
    updatedAt?: number;
} | null;

export type BookingCancelledBy = 'passenger' | 'driver' | 'system' | null;

export type BookingFeedback = {
    rating: number | null;
    comment: string | null;
    reviewedAt: string | null;
};

export type BookingRecord = {
    _id: string;
    status: BookingStatus;
    fare: number | null;
    source: BookingCoordinates;
    destination: BookingCoordinates;
    driver: string | null;
    driverInfo: BookingDriverInfo;
    driverLocation: BookingDriverLocation;
    cancelledAt: string | null;
    cancelledBy: BookingCancelledBy;
    feedback: BookingFeedback;
    createdAt: string;
};

export type CancelBookingResult = {
    _id: string;
    status: BookingStatus;
    fare: number | null;
    cancelledAt: string;
    cancelledBy: 'passenger';
    driver: string | null;
    driverInfo: BookingDriverInfo;
};

export async function fetchBookings(): Promise<BookingRecord[]> {
    const response = await fetch('/api/v1/passenger/bookings', {
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        let message = `Could not load your bookings (${response.status})`;
        try {
            const err = (await response.json()) as { message?: string };
            if (err?.message) message = err.message;
        } catch {
            // fall back to the generic message
        }
        throw new Error(message);
    }

    const data = (await response.json()) as {
        success?: boolean;
        bookings?: BookingRecord[];
    };

    if (!data?.success) {
        throw new Error('Could not load your bookings.');
    }

    return data.bookings ?? [];
}

export async function cancelBooking(bookingId: string, reason?: string): Promise<CancelBookingResult> {
    const response = await fetch(`/api/v1/passenger/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason ?? undefined }),
    });
    let data: { success?: boolean; ride?: CancelBookingResult; message?: string } = {};
    try {
        data = (await response.json()) as typeof data;
    } catch {
        // fall through to the generic error below
    }
    if (!response.ok || !data.success || !data.ride) {
        const err = new Error(data.message ?? 'Could not cancel your ride.') as Error & { status?: number };
        err.status = response.status;
        throw err;
    }
    return data.ride;
}

export type ReviewBookingResult = {
    _id: string;
    status: BookingStatus;
    feedback: BookingFeedback;
    alreadyReviewed: boolean;
};

export async function submitBookingReview(bookingId: string, rating: number, comment?: string): Promise<ReviewBookingResult> {
    const response = await fetch(`/api/v1/passenger/bookings/${encodeURIComponent(bookingId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment ?? null }),
    });
    let data: { success?: boolean; ride?: ReviewBookingResult; alreadyReviewed?: boolean; message?: string } = {};
    try {
        data = (await response.json()) as typeof data;
    } catch {
        // fall through to the generic error below
    }
    if (!response.ok || !data.success || !data.ride) {
        const err = new Error(data.message ?? 'Could not submit your review.') as Error & { status?: number };
        err.status = response.status;
        throw err;
    }
    return { ...data.ride, alreadyReviewed: Boolean(data.alreadyReviewed) };
}