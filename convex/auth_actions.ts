import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const storeRefreshToken = mutation({
  args: {
    jkt: v.string(),
    computerId: v.id("computers"),
    tokenHash: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("refresh_tokens", {
      jkt: args.jkt,
      computer_id: args.computerId,
      token_hash: args.tokenHash,
      expires_at: args.expiresAt,
      created_at: new Date().toISOString(),
      status: "ACTIVE",
    });
  },
});
