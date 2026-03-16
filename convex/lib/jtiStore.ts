/**
 * JTI (JWT ID) Store for DPoP Anti-Replay Protection
 *
 * Replaces Redis-based JTI tracking from the Go implementation.
 * Stores used JTI values to prevent replay attacks.
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// Keep maintenance reads intentionally small in Convex and let the scheduler
// drain large backlogs over many short mutations.
const CLEANUP_BATCH_SIZE = 64;

/**
 * Checks if JTI has been used and stores it for replay prevention.
 * This is called during DPoP validation to ensure each proof is used only once.
 *
 * @throws Error if JTI already exists (replay attack detected)
 */
export const checkAndStore = internalMutation({
    args: { jti: v.string() },
    handler: async (ctx, { jti }) => {
        // Check if JTI already exists
        const existing = await ctx.db
            .query("used_jtis")
            .withIndex("by_jti", (q) => q.eq("jti", jti))
            .first();

        if (existing) {
            throw new Error("Replayed DPoP proof");
        }

        // Store JTI
        await ctx.db.insert("used_jtis", { jti });
        return true;
    },
});

/**
 * Cleanup stale JTIs older than 15 minutes.
 * Called by cron job to prevent unbounded table growth.
 *
 * DPoP proofs have a 15-minute freshness window, so we can safely
 * delete JTIs older than that.
 */
export const cleanupStale = internalMutation({
    handler: async (ctx) => {
        const cutoff = Date.now() - 15 * 60 * 1000;
        const oldest = await ctx.db
            .query("used_jtis")
            .order("asc")
            .take(CLEANUP_BATCH_SIZE);

        const expired = oldest.filter((doc) => doc._creationTime < cutoff);

        for (const doc of expired) {
            await ctx.db.delete(doc._id);
        }

        const hasMore =
            oldest.length === CLEANUP_BATCH_SIZE &&
            expired.length === oldest.length;

        if (hasMore) {
            await ctx.scheduler.runAfter(0, internal.lib.jtiStore.cleanupStale);
        }

        console.log(
            `[JTI Cleanup] Deleted ${expired.length} stale JTIs${hasMore ? ", scheduling another pass" : ""}`
        );

        return {
            deleted: expired.length,
            hasMore,
        };
    },
});
