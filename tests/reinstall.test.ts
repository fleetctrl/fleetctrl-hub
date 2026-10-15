import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { normalizeInstallError } from "../convex/lib/installError";

const modules = import.meta.glob("../convex/**/!(*.*.*)*.*s");

async function setup() {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, "installStatusAggregate");
    const ids = await t.run(async (ctx) => {
        const computerId = await ctx.db.insert("computers", { name: "pc" });
        const appId = await ctx.db.insert("apps", { display_name: "App", publisher: "Pub", auto_update: false });
        const releaseId = await ctx.db.insert("releases", { app_id: appId, version: "1.0", installer_type: "winget", uninstall_previous: false });
        await ctx.db.insert("winget_releases", { release_id: releaseId, winget_id: "Pub.App" });
        const groupId = await ctx.db.insert("computer_groups", { display_name: "g" });
        await ctx.db.insert("computer_group_members", { group_id: groupId, computer_id: computerId });
        await ctx.db.insert("computer_group_releases", { release_id: releaseId, group_id: groupId, assign_type: "include", action: "install" });
        const installId = await ctx.db.insert("computer_apps_installs", {
            computer_id: computerId, app_id: appId, release_id: releaseId, status: "INSTALLED", reinstall_requested_at: 100,
        });
        return { computerId, appId, releaseId, installId };
    });
    return { t, ...ids };
}

describe("app reinstall requests", () => {
    test("assigned apps expose the pending reinstall request", async () => {
        const { t, computerId } = await setup();
        const apps = await t.query(internal.apps.getAssigned, { computerId });
        expect(apps[0].reinstall_requested_at).toBe(100);
    });

    test("plain state reports keep the request, matching acknowledgement clears it", async () => {
        const { t, computerId, releaseId, installId } = await setup();
        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "INSTALLED" });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.reinstall_requested_at).toBe(100);

        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "INSTALLED", reinstallRequestedAt: 50 });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.reinstall_requested_at).toBe(100);

        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "INSTALLED", reinstallRequestedAt: 100 });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.reinstall_requested_at).toBeUndefined();
    });

    test("app reinstall only targets installed or failed devices", async () => {
        const { t, appId, installId } = await setup();
        const pendingId = await t.run(async (ctx) => {
            const computerId = await ctx.db.insert("computers", { name: "other" });
            return ctx.db.insert("computer_apps_installs", { computer_id: computerId, app_id: appId, status: "PENDING" });
        });
        const result = await t.withIdentity({ subject: "admin" }).mutation(api.apps.requestReinstallForApp, { appId });
        expect(result.requested).toBe(1);
        expect((await t.run((ctx) => ctx.db.get(installId)))?.reinstall_requested_at).toBeGreaterThan(100);
        expect((await t.run((ctx) => ctx.db.get(pendingId)))?.reinstall_requested_at).toBeUndefined();
    });

    test("unassigned devices are not targeted", async () => {
        const { t, appId, releaseId, installId } = await setup();
        const orphanId = await t.run(async (ctx) => {
            const computerId = await ctx.db.insert("computers", { name: "left-group" });
            return ctx.db.insert("computer_apps_installs", { computer_id: computerId, app_id: appId, release_id: releaseId, status: "INSTALLED" });
        });
        const admin = t.withIdentity({ subject: "admin" });

        const result = await admin.mutation(api.apps.requestReinstallForApp, { appId });
        expect(result.requested).toBe(1);
        expect((await t.run((ctx) => ctx.db.get(orphanId)))?.reinstall_requested_at).toBeUndefined();

        await expect(admin.mutation(api.apps.requestReinstall, { installId: orphanId })).rejects.toThrow("no longer assigned");
        await admin.mutation(api.apps.requestReinstall, { installId });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.reinstall_requested_at).toBeGreaterThan(100);
    });

    test("disabled releases do not count as an assignment", async () => {
        const { t, releaseId, installId } = await setup();
        await t.run((ctx) => ctx.db.patch(releaseId, { disabled_at: 1 }));
        await expect(
            t.withIdentity({ subject: "admin" }).mutation(api.apps.requestReinstall, { installId })
        ).rejects.toThrow("no longer assigned");
    });
});

describe("install error details", () => {
    test("error reports store the message and later states clear it", async () => {
        const { t, computerId, releaseId, installId } = await setup();
        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "ERROR", error: "  install failed: exit code 1603  " });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.error).toBe("install failed: exit code 1603");

        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "INSTALLED" });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.error).toBeUndefined();
    });

    test("oversized and blank messages are normalized before reaching the mutation", () => {
        expect(normalizeInstallError("x".repeat(2 * 1024 * 1024))).toHaveLength(2000);
        expect(normalizeInstallError("   ")).toBeUndefined();
        expect(normalizeInstallError(undefined)).toBeUndefined();
    });

    test("error reports without a message leave no stale details", async () => {
        const { t, computerId, releaseId, installId } = await setup();
        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "ERROR", error: "first failure" });
        await t.mutation(internal.apps.updateInstallState, { computerId, releaseId, status: "ERROR" });
        expect((await t.run((ctx) => ctx.db.get(installId)))?.error).toBeUndefined();
    });
});
