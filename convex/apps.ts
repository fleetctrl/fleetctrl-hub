/**
 * Apps Module
 *
 * Handles app and release queries for computers.
 */

import { internalAction, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { installStatusAggregate, INSTALL_STATUSES, InstallStatus } from "./lib/aggregate/installAggregate";
import { internalMutation } from "./functions";
import { normalizeTableId } from "./lib/idNormalization";

type ReleaseAssignment = {
    release_id: Id<"releases">;
    assign_type: "include" | "exclude";
    action: "install" | "uninstall";
};

type AssignmentLookupCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function getReleaseAssignmentsForComputer(
    ctx: AssignmentLookupCtx,
    computerId: Id<"computers">
): Promise<ReleaseAssignment[]> {
    const [staticMemberships, dynamicMemberships] = await Promise.all([
        ctx.db
            .query("computer_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .collect(),
        ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .collect(),
    ]);

    const [staticAssignments, dynamicAssignments] = await Promise.all([
        Promise.all(
            staticMemberships.map(({ group_id }) =>
                ctx.db
                    .query("computer_group_releases")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group_id))
                    .collect()
            )
        ),
        Promise.all(
            dynamicMemberships.map(({ group_id }) =>
                ctx.db
                    .query("dynamic_group_releases")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group_id))
                    .collect()
            )
        ),
    ]);

    const dedupedAssignments = new Map<string, ReleaseAssignment>();

    for (const assignment of [...staticAssignments.flat(), ...dynamicAssignments.flat()]) {
        const releaseKey = assignment.release_id.toString();
        if (!dedupedAssignments.has(releaseKey)) {
            dedupedAssignments.set(releaseKey, {
                release_id: assignment.release_id,
                assign_type: assignment.assign_type,
                action: assignment.action,
            });
        }
    }

    return [...dedupedAssignments.values()];
}

async function hasAssignedReleaseAccess(
    ctx: AssignmentLookupCtx,
    computerId: Id<"computers">,
    releaseId: Id<"releases">
) {
    const assignments = await getReleaseAssignmentsForComputer(ctx, computerId);
    return assignments.some(
        (assignment) => assignment.release_id.toString() === releaseId.toString()
    );
}

// ========================================
// Public Queries
// ========================================

/**
 * Get apps assigned to a computer through group memberships.
 */
export const getAssigned = internalQuery({
    args: { computerId: v.string() },
    handler: async (ctx, { computerId }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const releaseAssignments = await getReleaseAssignmentsForComputer(
            ctx,
            normalizedComputerId
        );

        if (releaseAssignments.length === 0) {
            return [];
        }

        const releases = (
            await Promise.all(
                releaseAssignments.map(({ release_id }) =>
                    ctx.db.get("releases", release_id)
                )
            )
        ).filter(
            (release): release is NonNullable<typeof release> =>
                release !== null && !release.disabled_at
        );

        if (releases.length === 0) {
            return [];
        }

        const appIds = [...new Set(releases.map((release) => release.app_id.toString()))];
        const apps = (
            await Promise.all(
                appIds.map((appId) =>
                    ctx.db.get("apps", appId as Id<"apps">)
                )
            )
        ).filter((app): app is NonNullable<typeof app> => app !== null);

        const releaseMetadata = new Map(
            await Promise.all(
                releases.map(async (release) => [
                    release._id.toString(),
                    {
                        win32: await ctx.db
                            .query("win32_releases")
                            .withIndex("by_release_id", (q) =>
                                q.eq("release_id", release._id)
                            )
                            .first(),
                        winget: await ctx.db
                            .query("winget_releases")
                            .withIndex("by_release_id", (q) =>
                                q.eq("release_id", release._id)
                            )
                            .first(),
                        detectionRules: await ctx.db
                            .query("detection_rules")
                            .withIndex("by_release_id", (q) =>
                                q.eq("release_id", release._id)
                            )
                            .collect(),
                        requirements: await ctx.db
                            .query("release_requirements")
                            .withIndex("by_release_id", (q) =>
                                q.eq("release_id", release._id)
                            )
                            .collect(),
                        scripts: await ctx.db
                            .query("release_scripts")
                            .withIndex("by_release_id", (q) =>
                                q.eq("release_id", release._id)
                            )
                            .collect(),
                    },
                ] as const)
            )
        );

        const result = apps.map((app) => {
            const appReleases = releases.filter(
                (r) => r.app_id.toString() === app._id.toString()
            );

            return {
                id: app._id,
                display_name: app.display_name,
                publisher: app.publisher,
                auto_update: app.auto_update,
                releases: appReleases.map((release) => {
                    const metadata = releaseMetadata.get(release._id.toString());
                    const assignment = releaseAssignments.find(
                        (ra) => ra.release_id.toString() === release._id.toString()
                    );

                    return {
                        id: release._id,
                        version: release.version,
                        assign_type: assignment?.assign_type || "include",
                        action: assignment?.action || "install",
                        installer_type: release.installer_type,
                        uninstall_previous: release.uninstall_previous,
                        win32: metadata?.win32
                            ? {
                                install_binary_path: metadata.win32.install_binary_storage_id,
                                installer_name: metadata.win32.installer_name,
                                hash: metadata.win32.hash,
                                install_script: metadata.win32.install_script,
                                uninstall_script: metadata.win32.uninstall_script,
                                install_binary_size: metadata.win32.install_binary_size,
                            }
                            : null,
                        winget: metadata?.winget
                            ? {
                                winget_id: metadata.winget.winget_id,
                            }
                            : null,
                        detection_rules: (metadata?.detectionRules ?? []).map((r) => ({
                            type: r.type,
                            config: r.config,
                        })),
                        requirements: (metadata?.requirements ?? []).map((r) => ({
                            id: r._id,
                            script_name: r.script_name,
                            timeout_seconds: r.timeout_seconds,
                            run_as_system: r.run_as_system,
                            hash: r.hash,
                        })),
                        scripts: metadata?.scripts ?? [],
                    };
                }),
            };
        });

        return result;
    },
});

