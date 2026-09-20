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
    feedback: {
        rating: Number,
        comment: String
    },
    distance: Number,

})


const Booking = mongoose.model("Booking", bookingSchema)

export default Booking;
