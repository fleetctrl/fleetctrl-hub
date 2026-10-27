import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamptz } from "@/server/db/columns";
import { computers } from "@/features/computers/server";
import { computerGroups, dynamicComputerGroups } from "@/features/groups/server";
import { files } from "@/features/files/server";

export const installerType = pgEnum("installer_type", ["winget", "win32"]);
export const detectionType = pgEnum("detection_type", ["file", "registry"]);
export const scriptPhase = pgEnum("script_phase", ["pre", "post"]);
export const scriptEngine = pgEnum("script_engine", ["powershell"]);
export const assignType = pgEnum("assign_type", ["include", "exclude"]);
export const assignAction = pgEnum("assign_action", ["install", "uninstall"]);
export const installStatus = pgEnum("install_status", ["PENDING", "INSTALLING", "INSTALLED", "ERROR", "UNINSTALLED"]);

export const apps = pgTable("apps", {
    id: primaryId(),
    createdAt: createdAt(),
    displayName: text().notNull(),
    description: text(),
    publisher: text().notNull(),
    autoUpdate: boolean().notNull(),
}, (t) => [
    index("apps_display_name_idx").on(t.displayName),
    index("apps_created_at_idx").on(t.createdAt, t.id),
]);

export const releases = pgTable("releases", {
    id: primaryId(),
    createdAt: createdAt(),
    appId: text().notNull().references(() => apps.id, { onDelete: "cascade" }),
    version: text().notNull(),
    installerType: installerType().notNull(),
    disabledAt: timestamptz(),
    uninstallPrevious: boolean().notNull(),
    versionSortKey: text().notNull(),
}, (t) => [
    index("releases_app_version_idx").on(t.appId, t.version),
    index("releases_app_sort_idx").on(t.appId, t.versionSortKey, t.id),
]);

export const win32Releases = pgTable("win32_releases", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().unique().references(() => releases.id, { onDelete: "cascade" }),
    installerName: text().notNull(),
    installBinaryFileId: text().notNull().references(() => files.id, { onDelete: "restrict" }),
    hash: text().notNull(),
    installScript: text().notNull(),
    uninstallScript: text().notNull(),
    installBinarySize: bigint({ mode: "number" }),
}, (t) => [
    index("win32_releases_file_idx").on(t.installBinaryFileId),
]);

export const wingetReleases = pgTable("winget_releases", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().unique().references(() => releases.id, { onDelete: "cascade" }),
    wingetId: text().notNull(),
});

export const detectionRules = pgTable("detection_rules", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().references(() => releases.id, { onDelete: "cascade" }),
    type: detectionType().notNull(),
    config: jsonb().notNull(),
}, (t) => [
    index("detection_rules_release_idx").on(t.releaseId),
]);

export const releaseRequirements = pgTable("release_requirements", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().references(() => releases.id, { onDelete: "cascade" }),
    timeoutSeconds: integer().notNull(),
    runAsSystem: boolean().notNull(),
    scriptName: text().notNull(),
    fileId: text().notNull().references(() => files.id, { onDelete: "restrict" }),
    hash: text().notNull(),
    byteSize: bigint({ mode: "number" }),
}, (t) => [
    index("release_requirements_release_idx").on(t.releaseId),
    index("release_requirements_file_idx").on(t.fileId),
]);

export const releaseScripts = pgTable("release_scripts", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().references(() => releases.id, { onDelete: "cascade" }),
    phase: scriptPhase().notNull(),
    engine: scriptEngine().notNull(),
    timeoutSeconds: integer().notNull(),
    runAsSystem: boolean().notNull(),
    scriptName: text().notNull(),
    fileId: text().references(() => files.id, { onDelete: "restrict" }),
    hash: text().notNull(),
    byteSize: bigint({ mode: "number" }),
}, (t) => [
    index("release_scripts_release_idx").on(t.releaseId),
    index("release_scripts_file_idx").on(t.fileId),
]);

export const computerGroupReleases = pgTable("computer_group_releases", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().references(() => releases.id, { onDelete: "cascade" }),
    groupId: text().notNull().references(() => computerGroups.id, { onDelete: "cascade" }),
    assignType: assignType().notNull(),
    action: assignAction().notNull(),
}, (t) => [
    uniqueIndex("computer_group_releases_release_group_unique").on(t.releaseId, t.groupId),
    index("computer_group_releases_group_idx").on(t.groupId),
]);

export const dynamicGroupReleases = pgTable("dynamic_group_releases", {
    id: primaryId(),
    createdAt: createdAt(),
    releaseId: text().notNull().references(() => releases.id, { onDelete: "cascade" }),
    groupId: text().notNull().references(() => dynamicComputerGroups.id, { onDelete: "cascade" }),
    assignType: assignType().notNull(),
    action: assignAction().notNull(),
}, (t) => [
    uniqueIndex("dynamic_group_releases_release_group_unique").on(t.releaseId, t.groupId),
    index("dynamic_group_releases_group_idx").on(t.groupId),
]);

export const computerAppsInstalls = pgTable("computer_apps_installs", {
    id: primaryId(),
    createdAt: createdAt(),
    computerId: text().notNull().references(() => computers.id, { onDelete: "cascade" }),
    appId: text().notNull().references(() => apps.id, { onDelete: "cascade" }),
    status: installStatus().notNull(),
    // Populated when the status moves past PENDING.
    releaseId: text().references(() => releases.id, { onDelete: "cascade" }),
    error: text(),
    installedAt: timestamptz(),
    lastSeenAt: timestamptz(),
    statusUpdatedAt: timestamptz(),
    // Set by an admin to make the client reinstall the app; cleared when the client echoes the same value back.
    reinstallRequestedAt: timestamptz(),
}, (t) => [
    uniqueIndex("computer_apps_installs_computer_app_unique").on(t.computerId, t.appId),
    index("computer_apps_installs_app_status_idx").on(t.appId, t.status),
    index("computer_apps_installs_app_updated_idx").on(t.appId, t.statusUpdatedAt, t.id),
    index("computer_apps_installs_release_idx").on(t.releaseId),
]);

export type AppRow = typeof apps.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;
export type InstallRow = typeof computerAppsInstalls.$inferSelect;
export type InstallStatus = (typeof installStatus.enumValues)[number];
