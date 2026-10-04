import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import { installStatusAggregate, InstallStatus } from "./lib/aggregate/installAggregate";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { computerSearchText, versionSortKey } from "./lib/tableKeys";
import { isRefreshTokenStale } from "./lib/jwt";

export const migrations = new Migrations<DataModel>(components.migrations, {
    internalMutation,
    migrationsLocationPrefix: "migrations:",
});

export const backfillInstallStatusAggregate = migrations.define({
    table: "computer_apps_installs",
    migrateOne: async (ctx, install) => {
        const app = await ctx.db.get("apps", install.app_id);
        if (!app) {
            return;
        }

        await installStatusAggregate.insertIfDoesNotExist(ctx, {
            namespace: [app._id, install.status as InstallStatus],
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

export const removeAppAllowMultipleVersions = migrations.define({
    table: "apps",
    migrateOne: async (ctx, app) => {
        if (app.allow_multiple_versions !== undefined) {
            await ctx.db.patch("apps", app._id, {
                allow_multiple_versions: undefined,
            });
        }
    },
});

export const backfillComputerSearchText = migrations.define({
    table: "computers",
    migrateOne: (_, computer) => ({ search_text: computerSearchText(computer.name, computer.login_user) }),
});

export const backfillReleaseVersionSortKey = migrations.define({
    table: "releases",
    migrateOne: (_, release) => ({ version_sort_key: versionSortKey(release.version) }),
});

export const backfillClientUpdateVersionSortKey = migrations.define({
    table: "client_updates",
    migrateOne: (_, update) => ({ version_sort_key: versionSortKey(update.version) }),
});

// Passwords used to be kept forever in finished SET_PASSWD tasks.
export const scrubFinishedPasswordTasks = migrations.define({
    table: "tasks",
    migrateOne: (_, task) => {
        if (
            task.task_type === "SET_PASSWD" &&
            (task.status === "SUCCESS" || task.status === "ERROR") &&
            task.task_data !== undefined
        ) {
            return { task_data: undefined };
        }
    },
});

// Rotated refresh tokens used to be kept forever.
export const deleteStaleRefreshTokens = migrations.define({
    table: "refresh_tokens",
    migrateOne: async (ctx, token) => {
        if (isRefreshTokenStale(token, Date.now())) {
            await ctx.db.delete("refresh_tokens", token._id);
        }
    },
});

export const runVirtualTableBackfills =migrations.runner([
    internal.migrations.backfillComputerSearchText,
    internal.migrations.backfillReleaseVersionSortKey,
    internal.migrations.backfillClientUpdateVersionSortKey,
]);

export const runAll = migrations.runner([
    internal.migrations.backfillInstallStatusAggregate,
    internal.migrations.backfillComputerCountAggregate,
    internal.migrations.removeAppAllowMultipleVersions,
    internal.migrations.backfillComputerSearchText,
    internal.migrations.backfillReleaseVersionSortKey,
    internal.migrations.backfillClientUpdateVersionSortKey,
    internal.migrations.scrubFinishedPasswordTasks,
    internal.migrations.deleteStaleRefreshTokens,
]);
