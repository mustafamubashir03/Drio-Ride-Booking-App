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

const UserModel = model<User>("User", userSchema, "user");

export default UserModel;