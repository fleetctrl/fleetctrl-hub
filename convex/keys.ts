import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { hashToken } from "./lib/auth";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("enrollment_tokens").collect();
  },
});

export const create = mutation({
  args: {
    name: v.optional(v.string()),
    remainingUses: v.number(), // Input as number, store as int64
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate token
    const token = crypto.randomUUID();
    const tokenHash = await hashToken(token);

    // Store in DB
    await ctx.db.insert("enrollment_tokens", {
        name: args.name,
        token_hash: tokenHash,
        token_fragment: token.substring(0, 8) + "...", // Optional: store fragment for UI
        remaining_uses: BigInt(args.remainingUses),
        expires_at: args.expiresAt,
        created_at: new Date().toISOString(),
        disabled: false,
    });

    // Return the raw token ONLY ONCE
    return token;
  },
});

export const deleteKey = mutation({
    args: { id: v.id("enrollment_tokens") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
    }
});
