import logger from "../config/logger.config";
import { createBookingRepository, listBookingsRepository } from "../repositories/booking.repository";
import { calculateFare, calculateHaversineDistance } from "../utils/helpers/distance";
import { setRidePassengerService, findNearByDriversService, setSearchStageService } from "./location.service";
import { kickoffDriverSearch } from "./driver-search.service";

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
    passengerName,
}: {
    passengerId: string,
    source: BookingLocation,
    destination: BookingLocation,
    passengerName?: string,
}) => {
    try {
        const distance = Math.round(calculateHaversineDistance(source.latitude, source.longitude, destination.latitude, destination.longitude) * 100) / 100;
        const fare = calculateFare(source.latitude, source.longitude, destination.latitude, destination.longitude);
        logger.info(`[BOOKING] Creating booking: passengerId=${passengerId}, source=(${source.latitude},${source.longitude}), destination=(${destination.latitude},${destination.longitude}), fare=${fare}, distance=${distance}`);
        const booking = await createBookingRepository({
            passenger: passengerId,
            source,
            destination,
            fare,
            distance,
            status: "pending",
        })

        if (booking) {
            await setSearchStageService(booking._id.toString(), 0);
            await setRidePassengerService(booking._id.toString(), passengerId);
            logger.info(`[BOOKING] bookingId=${booking._id}, pickup=(${source.latitude},${source.longitude}), distance=${distance}, fare=${fare}`);
            const rideInfo = {
                pickup: source.displayName || source.name || "Unknown",
                destination: destination.displayName || destination.name || "Unknown",
                fare,
                distance,
                passengerName: passengerName || "Passenger",
            };
            const notified = await kickoffDriverSearch({
                bookingId: booking._id.toString(),
                longitude: source.longitude,
                latitude: source.latitude,
                rideInfo,
            });
            logger.info(`[BOOKING] Notified ${notified} drivers at stage 0 for booking ${booking._id}`);
        }

        return booking;

    }
    catch (error) {
        logger.error("[BOOKING] Failed to create booking", error);
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
