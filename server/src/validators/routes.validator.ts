import { z } from "zod";

export const routeQuerySchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
});