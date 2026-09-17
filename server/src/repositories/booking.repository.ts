import Booking from "../models/booking.model"





export const createBookingRepository = async (bookingData: any) => {
    const booking = new Booking(bookingData)
    return await booking.save()
}

