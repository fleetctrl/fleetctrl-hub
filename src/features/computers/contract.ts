import { z } from "zod";

const byteCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const hardwareSchema = z.object({
    cpu_name: z.string().min(1).max(1024),
    cpu_cores: z.number().int().positive(),
    cpu_logical_processors: z.number().int().positive(),
    ram_bytes: byteCount.positive(),
    system_drive: z.string().regex(/^[A-Za-z]:$/),
    system_drive_total_bytes: byteCount.positive(),
    system_drive_free_bytes: byteCount,
}).refine((hardware) => hardware.system_drive_free_bytes <= hardware.system_drive_total_bytes,
    { message: "Free space exceeds drive capacity" });

export type Hardware = z.infer<typeof hardwareSchema>;

/** Body of `PATCH /computer/hardware-sync` (and the legacy `/computer/rustdesk-sync`). */
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

export type Inventory = z.infer<typeof inventorySchema>;

export const computerSortFieldSchema = z.enum(["name", "os"]);

export const listComputersQuerySchema = z.object({
    filter: z.string().optional(),
    sortField: z.string().optional(),
    sortDesc: z.enum(["true", "false"]).optional(),
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});

/** One entry of the `presence` SSE event: the newest `last_connection` of a computer, in epoch ms. */
export const presenceUpdateSchema = z.object({
    id: z.string(),
    lastConnection: z.number(),
});

export const presenceEventSchema = z.array(presenceUpdateSchema);

export type PresenceUpdate = z.infer<typeof presenceUpdateSchema>;

export const PRESENCE_CHANNEL = "computer_presence";
