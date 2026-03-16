/* eslint-disable no-restricted-imports */
import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";

/* eslint-enable no-restricted-imports */
import type { DataModel, Id } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { installStatusAggregate } from "./lib/aggregate/installAggregate";

// start using Triggers, with table types from schema.ts
const triggers = new Triggers<DataModel>();

async function getReleaseAppId(
    ctx: Parameters<typeof triggers.register<"computer_release_installs">>[1] extends (
        ctx: infer TCtx,
        change: never,
    ) => Promise<void>
        ? TCtx
        : never,
    releaseId: Id<"releases">
) {
    const release = await ctx.innerDb.get(releaseId);
    return release?.app_id ?? null;
}

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
triggers.register("computer_release_installs", async (ctx, change) => {
    if (change.operation === "insert") {
        const appId = await getReleaseAppId(ctx, change.newDoc.release_id);
        if (!appId) {
            return;
        }

        await installStatusAggregate.insert(ctx, {
            namespace: [appId, change.newDoc.status],
            key: null,
            id: change.id.toString(),
        });
        return;
    } else if (change.operation === "delete") {
        const appId = await getReleaseAppId(ctx, change.oldDoc.release_id);
        if (!appId) {
            return;
        }

        await installStatusAggregate.delete(ctx, {
            namespace: [appId, change.oldDoc.status],
            key: null,
            id: change.id.toString(),
        });
        return;
    } else if (change.operation === "update") {
        const oldAppId = await getReleaseAppId(ctx, change.oldDoc.release_id);
        const newAppId =
            change.oldDoc.release_id === change.newDoc.release_id
                ? oldAppId
                : await getReleaseAppId(ctx, change.newDoc.release_id);

        if (oldAppId === newAppId && change.oldDoc.status === change.newDoc.status) {
            return;
        }

        if (oldAppId && newAppId) {
            await installStatusAggregate.replaceOrInsert(
                ctx,
                {
                    namespace: [oldAppId, change.oldDoc.status],
                    key: null,
                    id: change.id.toString(),
                },
                {
                    namespace: [newAppId, change.newDoc.status],
                    key: null,
                }
            );
            return;
        }

        if (oldAppId) {
            await installStatusAggregate.delete(ctx, {
                namespace: [oldAppId, change.oldDoc.status],
                key: null,
                id: change.id.toString(),
            });
            return;
        }

        if (newAppId) {
            await installStatusAggregate.insert(ctx, {
                namespace: [newAppId, change.newDoc.status],
                key: null,
                id: change.id.toString(),
            });
        }
        return;

    }
});


// create wrappers that replace the built-in `mutation` and `internalMutation`
// the wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));