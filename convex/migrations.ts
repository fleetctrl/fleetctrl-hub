import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import { installStatusAggregate, InstallStatus } from "./lib/aggregate/installAggregate";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { computerSearchText, versionSortKey } from "./lib/tableKeys";

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

export const runVirtualTableBackfills = migrations.runner([
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
]);
