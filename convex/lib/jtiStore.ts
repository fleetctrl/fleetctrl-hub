/**
 * JTI (JWT ID) Store for DPoP Anti-Replay Protection
 *
 * Replaces Redis-based JTI tracking from the Go implementation.
 * Stores used JTI values to prevent replay attacks.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Checks if JTI has been used and stores it for replay prevention.
 * This is called during DPoP validation to ensure each proof is used only once.
 *
 * @throws Error if JTI already exists (replay attack detected)
 */
export const checkAndStore = mutation({
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
        const fifteenMinAgo = Date.now() - 15 * 60 * 1000;

        // Batch delete stale JTIs (process in chunks to avoid timeout)
        let deleted = 0;
        let hasMore = true;

        while (hasMore) {
            const stale = await ctx.db
                .query("used_jtis")
                .filter((q) => q.lt(q.field("_creationTime"), fifteenMinAgo))
                .take(100);

            if (stale.length === 0) {
                hasMore = false;
                break;
            }

            for (const doc of stale) {
                await ctx.db.delete(doc._id);
                deleted++;
            }

            // If we got less than 100, we're done
            if (stale.length < 100) {
                hasMore = false;
            }
        }

        console.log(`[JTI Cleanup] Deleted ${deleted} stale JTIs`);
        return { deleted };
    },
});
