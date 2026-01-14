/**
 * Enrollment Tokens Module
 *
 * Handles enrollment token (keys) management for admin.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ========================================
// Public Queries
// ========================================

/**
 * List all enrollment tokens.
 */
export const list = query({
    handler: async (ctx) => {
        const tokens = await ctx.db.query("enrollment_tokens").collect();

        return tokens.map((t) => ({
            id: t._id,
            name: t.name,
            tokenFragment: t.token_fragment,
            remainingUses: t.remaining_uses,
            disabled: t.disabled,
            expiresAt: t.expires_at,
            lastUsedAt: t.last_used_at,
            createdAt: t._creationTime,
        }));
    },
});

// ========================================
// Public Mutations
// ========================================

/**
 * Create a new enrollment token.
 */
export const create = mutation({
    args: {
        name: v.optional(v.string()),
        remainingUses: v.number(), // -1 = unlimited
        expiresAt: v.optional(v.number()),
    },
    handler: async (ctx, { name, remainingUses, expiresAt }) => {
        // Generate random token
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = Buffer.from(bytes).toString("base64url");

        // Hash the token for storage
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const tokenHash = Buffer.from(hashBuffer).toString("base64url");

        // Token fragment (first 8 chars for display)
        const tokenFragment = token.slice(0, 8);

        const id = await ctx.db.insert("enrollment_tokens", {
            token_hash: tokenHash,
            name,
            token_fragment: tokenFragment,
            remaining_uses: remainingUses,
            disabled: false,
            expires_at: expiresAt,
        });

        // Return the raw token ONLY on creation
        return {
            id,
            token,
            tokenFragment,
        };
    },
});

/**
 * Disable an enrollment token.
 */
export const disable = mutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch(id, { disabled: true });
        return { success: true };
    },
});

/**
 * Enable an enrollment token.
 */
export const enable = mutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch(id, { disabled: false });
        return { success: true };
    },
});

/**
 * Delete an enrollment token.
 */
export const remove = mutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.delete(id);
        return { success: true };
    },
});
