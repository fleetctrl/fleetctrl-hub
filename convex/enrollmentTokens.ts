/**
 * Enrollment Tokens Module
 *
 * Handles enrollment token (keys) management for admin.
 */


import { v } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { arrayBufferToBase64Url } from "./lib/encoding";

// ========================================
// Public Queries
// ========================================

/**
 * List all enrollment tokens.
 */
export const list = withAuthQuery({
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
export const create = withAuthMutation({
    args: {
        name: v.optional(v.string()),
        remainingUses: v.number(), // -1 = unlimited
        expiresAt: v.optional(v.number()),
    },
    handler: async (ctx, { name, remainingUses, expiresAt }) => {
        // Generate random token
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = arrayBufferToBase64Url(bytes);

        // Hash the token for storage
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const tokenHash = arrayBufferToBase64Url(hashBuffer);

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
export const disable = withAuthMutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch("enrollment_tokens", id, { disabled: true });
        return { success: true };
    },
});

/**
 * Enable an enrollment token.
 */
export const enable = withAuthMutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.patch("enrollment_tokens", id, { disabled: false });
        return { success: true };
    },
});

/**
 * Delete an enrollment token.
 */
export const remove = withAuthMutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, { id }) => {
        await ctx.db.delete("enrollment_tokens", id);
        return { success: true };
    },
});