// ========================================
// Actions (for storage URL generation)
// ========================================

/**
 * Get download URL for a release binary.
 */
export const getDownloadUrl = internalAction({
    args: {
        computerId: v.string(),
        releaseId: v.string(),
    },
    handler: async (ctx, { computerId, releaseId }): Promise<string | null> => {
        const win32 = await ctx.runQuery(internal.apps.getAuthorizedWin32Release, {
            computerId,
            releaseId,
        });

        if (!win32) {
            return null;
        }

        // 3. Generate signed URL
        const url = await ctx.storage.getUrl(
            win32.install_binary_storage_id as Id<"_storage">
        );

        return url;
    },
});

/**
 * Get download URL for a requirement binary.
 */
export const getRequirementDownloadUrl = internalAction({
    args: {
        computerId: v.string(),
        requirementId: v.string(),
    },
    handler: async (ctx, { computerId, requirementId }): Promise<string | null> => {
        const requirement = await ctx.runQuery(internal.apps.getAuthorizedRequirement, {
            computerId,
            requirementId,
        });

        if (!requirement) {
            return null;
        }

        // 2. Generate signed URL
        const url = await ctx.storage.getUrl(
            requirement.storage_id as Id<"_storage">
        );

        return url;
    },
});

/**
 * Get download URL for a pre/post script binary.
 */
export const getScriptDownloadUrl = internalAction({
    args: {
        computerId: v.string(),
        scriptId: v.string(),
    },
    handler: async (ctx, { computerId, scriptId }): Promise<string | null> => {
        const script = await ctx.runQuery(internal.apps.getAuthorizedScript, {
            computerId,
            scriptId,
        });

        if (!script || !script.storage_id) {
            return null;
        }

        // 2. Generate signed URL
        const url = await ctx.storage.getUrl(
            script.storage_id as Id<"_storage">
        );

        return url;
    },
});

// ========================================
// Internal Queries (for actions)
// ========================================

export const getAuthorizedWin32Release = internalQuery({
    args: {
        computerId: v.string(),
        releaseId: v.string(),
    },
    handler: async (ctx, { computerId, releaseId }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const normalizedReleaseId = normalizeTableId(
            ctx.db,
            "releases",
            releaseId,
            "release ID"
        );
        const release = await ctx.db.get("releases", normalizedReleaseId);

        if (!release || release.disabled_at) {
            return null;
        }

        if (!(await hasAssignedReleaseAccess(ctx, normalizedComputerId, normalizedReleaseId))) {
            return null;
        }

        return await ctx.db
            .query("win32_releases")
            .withIndex("by_release_id", (q) => q.eq("release_id", normalizedReleaseId))
            .first();
    },
});

export const getAuthorizedRequirement = internalQuery({
    args: {
        computerId: v.string(),
        requirementId: v.string(),
    },
    handler: async (ctx, { computerId, requirementId }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const normalizedRequirementId = normalizeTableId(
            ctx.db,
            "release_requirements",
            requirementId,
            "requirement ID"
        );
        const requirement = await ctx.db.get(
            "release_requirements",
            normalizedRequirementId
        );

        if (!requirement) {
            return null;
        }

        const release = await ctx.db.get("releases", requirement.release_id);
        if (!release || release.disabled_at) {
            return null;
        }

        return (await hasAssignedReleaseAccess(
            ctx,
            normalizedComputerId,
            requirement.release_id
        ))
            ? requirement
            : null;
    },
});

export const getAuthorizedScript = internalQuery({
    args: {
        computerId: v.string(),
        scriptId: v.string(),
    },
    handler: async (ctx, { computerId, scriptId }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const normalizedScriptId = normalizeTableId(
            ctx.db,
            "release_scripts",
            scriptId,
            "script ID"
        );
        const script = await ctx.db.get("release_scripts", normalizedScriptId);

        if (!script || !script.storage_id) {
            return null;
        }

        const release = await ctx.db.get("releases", script.release_id);
        if (!release || release.disabled_at) {
            return null;
        }

        return (await hasAssignedReleaseAccess(ctx, normalizedComputerId, script.release_id))
            ? script
            : null;
    },
});

