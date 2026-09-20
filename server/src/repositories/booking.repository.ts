import Booking from "../models/booking.model"





export const createBookingRepository = async (bookingData: any) => {
    const booking = new Booking(bookingData)
    return await booking.save()
}

export const listBookingsRepository = async (passengerId: string) => {
    return await Booking.find({ passenger: passengerId })
        .sort({ _id: -1 })
        .lean()
        .exec()
}

