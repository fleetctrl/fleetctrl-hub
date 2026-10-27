import { z } from "zod";

export const INSTALL_STATUSES = ["PENDING", "INSTALLING", "INSTALLED", "ERROR", "UNINSTALLED"] as const;
export type InstallStatus = (typeof INSTALL_STATUSES)[number];

const MAX_INSTALL_ERROR_LENGTH = 2000;

/** Trims a client-reported install error and caps its length; empty messages become undefined. */
export function normalizeInstallError(error: string | undefined) {
    const trimmed = error?.trim();
    return trimmed ? trimmed.slice(0, MAX_INSTALL_ERROR_LENGTH) : undefined;
}

/** Body of `PATCH /apps/release/:releaseId/state` (device API). */
export const installStateBodySchema = z.object({
    status: z.string().optional(),
    installed_at: z.number().optional(),
    last_seen_at: z.number().optional(),
    reinstall_requested_at: z.number().optional(),
    // Why the release ended in ERROR; sent by clients that support error reporting.
    error: z.string().optional().transform(normalizeInstallError),
});

/** A file uploaded through `PUT /admin/files`; `storageId` is the file ID. */
export const storedFileSchema = z.object({
    storageId: z.string(),
    name: z.string(),
    size: z.number(),
    hash: z.string(),
    type: z.string(),
});

export type StoredFileInput = z.infer<typeof storedFileSchema>;

const groupAssignmentSchema = z.object({
    groupId: z.string(),
    groupType: z.enum(["static", "dynamic"]),
    mode: z.enum(["include", "exclude"]),
});

export const assignmentsSchema = z.object({
    installGroups: z.array(groupAssignmentSchema),
    uninstallGroups: z.array(groupAssignmentSchema),
});

export const detectionInputSchema = z.object({
    type: z.enum(["file", "registry"]),
    path: z.string().optional(),
    fileType: z.string().optional(),
    fileTypeValue: z.string().optional(),
    registryKey: z.string().optional(),
    registryType: z.string().optional(),
    registryTypeValue: z.string().optional(),
});

export const requirementInputSchema = z.object({
    requirementScriptBinary: storedFileSchema.optional(),
    timeout: z.number().optional(),
    runAsSystem: z.boolean().optional(),
}).nullish();

export const scriptInputSchema = z.object({
    scriptBinary: storedFileSchema.optional(),
    timeout: z.number().optional(),
    runAsSystem: z.boolean().optional(),
    engine: z.literal("powershell"),
}).nullish();

/** Arguments of createRelease / updateRelease. */
export const releaseInputSchema = z.object({
    type: z.enum(["win32", "winget"]),
    disabled: z.boolean().optional(),
    version: z.string().optional(),
    uninstall_previous: z.boolean(),
    wingetId: z.string().optional(),
    installBinary: storedFileSchema.optional(),
    installScript: z.string().optional(),
    uninstallScript: z.string().optional(),
    detections: z.array(detectionInputSchema),
    requirements: requirementInputSchema,
    preScript: scriptInputSchema,
    postScript: scriptInputSchema,
    assignments: assignmentsSchema,
});

export type ReleaseInput = z.infer<typeof releaseInputSchema>;

/** Arguments of create (a new app with its first release). */
export const createAppSchema = z.object({
    appInfo: z.object({
        name: z.string(),
        description: z.string().optional(),
        publisher: z.string(),
    }),
    release: z.object({
        type: z.enum(["win32", "winget"]),
        wingetId: z.string().optional(),
        installScript: z.string().optional(),
        uninstallScript: z.string().optional(),
        installBinary: storedFileSchema.optional(),
        autoUpdate: z.boolean(),
        version: z.string().optional(),
        uninstallPreviousVersion: z.boolean(),
        allowMultipleVersions: z.boolean(),
    }),
    requirement: requirementInputSchema,
    detection: z.object({ detections: z.array(detectionInputSchema) }),
    preScript: scriptInputSchema,
    postScript: scriptInputSchema,
    assignment: assignmentsSchema,
});

export const updateAppSchema = z.object({
    display_name: z.string().optional(),
    description: z.string().optional(),
    publisher: z.string().optional(),
});

export const paginationQuerySchema = z.object({
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});
