import { v } from "convex/values";
import { z } from "zod";

export const hardwareValidator = v.object({
    cpu_name: v.string(),
    cpu_cores: v.number(),
    cpu_logical_processors: v.number(),
    ram_bytes: v.number(),
    system_drive: v.string(),
    system_drive_total_bytes: v.number(),
    system_drive_free_bytes: v.number(),
});

const byteCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hardwareSchema = z.object({
    cpu_name: z.string().min(1).max(1024),
    cpu_cores: z.number().int().positive(),
    cpu_logical_processors: z.number().int().positive(),
    ram_bytes: byteCount.positive(),
    system_drive: z.string().regex(/^[A-Za-z]:$/),
    system_drive_total_bytes: byteCount.positive(),
    system_drive_free_bytes: byteCount,
}).refine((hardware) => hardware.system_drive_free_bytes <= hardware.system_drive_total_bytes,
    { message: "Free space exceeds drive capacity" });

export const inventorySchema = z.object({
    name: z.string().optional(),
    rustdesk_id: z.union([z.number(), z.string()]).optional(),
    ip: z.string().optional(),
    os: z.string().optional(),
    os_version: z.string().optional(),
    login_user: z.string().optional(),
    intune_id: z.string().optional(),
    client_version: z.string().optional(),
    hardware: hardwareSchema.optional(),
});
