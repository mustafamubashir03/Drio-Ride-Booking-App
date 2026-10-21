import { Types } from "mongoose";
import User from "../models/user.model";
import { getRandomCarDetails } from "../lib/vehicle-utils";
import { findDriverApplicationByUserRepository } from "../repositories/driver-application.repository";
import { updateUserVehicleRepository } from "../repositories/user.repository";

export type DriverProfile = {
    _id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string | null;
    vehicleType: string | null;
    vehicleName: string | null;
    vehicleColor: string | null;
    vehicleNumberPlate: string | null;
    vehicleImage: string | null;
};

/**
 * The driver's own profile, including the car they drive.
 *
 * A driver is only useful to a passenger if the vehicle is real, so if the
 * account has no vehicle yet one is assigned for the driver's category and
 * persisted. That way the driver portal and the passenger card always describe
 * the same car, and the driver never sees an empty vehicle panel.
 */
export const getDriverProfileService = async (
    userId: string
): Promise<DriverProfile | null> => {
    if (!Types.ObjectId.isValid(userId)) return null;

    const user = await User.findById(userId).lean().exec();
    if (!user) return null;

    const hasVehicle = Boolean(
        user.vehicleName &&
        user.vehicleColor &&
        user.vehicleNumberPlate &&
        user.vehicleImage
    );

    if (!hasVehicle) {
        const application = await findDriverApplicationByUserRepository(userId);
        const vehicleType = application?.vehicleType || user.vehicleType || "mini";

        const applicationHasVehicle = Boolean(
            application?.vehicleName &&
            application.vehicleColor &&
            application.vehicleNumberPlate &&
            application.vehicleImage
        );

        const vehicle = applicationHasVehicle
            ? {
                vehicleType,
                vehicleName: application!.vehicleName!,
                vehicleColor: application!.vehicleColor!,
                vehicleNumberPlate: application!.vehicleNumberPlate!,
                vehicleImage: application!.vehicleImage!,
            }
            : { vehicleType, ...getRandomCarDetails(vehicleType) };

        await updateUserVehicleRepository(userId, vehicle);

        return {
            _id: String(user._id),
            name: user.name ?? null,
            email: user.email ?? null,
            image: user.image ?? null,
            role: user.role ?? null,
            vehicleType: vehicle.vehicleType,
            vehicleName: vehicle.vehicleName,
            vehicleColor: vehicle.vehicleColor,
            vehicleNumberPlate: vehicle.vehicleNumberPlate,
            vehicleImage: vehicle.vehicleImage,
        };
    }

    return {
        _id: String(user._id),
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        role: user.role ?? null,
        vehicleType: user.vehicleType ?? null,
        vehicleName: user.vehicleName ?? null,
        vehicleColor: user.vehicleColor ?? null,
        vehicleNumberPlate: user.vehicleNumberPlate ?? null,
        vehicleImage: user.vehicleImage ?? null,
    };
};
