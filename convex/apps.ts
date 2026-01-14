/**
 * Apps Module
 *
 * Handles app and release queries for computers.
 */

import { query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ========================================
// Public Queries
// ========================================

/**
 * Get apps assigned to a computer through group memberships.
 */
export const getAssigned = query({
    args: { computerId: v.string() },
    handler: async (ctx, { computerId }) => {
        // 1. Get static group memberships
        const staticMemberships = await ctx.db
            .query("computer_group_members")
            .withIndex("by_computer_id")
            .collect();

        const staticGroupIds = staticMemberships
            .filter((m) => m.computer_id.toString() === computerId)
            .map((m) => m.group_id);

        // 2. Get dynamic group memberships
        const dynamicMemberships = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id")
            .collect();

        const dynamicGroupIds = dynamicMemberships
            .filter((m) => m.computer_id.toString() === computerId)
            .map((m) => m.group_id);

        if (staticGroupIds.length === 0 && dynamicGroupIds.length === 0) {
            return [];
        }

        // 3. Get releases for static groups
        const staticReleases = await ctx.db
            .query("computer_group_releases")
            .collect();

        const staticReleaseAssignments = staticReleases.filter((r) =>
            staticGroupIds.some((gid) => gid.toString() === r.group_id.toString())
        );

        // 4. Get releases for dynamic groups
        const dynamicReleases = await ctx.db
            .query("dynamic_group_releases")
            .collect();

        const dynamicReleaseAssignments = dynamicReleases.filter((r) =>
            dynamicGroupIds.some((gid) => gid.toString() === r.group_id.toString())
        );

        // 5. Combine and deduplicate release IDs
        const releaseAssignments = [
            ...staticReleaseAssignments,
            ...dynamicReleaseAssignments,
        ];

        if (releaseAssignments.length === 0) {
            return [];
        }

        // 6. Get release details
        const releaseIds = [
            ...new Set(releaseAssignments.map((r) => r.release_id.toString())),
        ];

        const allReleases = await ctx.db.query("releases").collect();
        const releases = allReleases.filter(
            (r) => releaseIds.includes(r._id.toString()) && !r.disabled_at
        );

        // 7. Build app map
        const appIds = [...new Set(releases.map((r) => r.app_id.toString()))];
        const allApps = await ctx.db.query("apps").collect();
        const apps = allApps.filter((a) => appIds.includes(a._id.toString()));

        // 8. Get additional release data
        const win32Releases = await ctx.db.query("win32_releases").collect();
        const wingetReleases = await ctx.db.query("winget_releases").collect();
        const detectionRules = await ctx.db.query("detection_rules").collect();
        const requirements = await ctx.db.query("release_requirements").collect();

        // 9. Build response
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
                    const assignment = releaseAssignments.find(
                        (ra) => ra.release_id.toString() === release._id.toString()
                    );

                    const win32 = win32Releases.find(
                        (w) => w.release_id.toString() === release._id.toString()
                    );

                    const winget = wingetReleases.find(
                        (w) => w.release_id.toString() === release._id.toString()
                    );

                    const rules = detectionRules.filter(
                        (d) => d.release_id.toString() === release._id.toString()
                    );

                    const reqs = requirements.filter(
                        (r) => r.release_id.toString() === release._id.toString()
                    );

                    return {
                        id: release._id,
                        version: release.version,
                        assign_type: assignment?.assign_type || "include",
                        action: assignment?.action || "install",
                        installer_type: release.installer_type,
                        uninstall_previous: release.uninstall_previous,
                        win32: win32
                            ? {
                                install_binary_path: win32.install_binary_storage_id,
                                hash: win32.hash,
                                install_script: win32.install_script,
                                uninstall_script: win32.uninstall_script,
                                install_binary_size: win32.install_binary_size,
                            }
                            : null,
                        winget: winget
                            ? {
                                winget_id: winget.winget_id,
                            }
                            : null,
                        detection_rules: rules.map((r) => ({
                            type: r.type,
                            config: r.config,
                        })),
                        requirements: reqs.map((r) => ({
                            id: r._id,
                            timeout_seconds: r.timeout_seconds,
                            run_as_system: r.run_as_system,
                            hash: r.hash,
                        })),
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
export const getDownloadUrl = action({
    args: {
        computerId: v.string(),
        releaseId: v.string(),
    },
    handler: async (ctx, { computerId, releaseId }): Promise<string | null> => {
        // 1. Verify assignment (simplified - in production, check group membership)
        const release = await ctx.runQuery(internal.apps.getReleaseById, {
            releaseId,
        });

        if (!release) {
            return null;
        }

        // 2. Get win32 release data
        const win32 = await ctx.runQuery(internal.apps.getWin32Release, {
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
export const getRequirementDownloadUrl = action({
    args: {
        computerId: v.string(),
        requirementId: v.string(),
    },
    handler: async (ctx, { requirementId }): Promise<string | null> => {
        // 1. Get requirement
        const requirement = await ctx.runQuery(internal.apps.getRequirementById, {
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

// ========================================
// Internal Queries (for actions)
// ========================================

export const getReleaseById = internalQuery({
    args: { releaseId: v.string() },
    handler: async (ctx, { releaseId }) => {
        const releases = await ctx.db.query("releases").collect();
        return releases.find((r) => r._id.toString() === releaseId) || null;
    },
});

export const getWin32Release = internalQuery({
    args: { releaseId: v.string() },
    handler: async (ctx, { releaseId }) => {
        const win32Releases = await ctx.db.query("win32_releases").collect();
        return (
            win32Releases.find((w) => w.release_id.toString() === releaseId) || null
        );
    },
});

export const getRequirementById = internalQuery({
    args: { requirementId: v.string() },
    handler: async (ctx, { requirementId }) => {
        const requirements = await ctx.db.query("release_requirements").collect();
        return requirements.find((r) => r._id.toString() === requirementId) || null;
    },
});

// ========================================
// Admin Queries
// ========================================

import { mutation } from "./_generated/server";

/**
 * Get table data for admin UI.
 */
export const getTableData = query({
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
                        const group = await ctx.db.get(assignment.group_id);
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
                        const group = await ctx.db.get(assignment.group_id);
                        if (group) {
                            groups.push({ id: group._id, name: group.display_name });
                        }
                    }
                }

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
                };
            })
        );
    },
});

/**
 * Get app by ID for admin.
 */
export const getById = query({
    args: { id: v.id("apps") },
    handler: async (ctx, { id }) => {
        const app = await ctx.db.get(id);
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
export const remove = mutation({
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
                await ctx.db.delete(a._id);
            }

            const dynamicAssignments = await ctx.db
                .query("dynamic_group_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();

            for (const a of dynamicAssignments) {
                await ctx.db.delete(a._id);
            }

            // Delete detection rules
            const detections = await ctx.db
                .query("detection_rules")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();

            for (const d of detections) {
                await ctx.db.delete(d._id);
            }

            // Delete release
            await ctx.db.delete(release._id);
        }

        // Delete the app
        await ctx.db.delete(id);

        return { success: true };
    },
});

/**
 * Update app details.
 */
export const update = mutation({
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
            await ctx.db.patch(id, updates);
        }

        return { success: true };
    },
});

/**
 * Get releases for an app.
 */
export const getReleases = query({
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
                        const group = await ctx.db.get(a.group_id);
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
                        const group = await ctx.db.get(a.group_id);
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
                };
            })
        );
    },
});

/**
 * Delete a release.
 */
export const deleteRelease = mutation({
    args: { id: v.id("releases") },
    handler: async (ctx, { id }) => {
        // Delete release assignments
        const staticAssignments = await ctx.db
            .query("computer_group_releases")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const a of staticAssignments) {
            await ctx.db.delete(a._id);
        }

        const dynamicAssignments = await ctx.db
            .query("dynamic_group_releases")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const a of dynamicAssignments) {
            await ctx.db.delete(a._id);
        }

        // Delete detection rules
        const detections = await ctx.db
            .query("detection_rules")
            .withIndex("by_release_id", (q) => q.eq("release_id", id))
            .collect();

        for (const d of detections) {
            await ctx.db.delete(d._id);
        }

        // Delete the release
        await ctx.db.delete(id);

        return { success: true };
    },
});

