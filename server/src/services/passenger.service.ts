import logger from "../config/logger.config";
import { createBookingRepository } from "../repositories/booking.repository";
import { calculateHaversineDistance } from "../utils/helpers/distance";

const BASIC_FARE = 50;
const PER_KM = 10;


export const createBookingService = async ({
    passengerId,
    source,
    destination,
}: {
    passengerId: string,
    source: { latitude: number, longitude: number },
    destination: { latitude: number, longitude: number },
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