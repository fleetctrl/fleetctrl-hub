import { z } from "zod";

export const createClientUpdateSchema = z.object({
    version: z.string(),
    storageId: z.string(),
    hash: z.string().optional(),
    byte_size: z.number().optional(),
    file_name: z.string().optional(),
    mime_type: z.string().optional(),
    notes: z.string().optional(),
});

export const paginationQuerySchema = z.object({
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});