/**
 * Generate an upload URL for app binaries.
 */
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Create a new application and its initial release.
 */
export const create = mutation({
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
                timeout_seconds: args.requirement.timeout || 60,
                run_as_system: args.requirement.runAsSystem || false,
                storage_id: args.requirement.requirementScriptBinary.storageId,
                hash: args.requirement.requirementScriptBinary.hash,
                byte_size: args.requirement.requirementScriptBinary.size,
            });
        }

        // 5. Create Detections
        for (const d of args.detection.detections) {
            await ctx.db.insert("detection_rules", {
                release_id: releaseId,
                type: d.type,
                config: d,
            });
        }

        // 6. Assignments
        const handleAssignment = async (groups: typeof args.assignment.installGroups, action: "install" | "uninstall") => {
            for (const g of groups) {
                if (g.groupType === "static") {
                    await ctx.db.insert("computer_group_releases", {
                        release_id: releaseId,
                        group_id: g.groupId as Id<"computer_groups">,
                        assign_type: g.mode,
                        action: action,
                    });
                } else {
                    await ctx.db.insert("dynamic_group_releases", {
                        release_id: releaseId,
                        group_id: g.groupId as Id<"dynamic_computer_groups">,
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
    detections: v.array(v.object({
        type: v.union(v.literal("file"), v.literal("registry")),
        path: v.string(),
        fileType: v.optional(v.string()),
        fileTypeValue: v.optional(v.string()),
        registryKey: v.optional(v.string()),
        registryType: v.optional(v.string()),
        registryTypeValue: v.optional(v.string()),
    })),
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

export const createRelease = mutation({
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
                timeout_seconds: args.requirements.timeout || 60,
                run_as_system: args.requirements.runAsSystem || false,
                storage_id: args.requirements.requirementScriptBinary.storageId,
                hash: args.requirements.requirementScriptBinary.hash,
                byte_size: args.requirements.requirementScriptBinary.size,
            });
        }

        // 4. Detections
        for (const d of args.detections) {
            await ctx.db.insert("detection_rules", {
                release_id: releaseId,
                type: d.type,
                config: d,
            });
        }

        // 5. Assignments
        const handleAssignment = async (groups: typeof args.assignments.installGroups, action: "install" | "uninstall") => {
            for (const g of groups) {
                if (g.groupType === "static") {
                    await ctx.db.insert("computer_group_releases", {
                        release_id: releaseId,
                        group_id: g.groupId as Id<"computer_groups">,
                        assign_type: g.mode,
                        action: action,
                    });
                } else {
                    await ctx.db.insert("dynamic_group_releases", {
                        release_id: releaseId,
                        group_id: g.groupId as Id<"dynamic_computer_groups">,
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

export const updateRelease = mutation({
    args: {
        id: v.id("releases"),
        data: v.object(releaseArgs),
    },
    handler: async (ctx, { id, data }) => {
        // 1. Update Release
        await ctx.db.patch(id, {
            version: data.version || "latest",
            installer_type: data.type,
            uninstall_previous: data.uninstall_previous,
            ...(data.disabled !== undefined ? { disabled_at: data.disabled ? Date.now() : 0 } : {}),
        });

        // 2. Clear old data (simplified update strategy: delete & recreate children)
        // Win32/Winget
        const win32 = await ctx.db.query("win32_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of win32) await ctx.db.delete(r._id);
        const winget = await ctx.db.query("winget_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of winget) await ctx.db.delete(r._id);

        // Requirements
        const reqs = await ctx.db.query("release_requirements").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of reqs) await ctx.db.delete(r._id);

        // Detections
        const dets = await ctx.db.query("detection_rules").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const d of dets) await ctx.db.delete(d._id);

        // Assignments
        const groupRels = await ctx.db.query("computer_group_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of groupRels) await ctx.db.delete(r._id);
        const dynGroupRels = await ctx.db.query("dynamic_group_releases").withIndex("by_release_id", q => q.eq("release_id", id)).collect();
        for (const r of dynGroupRels) await ctx.db.delete(r._id);


        // 3. Re-create Specific Release Info
        if (data.type === "win32") {
            const oldWin32 = win32[0];
            const hasBinary = !!data.installBinary;

            if (!hasBinary && !oldWin32) throw new Error("Install binary required for win32");

            await ctx.db.insert("win32_releases", {
                release_id: id,
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
                timeout_seconds: data.requirements.timeout || 60,
                run_as_system: data.requirements.runAsSystem || false,
                storage_id: data.requirements.requirementScriptBinary.storageId,
                hash: data.requirements.requirementScriptBinary.hash,
                byte_size: data.requirements.requirementScriptBinary.size,
            });
        }

        // 5. Re-create Detections
        for (const d of data.detections) {
            await ctx.db.insert("detection_rules", {
                release_id: id,
                type: d.type,
                config: d,
            });
        }

        // 6. Re-create Assignments
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
