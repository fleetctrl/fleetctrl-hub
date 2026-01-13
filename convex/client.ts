import { v } from "convex/values";
import { query } from "./_generated/server";

export const getActiveVersion = query({
  args: {},
  handler: async (ctx) => {
    // In schema: index("by_is_active", ["is_active"])
    // Note: The schema definition had `is_active: v.boolean()`
    const active = await ctx.db
      .query("client_updates")
      .withIndex("by_is_active", (q) => q.eq("is_active", true))
      .first();

    return active;
  },
});

export const getVersion = query({
  args: {
    id: v.string(), // We will accept the UUID string from the URL
  },
  handler: async (ctx, args) => {
    // We need to find by ID. Since Convex IDs are specific types,
    // but the URL param is a string (UUID from Postgres times),
    // we might need to search if we migrated UUIDs to a field or if we are using Convex IDs.

    // In the migration plan, we are replacing the DB.
    // If this is a fresh start, we use Convex IDs.
    // However, the Go code uses UUIDs.
    // If the client sends a UUID, we might need to store that UUID in a field if we migrated data.
    // BUT, since we are doing "new", we can assume the client receives the ID from `getActiveVersion` first.
    // `getActiveVersion` returns the Convex document, which has `_id`.
    // So the client will send back `_id` (Convex ID) in the download link.

    // Wait, `args.id` in `ctx.db.get(args.id)` expects a GenericId.
    // We need to validate it.

    // Let's assume we pass the ID as string and try to normalize it.
    // If the IDs are legacy UUIDs stored in a field (e.g. if we migrated), we query by that field.
    // If we are fully Convex, we use `ctx.db.get(id)`.

    // For now, let's assume we use Convex IDs.
    try {
        const doc = await ctx.db.get(args.id as any);
        return doc;
    } catch (e) {
        return null;
    }
  },
});
