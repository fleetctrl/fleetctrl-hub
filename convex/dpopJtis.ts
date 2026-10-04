/**
 * DPoP anti-replay store.
 *
 * Each proof's jti may be used once per key until the proof itself would be
 * rejected as stale. Stored in the database (not memory) so it holds across
 * Convex isolates and restarts.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./functions";

const CLEANUP_BATCH = 1000;

/**
 * Records a proof's jti. Returns false if it was already used (a replay).
 */
export const consume = internalMutation({
    args: {
        jkt: v.string(),
        jti: v.string(),
        expiresAt: v.number(),
    },
    returns: v.boolean(),
    handler: async (ctx, { jkt, jti, expiresAt }) => {
        const existing = await ctx.db
            .query("dpop_jtis")
            .withIndex("by_jkt_and_jti", (q) => q.eq("jkt", jkt).eq("jti", jti))
            .unique();
        if (existing) {
            return false;
        }

        await ctx.db.insert("dpop_jtis", { jkt, jti, expires_at: expiresAt });
        return true;
    },
});

export const cleanupExpired = internalMutation({
    args: {},
    handler: async (ctx) => {
        const expired = await ctx.db
            .query("dpop_jtis")
            .withIndex("by_expires_at", (q) => q.lt("expires_at", Date.now()))
            .take(CLEANUP_BATCH);

        for (const row of expired) {
            await ctx.db.delete("dpop_jtis", row._id);
        }

        if (expired.length === CLEANUP_BATCH) {
            await ctx.scheduler.runAfter(0, internal.dpopJtis.cleanupExpired, {});
        }

        return { deleted: expired.length };
    },
});
