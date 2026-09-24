import mongoose from "mongoose";

export const BOOKING_STATUSES = [
    'pending',
    'confirmed',
    'arriving',
    'arrived',
    'in_progress',
    'completed',
    'cancelled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const bookingSchema = new mongoose.Schema({
    passenger: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    assignedAt: {
        type: Date,
        default: null
    },
    source: {
        name: String,
        displayName: String,
        latitude: {
            type: Number,
            required: true,
        },
        longitude: {
            type: Number,
            required: true,
        }
    },
    destination: {
        name: String,
        displayName: String,
        latitude: {
            type: Number,
            required: true,
        },
        longitude: {
            type: Number,
            required: true,
        }
    },
    fare: Number,
    status: {
        type: String,
        enum: [...BOOKING_STATUSES] as string[],
        default: 'pending'
    },
    // Who ended a ride and why. `cancelledAt` seeds reload-safe presentation
    // while `cancelledBy`/`cancellationReason` stay internal (the UI shows a
    // friendly message, not the raw reason).
    cancelledAt: {
        type: Date,
        default: null
    },
    cancelledBy: {
        type: String,
        enum: ['passenger', 'driver', 'system'],
        default: null
    },
    cancellationReason: {
        type: String,
        default: null
    },
    // Optional post-ride review. `reviewedAt` is the single-write guard: it is
    // null until the passenger submits feedback and is set atomically together
    // with the rating/comment so duplicate submissions are impossible.
    feedback: {
        rating: Number,
        comment: String,
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    distance: Number,

})


const Booking = mongoose.model("Booking", bookingSchema)

export default Booking;