export const updateInstallState = internalMutation({
    args: {
        computerId: v.string(),
        releaseId: v.string(),
        status: v.union(
            v.literal("PENDING"),
            v.literal("INSTALLING"),
            v.literal("INSTALLED"),
            v.literal("ERROR"),
            v.literal("UNINSTALLED")
        ),
        installedAt: v.optional(v.number()),
        lastSeenAt: v.optional(v.number()),
    },
    handler: async (ctx, { computerId, releaseId, status, installedAt, lastSeenAt }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const normalizedReleaseId = normalizeTableId(
            ctx.db,
            "releases",
            releaseId,
            "release ID"
        );
        const computer = await ctx.db.get("computers", normalizedComputerId);
        if (!computer) throw new Error("Computer not found");

        const release = await ctx.db.get("releases", normalizedReleaseId);
        if (!release) throw new Error("Release not found");

        if (!(await hasAssignedReleaseAccess(ctx, normalizedComputerId, normalizedReleaseId))) {
            throw new Error("Release not assigned to computer");
        }

        const appId = release.app_id;

        const existing = await ctx.db
            .query("computer_apps_installs")
            .withIndex("by_computer_app", (q) =>
                q.eq("computer_id", normalizedComputerId).eq("app_id", appId)
            )
            .first();

        const now = Date.now();
        const nextInstalledAt =
            status === "INSTALLED"
                ? installedAt ?? existing?.installed_at ?? now
                : installedAt ?? existing?.installed_at;

        const updatePayload = {
            status,
            status_updated_at: now,
            last_seen_at: lastSeenAt ?? now,
            ...(nextInstalledAt !== undefined
                ? { installed_at: nextInstalledAt }
                : {}),
        };

        if (existing) {
            await ctx.db.patch("computer_apps_installs", existing._id, updatePayload);
        } else {
            await ctx.db.insert("computer_apps_installs", {
                computer_id: normalizedComputerId,
                release_id: normalizedReleaseId,
                app_id: appId,
                ...updatePayload,
            });
        }

        return { success: true };
    },
});

// ========================================
// Admin Queries
// ========================================

const createStatusSummary = () =>
    INSTALL_STATUSES.reduce(
        (acc, status) => ({ ...acc, [status]: 0 }),
        {} as Record<InstallStatus, number>
    );


/**
 * Get table data for admin UI.
 */
export const getTableData = withAuthQuery({
    handler: async (ctx) => {
        const apps = await ctx.db.query("apps").collect();

        return Promise.all(
            apps.map(async (app) => {
                const releases = await ctx.db
                    .query("releases")
                    .withIndex("by_app_id", (q) => q.eq("app_id", app._id))
                    .collect();

                // Get groups for this app through releases
                const groups: { id: string; name: string }[] = [];

                for (const release of releases) {
                    // Static groups
                    const staticAssignments = await ctx.db
                        .query("computer_group_releases")
                        .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                        .collect();

                    for (const assignment of staticAssignments) {
                        const group = await ctx.db.get("computer_groups", assignment.group_id);
                        if (group) {
                            groups.push({ id: group._id, name: group.display_name });
                        }
                    }

                    // Dynamic groups
                    const dynamicAssignments = await ctx.db
                        .query("dynamic_group_releases")
                        .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                        .collect();

                    for (const assignment of dynamicAssignments) {
                        const group = await ctx.db.get("dynamic_computer_groups", assignment.group_id);
                        if (group) {
                            groups.push({ id: group._id, name: group.display_name });
                        }
                    }
                }

                const installedCount = await installStatusAggregate.count(ctx, {
                    namespace: [app._id, "INSTALLED"],
                });

                // Deduplicate groups
                const uniqueGroups = Array.from(
                    new Map(groups.map((g) => [g.id, g])).values()
                );

                return {
                    id: app._id,
                    displayName: app.display_name,
                    createdAt: app._creationTime,
                    updatedAt: app._creationTime,
                    groups: uniqueGroups,
                    groupsCount: uniqueGroups.length,
                    installedCount: installedCount,
                };
            })
        );
    },
});

/**
 * Get app by ID for admin.
 */
export const getById = withAuthQuery({
    args: { id: v.id("apps") },
    handler: async (ctx, { id }) => {
        const app = await ctx.db.get("apps", id);
        if (!app) return null;

        const releases = await ctx.db
            .query("releases")
            .withIndex("by_app_id", (q) => q.eq("app_id", id))
            .collect();

        return {
            id: app._id,
            display_name: app.display_name,
            description: app.description,
            publisher: app.publisher,
            allow_multiple_versions: app.allow_multiple_versions,
            auto_update: app.auto_update,
            created_at: app._creationTime,
            updated_at: app._creationTime,
            releases: releases.map((r) => ({
                id: r._id,
                version: r.version,
                created_at: r._creationTime,
                installer_type: r.installer_type,
                disabled_at: r.disabled_at,
            })),
        };
    },
});

/**
 * Delete an app.
 */
