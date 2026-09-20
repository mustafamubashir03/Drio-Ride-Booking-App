import { z } from "zod";

export const driverAvailabilitySchema = z.object({
    availabilityStatus: z.enum(["online", "offline"]),
});