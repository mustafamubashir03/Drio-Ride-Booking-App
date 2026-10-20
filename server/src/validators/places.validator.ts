import { z } from "zod";

export const searchPlacesQuerySchema = z.object({
    q: z.string().trim().max(200).optional(),
});

export const reverseGeocodeQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
});