export const remove = withAuthMutation({
    args: { id: v.id("apps") },
    handler: async (ctx, { id }) => {
        // Delete releases first
        const releases = await ctx.db
            .query("releases")
            .withIndex("by_app_id", (q) => q.eq("app_id", id))
            .collect();

        for (const release of releases) {
            // Delete release assignments
            const staticAssignments = await ctx.db
                .query("computer_group_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();

            for (const a of staticAssignments) {
                await ctx.db.delete("computer_group_releases", a._id);
            }

            const dynamicAssignments = await ctx.db
                .query("dynamic_group_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();

            for (const a of dynamicAssignments) {
                await ctx.db.delete("dynamic_group_releases", a._id);
            }

            // Delete detection rules
            const detections = await ctx.db
                .query("detection_rules")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();

            for (const d of detections) {
                await ctx.db.delete("detection_rules", d._id);
            }

            // Delete release
            await ctx.db.delete("releases", release._id);
        }

        // Delete the app
        await ctx.db.delete("apps", id);

        return { success: true };
    },
});

/**
 * Update app details.
 */
export const update = withAuthMutation({
    args: {
        id: v.id("apps"),
        data: v.object({
            display_name: v.optional(v.string()),
            description: v.optional(v.string()),
            publisher: v.optional(v.string()),
        }),
    },
    handler: async (ctx, { id, data }) => {
        const updates: Record<string, unknown> = {};
        if (data.display_name !== undefined) updates.display_name = data.display_name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.publisher !== undefined) updates.publisher = data.publisher;

        if (Object.keys(updates).length > 0) {
            await ctx.db.patch("apps", id, updates);
        }

        return { success: true };
    },
});

/**
 * Get releases for an app.
 */
export const getReleases = withAuthQuery({
    args: { appId: v.id("apps") },
    handler: async (ctx, { appId }) => {
        const releases = await ctx.db
            .query("releases")
            .withIndex("by_app_id", (q) => q.eq("app_id", appId))
            .collect();

        return Promise.all(
            releases.map(async (release) => {
                // Get assignments with group details
                const staticAssignmentsRaw = await ctx.db
                    .query("computer_group_releases")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                const computer_group_releases = await Promise.all(
                    staticAssignmentsRaw.map(async (a) => {
                        const group = await ctx.db.get("computer_groups", a.group_id);
                        return {
                            ...a,
                            computer_groups: group,
                        };
                    })
                );

                const dynamicAssignmentsRaw = await ctx.db
                    .query("dynamic_group_releases")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                const dynamic_group_releases = await Promise.all(
                    dynamicAssignmentsRaw.map(async (a) => {
                        const group = await ctx.db.get("dynamic_computer_groups", a.group_id);
                        return {
                            ...a,
                            dynamic_computer_groups: group,
                        };
                    })
                );

                // Get detection rules
                const detections = await ctx.db
                    .query("detection_rules")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                // Get implementation details
                const win32_releases = await ctx.db
                    .query("win32_releases")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                const winget_releases = await ctx.db
                    .query("winget_releases")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                const release_requirements = await ctx.db
                    .query("release_requirements")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                const release_scripts = await ctx.db
                    .query("release_scripts")
                    .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                    .collect();

                return {
                    id: release._id,
                    version: release.version,
                    created_at: release._creationTime,
                    installer_type: release.installer_type,
                    disabled_at: release.disabled_at,
                    uninstall_previous: release.uninstall_previous,
                    computer_group_releases,
                    dynamic_group_releases,
                    staticAssignments: computer_group_releases, // Alias for backward compat in form
                    dynamicAssignments: dynamic_group_releases, // Alias for backward compat in form
                    detections,
                    win32_releases,
                    winget_releases,
                    release_requirements,
                    release_scripts,
                };
            })
        );
    },
});

/**
 * Get install status per device for all releases of a given app.
 */
export const getDeviceInstallStatus = withAuthQuery({
    args: { appId: v.id("apps") },
    handler: async (ctx, { appId }) => {
        // Use aggregate for O(log n) status counts
        const statusCounts = await installStatusAggregate.countBatch(
            ctx,
            INSTALL_STATUSES.map((status) => ({ namespace: [appId, status] as [typeof appId, InstallStatus] }))
        );
        const byStatus = INSTALL_STATUSES.reduce(
            (acc, status, i) => ({ ...acc, [status]: statusCounts[i] }),
            {} as Record<InstallStatus, number>
        );
        const total = statusCounts.reduce((sum, n) => sum + n, 0);

        // const appMap = new Map(releases.map((app) => [app._id.toString(), app]));
        const installs = await ctx.db.query("computer_apps_installs").withIndex("by_app_id", (q) => q.eq("app_id", appId))
            .collect()

        const items = installs
            .map(async (install) => {
                const computer = await ctx.db.get("computers", install.computer_id);
                const release = install.release_id != undefined ? await ctx.db.get("releases", install.release_id) : null;

                return {
                    id: install._id.toString(),
                    computerId: install.computer_id.toString(),
                    computerName: computer?.name ?? "Unknown computer",
                    appId: install.app_id.toString(),
                    releaseVersion: release?.version || "Unknown version",
                    status: install.status as InstallStatus,
                    installedAt: install.installed_at,
                    lastSeenAt: install.last_seen_at,
                    statusUpdatedAt: install.status_updated_at,
                };
            });

        return {
            total,
            byStatus,
            items: await Promise.all(items),
        };
    },
});

/**
 * Delete a release.
 */
export const deleteRelease = withAuthMutation({
    args: { id: v.id("releases") },
    handler: async (ctx, { id }) => {
        // Delete release assignments
        const staticAssignments = await ctx.db
            .query("computer_group_releases")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const a of staticAssignments) {
            await ctx.db.delete("computer_group_releases", a._id);
        }

        const dynamicAssignments = await ctx.db
            .query("dynamic_group_releases")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const a of dynamicAssignments) {
            await ctx.db.delete("dynamic_group_releases", a._id);
        }

        // Delete detection rules
        const detections = await ctx.db
            .query("detection_rules")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const d of detections) {
            await ctx.db.delete("detection_rules", d._id);
        }

        // Delete the release
        await ctx.db.delete("releases", id);

        return { success: true };
    },
});

