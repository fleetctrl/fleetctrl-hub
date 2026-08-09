/* eslint-disable @convex-dev/no-collect-in-query */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { internalMutation } from "../functions";
import { versionSortKey } from "../lib/tableKeys";

const MOCK_APP_PREFIX = "Mock ";
const CONFIRMATION = "ADD_MOCK_APPS";
const INSTALL_BATCH_SIZE = 100;
const DELETE_BATCH_SIZE = 100;

const mockAppCatalog = [
    { name: "Microsoft Edge", publisher: "Microsoft", wingetId: "Microsoft.Edge", version: "125.0.2535.92" },
    { name: "Google Chrome", publisher: "Google", wingetId: "Google.Chrome", version: "124.0.6367.208" },
    { name: "Mozilla Firefox", publisher: "Mozilla", wingetId: "Mozilla.Firefox", version: "126.0.1" },
    { name: "Visual Studio Code", publisher: "Microsoft", wingetId: "Microsoft.VisualStudioCode", version: "1.89.1" },
    { name: "7-Zip", publisher: "Igor Pavlov", wingetId: "7zip.7zip", version: "24.05" },
    { name: "VLC media player", publisher: "VideoLAN", wingetId: "VideoLAN.VLC", version: "3.0.20" },
    { name: "Slack", publisher: "Slack Technologies", wingetId: "SlackTechnologies.Slack", version: "4.38.125" },
    { name: "Zoom Workplace", publisher: "Zoom", wingetId: "Zoom.Zoom", version: "6.0.10" },
    { name: "Git", publisher: "The Git Development Community", wingetId: "Git.Git", version: "2.45.1" },
    { name: "Node.js LTS", publisher: "OpenJS Foundation", wingetId: "OpenJS.NodeJS.LTS", version: "20.13.1" },
    { name: "Docker Desktop", publisher: "Docker", wingetId: "Docker.DockerDesktop", version: "4.30.0" },
    { name: "Power BI Desktop", publisher: "Microsoft", wingetId: "Microsoft.PowerBI", version: "2.128.952.0" },
    { name: "Figma", publisher: "Figma", wingetId: "Figma.Figma", version: "124.6.5" },
    { name: "Notepad++", publisher: "Notepad++ Team", wingetId: "Notepad++.Notepad++", version: "8.6.7" },
    { name: "Postman", publisher: "Postman", wingetId: "Postman.Postman", version: "11.1.14" },
];

type InstallStatus = "PENDING" | "INSTALLING" | "INSTALLED" | "ERROR" | "UNINSTALLED";

type PreparedApp = {
    appId: Id<"apps">;
    releaseId: Id<"releases">;
    appIndex: number;
};

function hashNumber(input: number) {
    let value = input + 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
}

function pickStatus(seed: number): InstallStatus {
    const roll = hashNumber(seed) % 100;
    if (roll < 58) return "INSTALLED";
    if (roll < 72) return "PENDING";
    if (roll < 84) return "INSTALLING";
    if (roll < 94) return "ERROR";
    return "UNINSTALLED";
}

function validateArgs(appCount: number, installCoveragePercent: number) {
    if (!Number.isInteger(appCount) || appCount < 1 || appCount > mockAppCatalog.length) {
        throw new Error(`appCount must be an integer between 1 and ${mockAppCatalog.length}.`);
    }

    if (!Number.isInteger(installCoveragePercent) || installCoveragePercent < 1 || installCoveragePercent > 100) {
        throw new Error("installCoveragePercent must be an integer between 1 and 100.");
    }
}

export const add = internalAction({
    args: {
        confirm: v.string(),
        appCount: v.optional(v.number()),
        installCoveragePercent: v.optional(v.number()),
        replaceExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, { confirm, appCount = 12, installCoveragePercent = 80, replaceExisting = true }) => {
        if (confirm !== CONFIRMATION) {
            throw new Error(`Pass confirm: "${CONFIRMATION}" to add mock apps.`);
        }
        validateArgs(appCount, installCoveragePercent);

        let deletedApps = 0;
        let deletedInstalls = 0;
        if (replaceExisting) {
            for (let guard = 0; guard < 1000; guard += 1) {
                const result: { deletedApps: number; deletedInstalls: number; done: boolean } = await ctx.runMutation(
                    internal.mocks.mockApps.deleteMockAppsBatch,
                    {}
                );
                deletedApps += result.deletedApps;
                deletedInstalls += result.deletedInstalls;
                if (result.done) break;
            }
        }

        const prepared: { apps: PreparedApp[]; computerCount: number } = await ctx.runMutation(
            internal.mocks.mockApps.prepareApps,
            { appCount, installCoveragePercent }
        );

        let insertedInstalls = 0;
        for (const app of prepared.apps) {
            for (let offset = 0; offset < prepared.computerCount; offset += INSTALL_BATCH_SIZE) {
                const result: { insertedInstalls: number } = await ctx.runMutation(
                    internal.mocks.mockApps.addInstallBatch,
                    {
                        appId: app.appId,
                        releaseId: app.releaseId,
                        appIndex: app.appIndex,
                        installCoveragePercent,
                        offset,
                        limit: INSTALL_BATCH_SIZE,
                    }
                );
                insertedInstalls += result.insertedInstalls;
            }
        }

        return {
            insertedApps: prepared.apps.length,
            insertedReleases: prepared.apps.length,
            insertedInstalls,
            deletedApps,
            deletedInstalls,
            appIds: prepared.apps.map((app) => app.appId),
        };
    },
});

