import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import {
    findDriverAvailabilityByUserRepository,
    updateDriverAvailabilityByUserRepository,
} from "../repositories/driver-application.repository";
import { removeDriverLocationFromRedisService } from "./location.service";
import type { DriverAvailabilityStatus } from "../models/driver-application.model";

/**
 * Driver availability is persisted on the DriverApplication document (the
 * durable per-user driver record). Online/offline is a backend field — it is
 * NOT local-only state, so a dashboard refresh or new tab keeps the status.
 */
export const getDriverAvailabilityService = async (driverId: string) => {
    const application = await findDriverAvailabilityByUserRepository(driverId);
    if (!application) {
        throw new NotFoundError("No driver application found for this account");
    }
    return {
        status: application.availabilityStatus ?? ("offline" as DriverAvailabilityStatus),
        updatedAt: application.availabilityUpdatedAt ?? null,
    };
};

export const updateDriverAvailabilityService = async (
    driverId: string,
    status: DriverAvailabilityStatus
) => {
    if (status !== "online" && status !== "offline") {
        throw new BadRequestError(
            "availabilityStatus must be either 'online' or 'offline'"
        );
    }
    const application = await updateDriverAvailabilityByUserRepository(
        driverId,
        status
    );
    if (!application) {
        throw new NotFoundError("No driver application found for this account");
    }
    
    // Also handle realtime state in Redis
    if (status === "offline") {
        // Remove driver from realtime GEO index and location metadata
        try {
            await removeDriverLocationFromRedisService(driverId);
            console.log(`[DriverAvailability] Driver ${driverId} went offline, removed from Redis GEO`)
        } catch (err) {
            console.error(`[DriverAvailability] Failed to remove driver ${driverId} from Redis GEO:`, err)
        }
    }
    
    return {
        status: application.availabilityStatus,
        updatedAt: application.availabilityUpdatedAt,
    };
};