/**
 * Generate an upload URL for app binaries.
 */
export const generateUploadUrl = withAuthMutation({
    args: {},
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Create a new application and its initial release.
 */
export const create = withAuthMutation({
    args: {
        appInfo: v.object({
            name: v.string(),
            description: v.optional(v.string()),
            publisher: v.string(),
        }),
        release: v.object({
            type: v.union(v.literal("win32"), v.literal("winget")),
            wingetId: v.optional(v.string()),
            installScript: v.optional(v.string()),
            uninstallScript: v.optional(v.string()),
            installBinary: v.optional(v.object({
                storageId: v.id("_storage"),
                name: v.string(),
                size: v.number(),
                hash: v.string(),
                type: v.string(),
            })),
            autoUpdate: v.boolean(),
            version: v.optional(v.string()),
            uninstallPreviousVersion: v.boolean(),
            allowMultipleVersions: v.boolean(),
        }),
        requirement: v.optional(v.union(v.object({
            requirementScriptBinary: v.optional(v.object({
                storageId: v.id("_storage"),
                name: v.string(),
                size: v.number(),
                hash: v.string(),
                type: v.string(),
            })),
            timeout: v.optional(v.number()),
            runAsSystem: v.optional(v.boolean()),
        }), v.null())),
        detection: v.object({
            detections: v.array(v.object({
                type: v.union(v.literal("file"), v.literal("registry")),
                path: v.string(),
                fileType: v.optional(v.string()),
                fileTypeValue: v.optional(v.string()),
                registryKey: v.optional(v.string()),
                registryType: v.optional(v.string()),
                registryTypeValue: v.optional(v.string()),
            })),
        }),
        preScript: v.optional(v.union(v.object({
            scriptBinary: v.optional(v.object({
                storageId: v.id("_storage"),
                name: v.string(),
                size: v.number(),
                hash: v.string(),
                type: v.string(),
            })),
            timeout: v.optional(v.number()),
            runAsSystem: v.optional(v.boolean()),
            engine: v.union(v.literal("powershell")),
        }), v.null())),
        postScript: v.optional(v.union(v.object({
            scriptBinary: v.optional(v.object({
                storageId: v.id("_storage"),
                name: v.string(),
                size: v.number(),
                hash: v.string(),
                type: v.string(),
            })),
            timeout: v.optional(v.number()),
            runAsSystem: v.optional(v.boolean()),
            engine: v.union(v.literal("powershell")),
        }), v.null())),
        assignment: v.object({
            installGroups: v.array(v.object({
                groupId: v.string(),
                groupType: v.union(v.literal("static"), v.literal("dynamic")),
                mode: v.union(v.literal("include"), v.literal("exclude")),
            })),
            uninstallGroups: v.array(v.object({
                groupId: v.string(),
                groupType: v.union(v.literal("static"), v.literal("dynamic")),
                mode: v.union(v.literal("include"), v.literal("exclude")),
            })),
        }),
    },
    handler: async (ctx, args) => {
        // 1. Create App
        const appId = await ctx.db.insert("apps", {
            display_name: args.appInfo.name,
            description: args.appInfo.description,
            publisher: args.appInfo.publisher,
            allow_multiple_versions: args.release.allowMultipleVersions,
            auto_update: args.release.autoUpdate,
        });

        // 2. Create Release
        const releaseId = await ctx.db.insert("releases", {
            app_id: appId,
            version: args.release.version || "latest",
            installer_type: args.release.type,
            uninstall_previous: args.release.uninstallPreviousVersion,
        });

        // 3. Create Specific Release Info (Win32/Winget)
        if (args.release.type === "win32") {
            if (!args.release.installBinary) throw new Error("Install binary required for win32");
            await ctx.db.insert("win32_releases", {
                release_id: releaseId,
                installer_name: args.release.installBinary.name,
                install_binary_storage_id: args.release.installBinary.storageId,
                hash: args.release.installBinary.hash,
                install_script: args.release.installScript || "",
                uninstall_script: args.release.uninstallScript || "",
                install_binary_size: args.release.installBinary.size,
            });
        } else {
            if (!args.release.wingetId) throw new Error("Winget ID required");
            await ctx.db.insert("winget_releases", {
                release_id: releaseId,
                winget_id: args.release.wingetId,
            });
        }

        // 4. Create Requirements
        if (args.requirement && args.requirement.requirementScriptBinary) {
            await ctx.db.insert("release_requirements", {
                release_id: releaseId,
                script_name: args.requirement.requirementScriptBinary.name,
                timeout_seconds: args.requirement.timeout || 60,
                run_as_system: args.requirement.runAsSystem || false,
                storage_id: args.requirement.requirementScriptBinary.storageId,
                hash: args.requirement.requirementScriptBinary.hash,
                byte_size: args.requirement.requirementScriptBinary.size,
            });
        }

        // 5. Create Detections
        for (const d of args.detection.detections) {
            const isFile = d.type === "file";
            await ctx.db.insert("detection_rules", {
                release_id: releaseId,
                type: d.type,
                config: {
                    "version": "1",
                    "operator": isFile ? d.fileType : d.registryType,
                    "path": isFile ? d.path : d.registryKey,
                    "value": isFile ? d.fileTypeValue : d.registryTypeValue,
                },
            });
        }

        // 6. Create Pre/Post Scripts
        if (args.preScript && args.preScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: releaseId,
                phase: "pre",
                engine: args.preScript.engine || "powershell",
                timeout_seconds: args.preScript.timeout || 60,
                run_as_system: args.preScript.runAsSystem || false,
                script_name: args.preScript.scriptBinary.name,
                storage_id: args.preScript.scriptBinary.storageId,
                hash: args.preScript.scriptBinary.hash,
                byte_size: args.preScript.scriptBinary.size,
            });
        }

        if (args.postScript && args.postScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: releaseId,
                phase: "post",
                engine: args.postScript.engine || "powershell",
                timeout_seconds: args.postScript.timeout || 60,
                run_as_system: args.postScript.runAsSystem || false,
                script_name: args.postScript.scriptBinary.name,
                storage_id: args.postScript.scriptBinary.storageId,
                hash: args.postScript.scriptBinary.hash,
                byte_size: args.postScript.scriptBinary.size,
            });
        }

        // 6. Assignments
        const handleAssignment = async (groups: typeof args.assignment.installGroups, action: "install" | "uninstall") => {
            for (const g of groups) {
                if (g.groupType === "static") {
                    const normalizedGroupId = normalizeTableId(
                        ctx.db,
                        "computer_groups",
                        g.groupId,
                        "static group ID"
                    );
                    await ctx.db.insert("computer_group_releases", {
                        release_id: releaseId,
                        group_id: normalizedGroupId,
                        assign_type: g.mode,
                        action: action,
                    });
                } else {
                    const normalizedGroupId = normalizeTableId(
                        ctx.db,
                        "dynamic_computer_groups",
                        g.groupId,
                        "dynamic group ID"
                    );
                    await ctx.db.insert("dynamic_group_releases", {
                        release_id: releaseId,
                        group_id: normalizedGroupId,
                        assign_type: g.mode,
                        action: action,
                    });
                }
            }
        };

        await handleAssignment(args.assignment.installGroups, "install");
        await handleAssignment(args.assignment.uninstallGroups, "uninstall");

        return appId;
    }
});

