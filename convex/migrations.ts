import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { installStatusAggregate, InstallStatus } from "./lib/aggregate/installAggregate";
import { computerCountAggregate } from "./lib/aggregate/computerCountAggregate";

export const migrations = new Migrations<DataModel>(components.migrations, {
    internalMutation,
    migrationsLocationPrefix: "migrations:",
});

export const backfillInstallStatusAggregate = migrations.define({
    table: "computer_release_installs",
    migrateOne: async (ctx, install) => {
        const release = await ctx.db.get(install.release_id);
        if (!release) {
            return;
        }

        await installStatusAggregate.insertIfDoesNotExist(ctx, {
            namespace: [release.app_id, install.status as InstallStatus],
            key: null,
            id: install._id.toString(),
        });
    },
});

export const backfillComputerCountAggregate = migrations.define({
    table: "computers",
    migrateOne: async (ctx, computer) => {
        await computerCountAggregate.insertIfDoesNotExist(ctx, {
            namespace: null,
            key: computer._id.toString(),
            id: computer._id.toString(),
        });
    },
});

export const run = migrations.runner();

export const runInstallAggregateBackfill = migrations.runner(
    internal.migrations.backfillInstallStatusAggregate
);

export const runComputerCountAggregateBackfill = migrations.runner(
    internal.migrations.backfillComputerCountAggregate
);