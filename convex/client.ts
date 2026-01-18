/**
 * Client Module
 *
 * Handles client update version queries and downloads.
 */

import { query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ========================================
// Public Queries
// ========================================

/**
 * Get the currently active client version.
 */
export const getActiveVersion = query({
    args: {},
    handler: async (ctx) => {
        const activeVersion = await ctx.db
            .query("client_updates")
            .withIndex("by_is_active", (q) => q.eq("is_active", true))
            .first();

        if (!activeVersion) {
            return null;
        }

        return {
            id: activeVersion._id,
            version: activeVersion.version,
            hash: activeVersion.hash,
        };
    },
});

/**
 * Get all client versions.
 */
export const list = query({
    handler: async (ctx) => {
        const versions = await ctx.db.query("client_updates").collect();

        return versions.map((v) => ({
            id: v._id,
            version: v.version,
            hash: v.hash,
            byteSize: v.byte_size,
            isActive: v.is_active,
            notes: v.notes,
            createdAt: v._creationTime,
        }));
    },
});

// ========================================
// Actions (for storage URL generation)
// ========================================

/**
 * Get download URL for a client version.
 */
export const getDownloadUrl = action({
    args: { versionId: v.string() },
    handler: async (ctx, { versionId }): Promise<string | null> => {
        // 1. Get version
        const version = await ctx.runQuery(internal.client.getVersionById, {
            versionId,
        });

        if (!version) {
            return null;
        }

        // 2. Generate signed URL
        const url = await ctx.storage.getUrl(version.storage_id as Id<"_storage">);

        return url;
    },
});

// ========================================
// Internal Queries (for actions)
// ========================================

export const getVersionById = internalQuery({
    args: { versionId: v.string() },
    handler: async (ctx, { versionId }) => {
        const versions = await ctx.db.query("client_updates").collect();
        return versions.find((v) => v._id.toString() === versionId) || null;
    },
});
