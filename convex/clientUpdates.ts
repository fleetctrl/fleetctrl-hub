import { v } from "convex/values";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";


export const getAll = withAuthQuery({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("client_updates").collect();
    },
});

export const create = withAuthMutation({
    args: {
        version: v.string(),
        storageId: v.id("_storage"),
        hash: v.string(),
        byte_size: v.number(),
        file_name: v.optional(v.string()),
        mime_type: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check if version already exists
        const existing = await ctx.db
            .query("client_updates")
            .withIndex("by_version", (q) => q.eq("version", args.version))
            .first();

        if (existing) {
            throw new Error(`Version ${args.version} already exists`);
        }

        // Set all other versions to inactive if this is a new version being uploaded
        // (Optional: usually explicit activation is safer, but mirroring original logic if any)
        // Original logic seemed to rely on Supabase trigger or simple insert.
        // We will just insert it as inactive by default unless logic mandates otherwise.
        // The original SQL migration sets `is_active` to false by default.

        const id = await ctx.db.insert("client_updates", {
            version: args.version,
            storage_id: args.storageId, // Using storageId as path reference
            hash: args.hash,
            byte_size: args.byte_size,
            file_name: args.file_name,
            mime_type: args.mime_type,
            notes: args.notes,
            is_active: false, // Default to inactive
        });
        return id;
    },
});

export const generateUploadUrl = withAuthMutation({
    args: {},
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});

export const setActive = withAuthMutation({
    args: { id: v.id("client_updates") },
    handler: async (ctx, args) => {
        const update = await ctx.db.get("client_updates", args.id);
        if (!update) throw new Error("Update not found");

        const activeUpdates = await ctx.db
            .query("client_updates")
            .withIndex("by_is_active", (q) => q.eq("is_active", true))
            .collect();

        for (const activeUpdate of activeUpdates) {
            if (activeUpdate._id !== args.id) {
                await ctx.db.patch("client_updates", activeUpdate._id, {
                    is_active: false,
                });
            }
        }

        await ctx.db.patch("client_updates", args.id, { is_active: true });
    },
});

export const deactivate = withAuthMutation({
    args: { id: v.id("client_updates") },
    handler: async (ctx, args) => {
        await ctx.db.patch("client_updates", args.id, { is_active: false });
    },
});

export const remove = withAuthMutation({
    args: { id: v.id("client_updates") },
    handler: async (ctx, args) => {
        const update = await ctx.db.get("client_updates", args.id);
        if (!update) throw new Error("Update not found");

        // Remove file from storage
        await ctx.storage.delete(update.storage_id);

        await ctx.db.delete("client_updates", args.id);
    }
});