const releaseArgs = {
    type: v.union(v.literal("win32"), v.literal("winget")),
    disabled: v.optional(v.boolean()),
    version: v.optional(v.string()),
    uninstall_previous: v.boolean(),
    wingetId: v.optional(v.string()),
    installBinary: v.optional(v.object({
        storageId: v.id("_storage"),
        name: v.string(),
        size: v.number(),
        hash: v.string(),
        type: v.string(),
    })),
    installScript: v.optional(v.string()),
    uninstallScript: v.optional(v.string()),
    detections: v.array(v.any()),
    requirements: v.optional(v.union(v.object({
        requirementScriptBinary: v.optional(v.object({
            storageId: v.id("_storage"),
            name: v.string(),
            size: v.number(),
            hash: v.string(),
            type: v.string(),
        })),
        timeout: v.optional(v.number()),
        runAsSystem: v.optional(v.boolean()),
    }), v.null())),
    preScript: v.optional(v.union(v.object({
        scriptBinary: v.optional(v.object({
            storageId: v.id("_storage"),
            name: v.string(),
            size: v.number(),
            hash: v.string(),
            type: v.string(),
        })),
        timeout: v.optional(v.number()),
        runAsSystem: v.optional(v.boolean()),
        engine: v.union(v.literal("powershell")),
    }), v.null())),
    postScript: v.optional(v.union(v.object({
        scriptBinary: v.optional(v.object({
            storageId: v.id("_storage"),
            name: v.string(),
            size: v.number(),
            hash: v.string(),
            type: v.string(),
        })),
        timeout: v.optional(v.number()),
        runAsSystem: v.optional(v.boolean()),
        engine: v.union(v.literal("powershell")),
    }), v.null())),
    assignments: v.object({
        installGroups: v.array(v.object({
            groupId: v.string(),
            groupType: v.union(v.literal("static"), v.literal("dynamic")),
            mode: v.union(v.literal("include"), v.literal("exclude")),
        })),
        uninstallGroups: v.array(v.object({
            groupId: v.string(),
            groupType: v.union(v.literal("static"), v.literal("dynamic")),
            mode: v.union(v.literal("include"), v.literal("exclude")),
        })),
    }),
};

