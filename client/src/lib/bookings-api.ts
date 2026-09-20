export type BookingStatus = 'pending' | 'confirmed' | 'arriving' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export type BookingCoordinates = {
    name?: string;
    displayName?: string;
    latitude: number;
    longitude: number;
};

export type BookingRecord = {
    _id: string;
    status: BookingStatus;
    source: BookingCoordinates;
    destination: BookingCoordinates;
    driver: string | null;
    createdAt: string;
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