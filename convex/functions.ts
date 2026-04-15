
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";


import type { DataModel, Id } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { installStatusAggregate } from "./lib/aggregate/installAggregate";

// start using Triggers, with table types from schema.ts
const triggers = new Triggers<DataModel>();

// Keep computer the aggregate count in sync
triggers.register("computers", async (ctx, change) => {
    if (change.operation === "insert") {
        await computerCountAggregate.insert(ctx, {
            namespace: null,
            key: change.id.toString(),
            id: change.id.toString(),
        });
    } else if (change.operation === "delete") {
        await computerCountAggregate.delete(ctx, {
            namespace: null,
            key: change.id.toString(),
            id: change.id.toString(),
        });
    }
});

// Keep install status aggregate counts in sync per (app, status)
triggers.register("computer_apps_installs", async (ctx, change) => {
    let newAppId: Id<"apps"> | undefined;
    let oldAppId: Id<"apps"> | undefined;
    switch (change.operation) {
        case "insert":
            newAppId = change.newDoc.app_id;
            if (!newAppId) {
                return;
            }

            await installStatusAggregate.insert(ctx, {
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

            await installStatusAggregate.delete(ctx, {
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
                await installStatusAggregate.delete(ctx, {
                    namespace: [newAppId, oldStatus],
                    key: null,
                    id: change.id.toString(),
                });
            }

            await installStatusAggregate.insert(ctx, {
                namespace: [newAppId, newStatus],
                key: null,
                id: change.id.toString(),
            });
            break;
        default:
            return; // ignore other operations
    }
});

triggers.register("releases", async (ctx, change) => {
    switch (change.operation) {
        case "delete": {
            console.log(`Release ${change.oldDoc._id} deleted, cleaning up related aggregates...`);
            // Clean up counter aggregates
            const releaseId = change.oldDoc._id;
            const appId = change.oldDoc.app_id;
            if (appId) {
                const installs = await ctx.db
                    .query("computer_apps_installs")
                    .withIndex("by_release_id", (q) => q.eq("release_id", releaseId))
                    .collect();

                for (const install of installs) {
                    await ctx.db.delete("computer_apps_installs", install._id);
                }
            }
        }
    }
});


// create wrappers that replace the built-in `mutation` and `internalMutation`
// the wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));