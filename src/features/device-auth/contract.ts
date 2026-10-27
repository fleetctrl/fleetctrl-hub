import { z } from "zod";

export const createEnrollmentTokenSchema = z.object({
    name: z.string().optional(),
    // -1 = unlimited
    remainingUses: z.number().int(),
    expiresAt: z.number().optional(),
});

export const paginationQuerySchema = z.object({
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});
