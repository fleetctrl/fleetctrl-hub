
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";


import type { DataModel, Id } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { installStatusAggregate } from "./lib/aggregate/installAggregate";
import { computerSearchText } from "./lib/tableKeys";

// start using Triggers, with table types from schema.ts
const triggers = new Triggers<DataModel>();

// Keep computer the aggregate count in sync.
// Use idempotent variants so a drifted/missing aggregate entry
// can never break computer insert/delete (seen in production).
triggers.register("computers", async (ctx, change) => {
    if (change.operation === "insert") {
        await computerCountAggregate.insertIfDoesNotExist(ctx, {
            namespace: null,
            key: change.id.toString(),
            id: change.id.toString(),
        });
    } else if (change.operation === "delete") {
        await computerCountAggregate.deleteIfExists(ctx, {
            namespace: null,
            key: change.id.toString(),
            id: change.id.toString(),
        });
    }
});

// Delete all records owned by a computer. Using ctx.db (rather than innerDb)
// ensures triggers registered on child tables are also run.
triggers.register("computers", async (ctx, change) => {
    if (change.operation !== "delete") {
        return;
    }

    for await (const token of ctx.db
        .query("refresh_tokens")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", change.id))) {
        await ctx.db.delete("refresh_tokens", token._id);
    }

    for await (const task of ctx.db
        .query("tasks")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", change.id))) {
        await ctx.db.delete("tasks", task._id);
    }

    for await (const membership of ctx.db
        .query("computer_group_members")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", change.id))) {
        await ctx.db.delete("computer_group_members", membership._id);
    }

    for await (const membership of ctx.db
        .query("dynamic_group_members")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", change.id))) {
        await ctx.db.delete("dynamic_group_members", membership._id);
    }

    for await (const install of ctx.db
        .query("computer_apps_installs")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", change.id))) {
        await ctx.db.delete("computer_apps_installs", install._id);
    }
});

// Keep the full-text search field derived from the source fields.
triggers.register("computers", async (ctx, change) => {
    if (change.operation === "delete") {
        return;
    }

    const searchText = computerSearchText(
        change.newDoc.name,
        change.newDoc.login_user,
    );

    if (change.newDoc.search_text !== searchText) {
        await ctx.innerDb.patch("computers", change.id, {
            search_text: searchText,
        });
    }
});

// Keep install status aggregate counts in sync per (app, status).
// Use idempotent variants so a drifted/missing aggregate entry
// can never break install writes or computer deletion.
triggers.register("computer_apps_installs", async (ctx, change) => {
    let newAppId: Id<"apps"> | undefined;
    let oldAppId: Id<"apps"> | undefined;
    switch (change.operation) {
        case "insert":
            newAppId = change.newDoc.app_id;
            if (!newAppId) {
                return;
            }

            await installStatusAggregate.insertIfDoesNotExist(ctx, {
                namespace: [newAppId, change.newDoc.status],
                key: null,
                id: change.id.toString(),
            });
            break;
        case "delete":
            oldAppId = change.oldDoc.app_id;
            if (!oldAppId) {
                return;
            }

            await installStatusAggregate.deleteIfExists(ctx, {
                namespace: [oldAppId, change.oldDoc.status],
                key: null,
                id: change.id.toString(),
            });
            break;
        case "update":
            newAppId = change.newDoc.app_id;
            if (!newAppId) {
                return;
            }

            // If the app_id or status changed, update the aggregate counts
            const oldStatus = change.oldDoc.status;
            const newStatus = change.newDoc.status;

            if (oldStatus === newStatus) {
                // No relevant changes
                return;
            }

            const existingDoc = await ctx.db.get("computer_apps_installs", change.id);
            if (existingDoc) {
                await installStatusAggregate.deleteIfExists(ctx, {
                    namespace: [newAppId, oldStatus],
                    key: null,
                    id: change.id.toString(),
                });
            }

            await installStatusAggregate.insertIfDoesNotExist(ctx, {
                namespace: [newAppId, newStatus],
                key: null,
                id: change.id.toString(),
            });
            break;
        default:
            return; // ignore other operations
    }
});

triggers.register("computer_groups", async (ctx, change) => {
    if (change.operation !== "delete") {
        return;
    }

    for await (const membership of ctx.db
        .query("computer_group_members")
        .withIndex("by_group_id", (q) => q.eq("group_id", change.id))) {
        await ctx.db.delete("computer_group_members", membership._id);
    }

    for await (const assignment of ctx.db
        .query("computer_group_releases")
        .withIndex("by_group_id", (q) => q.eq("group_id", change.id))) {
        await ctx.db.delete("computer_group_releases", assignment._id);
    }
});

triggers.register("dynamic_computer_groups", async (ctx, change) => {
    if (change.operation !== "delete") {
        return;
    }

    for await (const membership of ctx.db
        .query("dynamic_group_members")
        .withIndex("by_group_id", (q) => q.eq("group_id", change.id))) {
        await ctx.db.delete("dynamic_group_members", membership._id);
    }

    for await (const assignment of ctx.db
        .query("dynamic_group_releases")
        .withIndex("by_group_id", (q) => q.eq("group_id", change.id))) {
        await ctx.db.delete("dynamic_group_releases", assignment._id);
    }
});

triggers.register("apps", async (ctx, change) => {
    if (change.operation !== "delete") {
        return;
    }

    for await (const release of ctx.db
        .query("releases")
        .withIndex("by_app_id", (q) => q.eq("app_id", change.id))) {
        await ctx.db.delete("releases", release._id);
    }

    for await (const install of ctx.db
        .query("computer_apps_installs")
        .withIndex("by_app_id", (q) => q.eq("app_id", change.id))) {
        await ctx.db.delete("computer_apps_installs", install._id);
    }
});

triggers.register("releases", async (ctx, change) => {
    if (change.operation !== "delete") {
        return;
    }

    const storageIds = new Set<Id<"_storage">>();

    for await (const release of ctx.db
        .query("win32_releases")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        storageIds.add(release.install_binary_storage_id);
        await ctx.db.delete("win32_releases", release._id);
    }

    for await (const release of ctx.db
        .query("winget_releases")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        await ctx.db.delete("winget_releases", release._id);
    }

    for await (const rule of ctx.db
        .query("detection_rules")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        await ctx.db.delete("detection_rules", rule._id);
    }

    for await (const requirement of ctx.db
        .query("release_requirements")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        storageIds.add(requirement.storage_id);
        await ctx.db.delete("release_requirements", requirement._id);
    }

    for await (const script of ctx.db
        .query("release_scripts")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        if (script.storage_id) {
            storageIds.add(script.storage_id);
        }
        await ctx.db.delete("release_scripts", script._id);
    }

    for await (const assignment of ctx.db
        .query("computer_group_releases")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        await ctx.db.delete("computer_group_releases", assignment._id);
    }

    for await (const assignment of ctx.db
        .query("dynamic_group_releases")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        await ctx.db.delete("dynamic_group_releases", assignment._id);
    }

    for await (const install of ctx.db
        .query("computer_apps_installs")
        .withIndex("by_release_id", (q) => q.eq("release_id", change.id))) {
        await ctx.db.delete("computer_apps_installs", install._id);
    }

    for (const storageId of storageIds) {
        const storedFile = await ctx.db.system.get("_storage", storageId);
        if (storedFile) {
            await ctx.storage.delete(storageId);
        }
    }
});


// create wrappers that replace the built-in `mutation` and `internalMutation`
// the wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
