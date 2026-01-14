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
