import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { hashToken } from "./lib/auth";

export const enrollDevice = mutation({
  args: {
    enrollmentToken: v.string(), // raw token from header
    fingerprintHash: v.string(),
    name: v.string(),
    jkt: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Validate Enrollment Token
    const tokenHash = await hashToken(args.enrollmentToken);

    // Note: In schema we defined index "by_token_hash"
    const tokenDoc = await ctx.db
      .query("enrollment_tokens")
      .withIndex("by_token_hash", (q) => q.eq("token_hash", tokenHash))
      .first();

    if (!tokenDoc) {
      throw new Error("Invalid enrollment token");
    }

    if (tokenDoc.remaining_uses === BigInt(0) || tokenDoc.disabled) {
       throw new Error("Enrollment token is not valid or exhausted");
    }

    // 2. Decrement usage if not infinite (-1)
    // Note: In Go code it was -1 for infinite. In Schema we used int64.
    // Let's assume -1n is infinite.
    if (tokenDoc.remaining_uses !== BigInt(-1)) {
        const newRemaining = tokenDoc.remaining_uses - BigInt(1);
        await ctx.db.patch(tokenDoc._id, {
            remaining_uses: newRemaining < BigInt(0) ? BigInt(0) : newRemaining,
            last_used_at: new Date().toISOString(),
        });
    } else {
        // Just update last_used_at
        await ctx.db.patch(tokenDoc._id, {
            last_used_at: new Date().toISOString(),
        });
    }

    // 3. Find or Create Computer
    const existingComputer = await ctx.db
      .query("computers")
      .withIndex("by_fingerprint_hash", (q) => q.eq("fingerprint_hash", args.fingerprintHash))
      .first();

    let computerId;

    if (existingComputer) {
      await ctx.db.patch(existingComputer._id, {
        name: args.name,
        jkt: args.jkt,
        last_connection: new Date().toISOString(),
      });
      computerId = existingComputer._id;
    } else {
      computerId = await ctx.db.insert("computers", {
        name: args.name,
        fingerprint_hash: args.fingerprintHash,
        jkt: args.jkt,
        created_at: new Date().toISOString(),
        last_connection: new Date().toISOString(),
      });
    }

    return {
        computerId,
        // We return the raw ID, but the HTTP action will need to convert/use it
        // to generate tokens.
    };
  },
});
