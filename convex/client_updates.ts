import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getAll = query({
    handler: async (ctx) => {
        return await ctx.db.query("client_updates").collect();
    },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    version: v.string(),
    storageId: v.id("_storage"),
    hash: v.string(),
    byte_size: v.number(), // Changed to number as byte_size from schema is v.int64() but File.size is number.
                          // However, schema definition says `v.int64()`.
                          // JavaScript `number` is safely integer up to 2^53.
                          // Convex `v.number()` is float64.
                          // If schema expects `v.int64()`, we must pass BigInt.
                          // Let's check schema.ts -> `byte_size: v.int64()`.
                          // So we need to pass BigInt(size).
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if version exists
    const existing = await ctx.db
        .query("client_updates")
        .withIndex("by_version", (q) => q.eq("version", args.version))
        .first();

    if (existing) {
        throw new Error("Version already exists");
    }

    // We assume the file is already uploaded to storageId.
    // In Convex, we don't need `storage_path` as string path like 'client-updates/v1/file.exe',
    // we just need the storage ID.
    // However, the DB schema I wrote has `storage_path: v.string()`.
    // I should store the storageId in there.
    // Also `storage_bucket` was hardcoded to 'internal' in SQL. Here just store "convex".

    await ctx.db.insert("client_updates", {
        version: args.version,
        storage_path: args.storageId,
        storage_bucket: "convex", // placeholder
        hash: args.hash,
        byte_size: BigInt(args.byte_size), // Convert number to BigInt
        is_active: false,
        created_at: new Date().toISOString(),
        notes: args.notes,
    });
  },
});

export const setActive = mutation({
    args: { id: v.id("client_updates") },
    handler: async (ctx, args) => {
        // Deactivate all
        const active = await ctx.db
            .query("client_updates")
            .withIndex("by_is_active", (q) => q.eq("is_active", true))
            .collect();

        for (const doc of active) {
            await ctx.db.patch(doc._id, { is_active: false });
        }

        // Activate target
        await ctx.db.patch(args.id, { is_active: true });
    }
});

export const deleteVersion = mutation({
    args: { id: v.id("client_updates") },
    handler: async (ctx, args) => {
        const doc = await ctx.db.get(args.id);
        if (!doc) return;

        // Delete from storage (if we stored storageId in storage_path)
        // Note: Schema says `storage_path` is string.
        await ctx.storage.delete(doc.storage_path as any);

        await ctx.db.delete(args.id);
    }
});
