import dotenv from "dotenv";

dotenv.config();

type CloudinaryConfig = {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    presetName: string;
    configured: boolean;
};

export const cloudinaryConfig: CloudinaryConfig = {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
    presetName: (process.env.CLOUDINARY_PRESET_NAME || "").trim(),
    configured: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    ),
};