export const createRelease = withAuthMutation({
    args: {
        appId: v.id("apps"),
        ...releaseArgs,
    },
    handler: async (ctx, args) => {
        // 1. Create Release
        const releaseId = await ctx.db.insert("releases", {
            app_id: args.appId,
            version: args.version || "latest",
            installer_type: args.type,
            uninstall_previous: args.uninstall_previous,
            disabled_at: args.disabled ? Date.now() : undefined,
        });

        // 2. Create Specific Release Info
        if (args.type === "win32") {
            if (!args.installBinary) throw new Error("Install binary required for win32");
            await ctx.db.insert("win32_releases", {
                release_id: releaseId,
                installer_name: args.installBinary.name,
                install_binary_storage_id: args.installBinary.storageId,
                hash: args.installBinary.hash,
                install_script: args.installScript || "",
                uninstall_script: args.uninstallScript || "",
                install_binary_size: args.installBinary.size,
            });
        } else {
            if (!args.wingetId) throw new Error("Winget ID required");
            await ctx.db.insert("winget_releases", {
                release_id: releaseId,
                winget_id: args.wingetId,
            });
        }

        // 3. Requirements
        if (args.requirements && args.requirements.requirementScriptBinary) {
            await ctx.db.insert("release_requirements", {
                release_id: releaseId,
                script_name: args.requirements.requirementScriptBinary.name,
                timeout_seconds: args.requirements.timeout || 60,
                run_as_system: args.requirements.runAsSystem || false,
                storage_id: args.requirements.requirementScriptBinary.storageId,
                hash: args.requirements.requirementScriptBinary.hash,
                byte_size: args.requirements.requirementScriptBinary.size,
            });
        }

        // 4. Detections
        for (const d of args.detections) {
            const isFile = d.type === "file";
            await ctx.db.insert("detection_rules", {
                release_id: releaseId,
                type: d.type,
                config: {
                    "version": "1",
                    "operator": isFile ? d.fileType : d.registryType,
                    "path": isFile ? d.path : d.registryKey,
                    "value": isFile ? d.fileTypeValue : d.registryTypeValue,
                },
            });
        }

        // 5. Pre/Post Scripts
        if (args.preScript && args.preScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: releaseId,
                phase: "pre",
                engine: args.preScript.engine || "powershell",
                timeout_seconds: args.preScript.timeout || 60,
                run_as_system: args.preScript.runAsSystem || false,
                script_name: args.preScript.scriptBinary.name,
                storage_id: args.preScript.scriptBinary.storageId,
                hash: args.preScript.scriptBinary.hash,
                byte_size: args.preScript.scriptBinary.size,
            });
        }

        if (args.postScript && args.postScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: releaseId,
                phase: "post",
                engine: args.postScript.engine || "powershell",
                timeout_seconds: args.postScript.timeout || 60,
                run_as_system: args.postScript.runAsSystem || false,
                script_name: args.postScript.scriptBinary.name,
                storage_id: args.postScript.scriptBinary.storageId,
                hash: args.postScript.scriptBinary.hash,
                byte_size: args.postScript.scriptBinary.size,
            });
        }

        // 6. Assignments
        const handleAssignment = async (groups: typeof args.assignments.installGroups, action: "install" | "uninstall") => {
            for (const g of groups) {
                if (g.groupType === "static") {
                    const normalizedGroupId = normalizeTableId(
                        ctx.db,
                        "computer_groups",
                        g.groupId,
                        "static group ID"
                    );
                    await ctx.db.insert("computer_group_releases", {
                        release_id: releaseId,
                        group_id: normalizedGroupId,
                        assign_type: g.mode,
                        action: action,
                    });
                } else {
                    const normalizedGroupId = normalizeTableId(
                        ctx.db,
                        "dynamic_computer_groups",
                        g.groupId,
                        "dynamic group ID"
                    );
                    await ctx.db.insert("dynamic_group_releases", {
                        release_id: releaseId,
                        group_id: normalizedGroupId,
                        assign_type: g.mode,
                        action: action,
                    });
                }
            }
        };

        await handleAssignment(args.assignments.installGroups, "install");
        await handleAssignment(args.assignments.uninstallGroups, "uninstall");

        return releaseId;
    },
});

