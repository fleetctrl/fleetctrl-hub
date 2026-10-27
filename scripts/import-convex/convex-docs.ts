import { z } from "zod";

// Documents of a `npx convex export --include-file-storage` zip, parsed at the boundary.
// Convex serializes every number as a float (`4.0`, fractional `_creationTime`); unknown and
// legacy fields (search_text, allow_multiple_versions, version_sort_key, ...) are stripped.

const id = z.string().min(1);
const ms = z.number();
const base = { _id: id, _creationTime: ms };
const optionalText = z.string().optional();
const assignType = z.enum(["include", "exclude"]);
const assignAction = z.enum(["install", "uninstall"]);

const hardware = z.object({
    cpu_name: z.string(),
    cpu_cores: z.number(),
    cpu_logical_processors: z.number(),
    ram_bytes: z.number(),
    system_drive: z.string(),
    system_drive_total_bytes: z.number(),
    system_drive_free_bytes: z.number(),
});

export const convexDocSchemas = {
    computers: z.object({
        ...base,
        name: z.string(),
        jkt: optionalText,
        rustdesk_id: z.number().optional(),
        ip: optionalText,
        os: optionalText,
        os_version: optionalText,
        login_user: optionalText,
        client_version: optionalText,
        last_connection: ms.optional(),
        last_inventory_at: ms.optional(),
        hardware: hardware.optional(),
        intune_id: optionalText,
    }),
    enrollment_tokens: z.object({
        ...base,
        token_hash: z.string(),
        name: optionalText,
        token_fragment: optionalText,
        remaining_uses: z.number(),
        disabled: z.boolean(),
        expires_at: ms.optional(),
        last_used_at: ms.optional(),
    }),
    refresh_tokens: z.object({
        ...base,
        computer_id: id,
        token_hash: z.string(),
        jkt: z.string(),
        status: z.enum(["ACTIVE", "ROTATED", "REVOKED", "EXPIRED"]),
        expires_at: ms,
        grace_until: ms.optional(),
        last_used_at: ms.optional(),
    }),
    tasks: z.object({
        ...base,
        computer_id: id,
        task_type: z.enum(["SET_PASSWD", "SET_NETWORK_STRING"]),
        status: z.enum(["PENDING", "IN_PROGRESS", "SUCCESS", "ERROR"]),
        task_data: z.json().optional(),
        error: optionalText,
        started_at: ms.optional(),
        finish_at: ms.optional(),
    }),
    computer_groups: z.object({ ...base, display_name: z.string(), description: optionalText }),
    computer_group_members: z.object({ ...base, group_id: id, computer_id: id }),
    dynamic_computer_groups: z.object({
        ...base,
        display_name: z.string(),
        description: optionalText,
        rule_expression: z.json(),
        last_evaluated_at: ms.optional(),
    }),
    apps: z.object({
        ...base,
        display_name: z.string(),
        description: optionalText,
        publisher: z.string(),
        auto_update: z.boolean(),
    }),
    releases: z.object({
        ...base,
        app_id: id,
        version: z.string(),
        installer_type: z.enum(["winget", "win32"]),
        disabled_at: ms.optional(),
        uninstall_previous: z.boolean(),
    }),
    win32_releases: z.object({
        ...base,
        release_id: id,
        installer_name: z.string(),
        install_binary_storage_id: id,
        hash: z.string(),
        install_script: z.string(),
        uninstall_script: z.string(),
        install_binary_size: z.number().optional(),
    }),
    winget_releases: z.object({ ...base, release_id: id, winget_id: z.string() }),
    detection_rules: z.object({ ...base, release_id: id, type: z.enum(["file", "registry"]), config: z.json() }),
    release_requirements: z.object({
        ...base,
        release_id: id,
        timeout_seconds: z.number(),
        run_as_system: z.boolean(),
        script_name: z.string(),
        storage_id: id,
        hash: z.string(),
        byte_size: z.number().optional(),
    }),
    release_scripts: z.object({
        ...base,
        release_id: id,
        phase: z.enum(["pre", "post"]),
        engine: z.literal("powershell"),
        timeout_seconds: z.number(),
        run_as_system: z.boolean(),
        script_name: z.string(),
        storage_id: id.optional(),
        hash: z.string(),
        byte_size: z.number().optional(),
    }),
    computer_group_releases: z.object({ ...base, release_id: id, group_id: id, assign_type: assignType, action: assignAction }),
    dynamic_group_releases: z.object({ ...base, release_id: id, group_id: id, assign_type: assignType, action: assignAction }),
    computer_apps_installs: z.object({
        ...base,
        computer_id: id,
        app_id: id,
        status: z.enum(["PENDING", "INSTALLING", "INSTALLED", "ERROR", "UNINSTALLED"]),
        release_id: id.optional(),
        error: optionalText,
        installed_at: ms.optional(),
        last_seen_at: ms.optional(),
        status_updated_at: ms.optional(),
        reinstall_requested_at: ms.optional(),
    }),
    client_updates: z.object({
        ...base,
        version: z.string(),
        storage_id: id,
        hash: z.string(),
        byte_size: z.number(),
        file_name: optionalText,
        mime_type: optionalText,
        is_active: z.boolean(),
        notes: optionalText,
    }),
    _storage: z.object({
        ...base,
        // base64-encoded SHA-256
        sha256: z.string(),
        size: z.number(),
        contentType: optionalText,
    }),
    // Better Auth component (`_components/betterAuth/<table>`)
    user: z.object({
        ...base,
        name: z.string(),
        email: z.string(),
        emailVerified: z.boolean(),
        image: z.string().nullish(),
        createdAt: ms,
        updatedAt: ms,
        role: z.string().nullish(),
    }),
    account: z.object({
        ...base,
        accountId: z.string(),
        providerId: z.string(),
        userId: id,
        accessToken: z.string().nullish(),
        refreshToken: z.string().nullish(),
        idToken: z.string().nullish(),
        accessTokenExpiresAt: ms.nullish(),
        refreshTokenExpiresAt: ms.nullish(),
        scope: z.string().nullish(),
        password: z.string().nullish(),
        createdAt: ms,
        updatedAt: ms,
    }),
};

export type ConvexTable = keyof typeof convexDocSchemas;
export type ConvexDoc<Table extends ConvexTable> = z.infer<(typeof convexDocSchemas)[Table]>;

/** Path of a table's documents inside the export. */
export function documentsPath(table: ConvexTable): string {
    return table === "user" || table === "account"
        ? `_components/betterAuth/${table}/documents.jsonl`
        : `${table}/documents.jsonl`;
}

export const CONVEX_TABLES = Object.keys(convexDocSchemas) as ConvexTable[];