export const deleteMockAppsBatch = internalMutation({
    args: {},
    handler: async (ctx) => {
        const apps = await ctx.db.query("apps").collect();
        const mockApp = apps.find((app) => app.display_name.startsWith(MOCK_APP_PREFIX));
        if (!mockApp) {
            return { deletedApps: 0, deletedInstalls: 0, done: true };
        }

        const installs = await ctx.db
            .query("computer_apps_installs")
            .withIndex("by_app_id", (q) => q.eq("app_id", mockApp._id))
            .take(DELETE_BATCH_SIZE);
        if (installs.length > 0) {
            for (const install of installs) {
                await ctx.db.delete("computer_apps_installs", install._id);
            }
            return { deletedApps: 0, deletedInstalls: installs.length, done: false };
        }

        const releases = await ctx.db
            .query("releases")
            .withIndex("by_app_id", (q) => q.eq("app_id", mockApp._id))
            .collect();

        for (const release of releases) {
            const staticAssignments = await ctx.db
                .query("computer_group_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();
            for (const assignment of staticAssignments) {
                await ctx.db.delete("computer_group_releases", assignment._id);
            }

            const dynamicAssignments = await ctx.db
                .query("dynamic_group_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();
            for (const assignment of dynamicAssignments) {
                await ctx.db.delete("dynamic_group_releases", assignment._id);
            }

            const detections = await ctx.db
                .query("detection_rules")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();
            for (const detection of detections) {
                await ctx.db.delete("detection_rules", detection._id);
            }

            const wingetReleases = await ctx.db
                .query("winget_releases")
                .withIndex("by_release_id", (q) => q.eq("release_id", release._id))
                .collect();
            for (const wingetRelease of wingetReleases) {
                await ctx.db.delete("winget_releases", wingetRelease._id);
            }

            await ctx.db.delete("releases", release._id);
        }

        await ctx.db.delete("apps", mockApp._id);
        return { deletedApps: 1, deletedInstalls: 0, done: false };
    },
});

export const prepareApps = internalMutation({
    args: {
        appCount: v.number(),
        installCoveragePercent: v.number(),
    },
    handler: async (ctx, { appCount, installCoveragePercent }) => {
        validateArgs(appCount, installCoveragePercent);

        const computers = await ctx.db.query("computers").take(1);
        if (computers.length === 0) {
            throw new Error("No computers found. Seed mock computers before adding mock app installs.");
        }

        const allComputers = await ctx.db.query("computers").collect();
        const apps: PreparedApp[] = [];

        for (let appIndex = 0; appIndex < appCount; appIndex += 1) {
            const catalogApp = mockAppCatalog[appIndex];
            const appId = await ctx.db.insert("apps", {
                display_name: `${MOCK_APP_PREFIX}${catalogApp.name}`,
                description: "Mock application for testing deployment and install status views.",
                publisher: catalogApp.publisher,
                auto_update: appIndex % 3 !== 0,
            });

            const releaseId = await ctx.db.insert("releases", {
                app_id: appId,
                version: catalogApp.version,
                version_sort_key: versionSortKey(catalogApp.version),
                installer_type: "winget",
                uninstall_previous: true,
            });

            await ctx.db.insert("winget_releases", {
                release_id: releaseId,
                winget_id: catalogApp.wingetId,
            });

            await ctx.db.insert("detection_rules", {
                release_id: releaseId,
                type: "registry",
                config: {
                    key: `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${catalogApp.wingetId}`,
                    value: "DisplayVersion",
                    operator: "equals",
                    expected: catalogApp.version,
                },
            });

            apps.push({ appId, releaseId, appIndex });
        }

        return { apps, computerCount: allComputers.length };
    },
});

export const addInstallBatch = internalMutation({
    args: {
        appId: v.id("apps"),
        releaseId: v.id("releases"),
        appIndex: v.number(),
        installCoveragePercent: v.number(),
        offset: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, { appId, releaseId, appIndex, installCoveragePercent, offset, limit }) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > INSTALL_BATCH_SIZE) {
            throw new Error(`limit must be an integer between 1 and ${INSTALL_BATCH_SIZE}.`);
        }

        const computers = await ctx.db.query("computers").collect();
        const batch = computers.slice(offset, offset + limit);
        const now = Date.now();
        let insertedInstalls = 0;

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
            const computerIndex = offset + batchIndex;
            const computer = batch[batchIndex];
            const coverageRoll = hashNumber((appIndex + 1) * 1009 + (computerIndex + 1) * 917) % 100;
            if (coverageRoll >= installCoveragePercent) {
                continue;
            }

            const status = pickStatus((appIndex + 1) * 811 + (computerIndex + 1) * 613);
            const updatedMinutesAgo = hashNumber((appIndex + 1) * 571 + (computerIndex + 1) * 433) % (60 * 24 * 21);
            const statusUpdatedAt = now - updatedMinutesAgo * 60 * 1000;

            await ctx.db.insert("computer_apps_installs", {
                computer_id: computer._id,
                app_id: appId,
                status,
                release_id: status === "PENDING" ? undefined : releaseId,
                error: status === "ERROR" ? "Mock install failed with exit code 1603." : undefined,
                installed_at: status === "INSTALLED" ? statusUpdatedAt - 12 * 60 * 1000 : undefined,
                last_seen_at: statusUpdatedAt + 5 * 60 * 1000,
                status_updated_at: statusUpdatedAt,
            });
            insertedInstalls += 1;
        }

        return { insertedInstalls };
    },
});
