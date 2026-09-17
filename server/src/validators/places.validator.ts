import { z } from "zod";

export const searchPlacesQuerySchema = z.object({
    q: z.string().trim().max(200).optional(),
});