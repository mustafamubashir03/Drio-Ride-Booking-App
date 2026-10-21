import { Types } from "mongoose";
import User from "../models/user.model";

export type DriverVehicleDetails = {
    vehicleType: string;
    vehicleName: string;
    vehicleColor: string;
    vehicleNumberPlate: string;
    vehicleImage: string;
};

/**
 * Copy a driver's vehicle onto their user document.
 *
 * The user document is what every passenger-facing endpoint populates, so this
 * is what makes the vehicle actually visible to riders. It is deliberately a
 * plain `$set` of the four vehicle fields: it never touches the person's
 * role, name, image or anything else on the account.
 */
export const updateUserVehicleRepository = async (
    userId: string,
    vehicle: DriverVehicleDetails
) => {
    if (!Types.ObjectId.isValid(userId)) return null;

    return await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                vehicleType: vehicle.vehicleType,
                vehicleName: vehicle.vehicleName,
                vehicleColor: vehicle.vehicleColor,
                vehicleNumberPlate: vehicle.vehicleNumberPlate,
                vehicleImage: vehicle.vehicleImage,
            },
        },
        { new: true }
    )
        .lean()
        .exec();
};

/**
 * Promote a passenger to driver.
 *
 * Only used when a driver application is approved. An admin is never
 * downgraded: an admin who is also an approved driver keeps the admin role,
 * because the role is about what they can administer, not about whether they
 * can take rides.
 */
export const promoteUserToDriverRepository = async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) return null;

    return await User.findOneAndUpdate(
        { _id: userId, role: { $ne: "admin" } },
        { $set: { role: "driver" } },
        { new: true }
    )
        .lean()
        .exec();
};