export const updateRelease = withAuthMutation({
    args: {
        id: v.id("releases"),
        data: v.object(releaseArgs),
    },
    handler: async (ctx, { id, data }) => {
        // 1. Update Release
        await ctx.db.patch("releases", id, {
            version: data.version || "latest",
            installer_type: data.type,
            uninstall_previous: data.uninstall_previous,
            ...(data.disabled !== undefined
                ? { disabled_at: data.disabled ? Date.now() : undefined }
                : {}),
        });

        // 2. Clear old data (simplified update strategy: delete & recreate children)
        // Win32/Winget
        const win32 = await ctx.db.query("win32_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of win32) await ctx.db.delete("win32_releases", r._id);
        const winget = await ctx.db.query("winget_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of winget) await ctx.db.delete("winget_releases", r._id);

        // Requirements
        const reqs = await ctx.db.query("release_requirements").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of reqs) await ctx.db.delete("release_requirements", r._id);

        // Detections
        const dets = await ctx.db.query("detection_rules").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const d of dets) await ctx.db.delete("detection_rules", d._id);

        // Scripts
        const scripts = await ctx.db.query("release_scripts").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const s of scripts) await ctx.db.delete("release_scripts", s._id);

        // Assignments
        const groupRels = await ctx.db.query("computer_group_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of groupRels) await ctx.db.delete("computer_group_releases", r._id);
        const dynGroupRels = await ctx.db.query("dynamic_group_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of dynGroupRels) await ctx.db.delete("dynamic_group_releases", r._id);


        // 3. Re-create Specific Release Info
        if (data.type === "win32") {
            const oldWin32 = win32[0];
            const hasBinary = !!data.installBinary;

            if (!hasBinary && !oldWin32) throw new Error("Install binary required for win32");

            await ctx.db.insert("win32_releases", {
                release_id: id,
                installer_name: hasBinary ? data.installBinary!.name : oldWin32.installer_name,
                install_binary_storage_id: hasBinary ? data.installBinary!.storageId : oldWin32.install_binary_storage_id,
                hash: hasBinary ? data.installBinary!.hash : oldWin32.hash,
                install_script: data.installScript !== undefined ? data.installScript : (oldWin32?.install_script || ""),
                uninstall_script: data.uninstallScript !== undefined ? data.uninstallScript : (oldWin32?.uninstall_script || ""),
                install_binary_size: hasBinary ? data.installBinary!.size : oldWin32.install_binary_size,
            });
        } else {
            const oldWinget = winget[0];
            if (!data.wingetId && !oldWinget) throw new Error("Winget ID required");

            await ctx.db.insert("winget_releases", {
                release_id: id,
                winget_id: data.wingetId || oldWinget.winget_id,
            });
        }

        // 4. Re-create Requirements
        if (data.requirements && data.requirements.requirementScriptBinary) {
            await ctx.db.insert("release_requirements", {
                release_id: id,
                script_name: data.requirements.requirementScriptBinary.name,
                timeout_seconds: data.requirements.timeout || 60,
                run_as_system: data.requirements.runAsSystem || false,
                storage_id: data.requirements.requirementScriptBinary.storageId,
                hash: data.requirements.requirementScriptBinary.hash,
                byte_size: data.requirements.requirementScriptBinary.size,
            });
        }

        // 5. Re-create Detections
        for (const d of data.detections) {
            const isFile = d.type === "file";
            await ctx.db.insert("detection_rules", {
                release_id: id,
                type: d.type,
                config: {
                    "version": "1",
                    "operator": isFile ? d.fileType : d.registryType,
                    "path": isFile ? d.path : d.registryKey,
                    "value": isFile ? d.fileTypeValue : d.registryTypeValue,
                },
            });
        }

        // 6. Re-create Pre/Post Scripts
        if (data.preScript && data.preScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: id,
                phase: "pre",
                engine: data.preScript.engine || "powershell",
                timeout_seconds: data.preScript.timeout || 60,
                run_as_system: data.preScript.runAsSystem || false,
                script_name: data.preScript.scriptBinary.name,
                storage_id: data.preScript.scriptBinary.storageId,
                hash: data.preScript.scriptBinary.hash,
                byte_size: data.preScript.scriptBinary.size,
            });
        }

        if (data.postScript && data.postScript.scriptBinary) {
            await ctx.db.insert("release_scripts", {
                release_id: id,
                phase: "post",
                engine: data.postScript.engine || "powershell",
                timeout_seconds: data.postScript.timeout || 60,
                run_as_system: data.postScript.runAsSystem || false,
                script_name: data.postScript.scriptBinary.name,
                storage_id: data.postScript.scriptBinary.storageId,
                hash: data.postScript.scriptBinary.hash,
                byte_size: data.postScript.scriptBinary.size,
            });
        }

        // 7. Re-create Assignments
        const handleAssignment = async (groups: typeof data.assignments.installGroups, action: "install" | "uninstall") => {
            for (const g of groups) {
                if (g.groupType === "static") {
                    await ctx.db.insert("computer_group_releases", {
                        release_id: id,
                        group_id: g.groupId as Id<"computer_groups">,
                        assign_type: g.mode,
                        action: action,
                    });
                } else {
                    await ctx.db.insert("dynamic_group_releases", {
                        release_id: id,
                        group_id: g.groupId as Id<"dynamic_computer_groups">,
                        assign_type: g.mode,
                        action: action,
                    });
                }
            }
        };

        await handleAssignment(data.assignments.installGroups, "install");
        await handleAssignment(data.assignments.uninstallGroups, "uninstall");

        return { success: true };
    },
});