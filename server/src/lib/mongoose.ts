import mongoose from "mongoose";
import { getMongo } from "../utils/db/getMongo";
import logger from "../config/logger.config";

export async function connectMongoose() {
    if (mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(getMongo() as string);
        logger.info("Mongoose connected to MongoDB");
    } catch (err) {
        logger.error("Failed to connect mongoose", { error: (err as Error).message });
        throw err;
    }
}

export async function disconnectMongoose() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        logger.info("Mongoose disconnected from MongoDB");
    }
}