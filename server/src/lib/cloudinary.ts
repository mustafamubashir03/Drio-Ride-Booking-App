import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig } from "../config/cloudinary.config";
import logger from "../config/logger.config";

cloudinary.config({
    cloud_name: cloudinaryConfig.cloudName,
    api_key: cloudinaryConfig.apiKey,
    api_secret: cloudinaryConfig.apiSecret,
    secure: true,
});

export function isCloudinaryConfigured(): boolean {
    return cloudinaryConfig.configured;
}

export type CloudinaryUploadResult = {
    publicId: string;
    secureUrl: string;
    format?: string;
};

export function uploadDriverDocumentBuffer(
    buffer: Buffer,
    options: { folder: string; publicId: string }
): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: options.folder,
                public_id: options.publicId,
                resource_type: "auto",
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (!result) {
                    reject(new Error("Cloudinary returned no upload result"));
                    return;
                }
                resolve({
                    publicId: result.public_id,
                    secureUrl: result.secure_url,
                    format: result.format,
                });
            }
        );
        stream.end(buffer);
    });
}

export async function deleteCloudinaryAsset(publicId: string): Promise<void> {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        // Best effort cleanup — never fail the request for a stale asset.
        // Logged without any secret or file content.
        logger.warn("Failed to delete stale Cloudinary asset", {
            publicId,
            message: (error as Error).message,
        });
    }
}