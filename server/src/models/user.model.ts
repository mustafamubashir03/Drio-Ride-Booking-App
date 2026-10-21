import { Schema, model } from "mongoose";

export const USER_ROLES = ["passenger", "driver", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "passenger";

interface User {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role?: UserRole;
    banned?: boolean;
    banReason?: string | null;
    banExpires?: Date | null;
    // Optional vehicle category if user is a driver
    vehicleType?: string;
    vehicleName?: string;
    vehicleColor?: string;
    vehicleNumberPlate?: string;
    vehicleImage?: string;
    location?: {
        type: "Point";
        coordinates: number[];
    };
    createdAt: string | Date;
    updatedAt: string | Date;
}

const userSchema = new Schema<User>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, required: true, default: false },
    image: { type: String, default: null },
    role: {
        type: String,
        enum: USER_ROLES,
        default: DEFAULT_USER_ROLE,
    },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    banExpires: { type: Date, default: null },
    vehicleType: { type: String, default: 'mini' },
    // The driver's own vehicle. These must be declared as real schema paths:
    // with `strict: false` a plain assignment to an undeclared key is silently
    // dropped on save, so the driver's car never reached Mongo and every
    // vehicle-aware API returned empty vehicle details.
    vehicleName: { type: String, default: null },
    vehicleColor: { type: String, default: null },
    vehicleNumberPlate: { type: String, default: null },
    vehicleImage: { type: String, default: null },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point",
        },
        coordinates: {
            type: [Number],
            default: [0, 0],
        },
    },
    createdAt: { type: Schema.Types.Mixed },
    updatedAt: { type: Schema.Types.Mixed },
}, {
    collection: "user",
    strict: false,
    versionKey: false,
    minimize: false,
});

userSchema.index({ location: "2dsphere" });

const User = model<User>("User", userSchema, "user");

export default User;