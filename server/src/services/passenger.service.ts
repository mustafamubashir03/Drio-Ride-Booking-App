import logger from "../config/logger.config";
import { createBookingRepository, listBookingsRepository } from "../repositories/booking.repository";
import { calculateHaversineDistance } from "../utils/helpers/distance";
import { findNearByDriversService } from "./location.service";

const BASIC_FARE = 50;
const PER_KM = 10;

type BookingLocation = {
    name?: string;
    displayName?: string;
    latitude: number;
    longitude: number;
};

export const createBookingService = async ({
    passengerId,
    source,
    destination,
}: {
    passengerId: string,
    source: BookingLocation,
    destination: BookingLocation,
}) => {
    try {
        const distance = calculateHaversineDistance(source.latitude, source.longitude, destination.latitude, destination.longitude);
        const fare = BASIC_FARE + PER_KM * distance;
        const booking = await createBookingRepository({
            passenger: passengerId,
            source,
            destination,
            fare,
            status: "pending",
        })

        return booking;

    }
    catch (error) {
        logger.error("Failed to create booking", error);
        return null;
    }
}

export const listBookingsService = async (passengerId: string) => {
    try {
        return await listBookingsRepository(passengerId);
    }
    catch (error) {
        logger.error("Failed to list bookings", error);
        return [];
    }
}


export const findNearByOriginService = async (source: { latitude: number, longitude: number }, radius = 5) => {
    try {
        const longitude = parseFloat(source.longitude.toFixed(6));
        const latitude = parseFloat(source.latitude.toFixed(6));
        const r = parseFloat(radius.toFixed(6));
        const nearbyDrivers = await findNearByDriversService(longitude, latitude, r);
        return nearbyDrivers;


    }
    catch (error) {
        logger.error("Failed to find nearby drivers", error);
        return [];
    }
}
