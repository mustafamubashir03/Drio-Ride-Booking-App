import { Schema, model, InferSchemaType } from "mongoose";

type Permission = string;

const roleSchema = new Schema({
    name: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: "" },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: true },
}, {
    timestamps: true,
    versionKey: false,
});

const RoleModel = model("Role", roleSchema, "roles");

export type Role = InferSchemaType<typeof roleSchema> & {
    permissions: Permission[];
};

export default RoleModel;