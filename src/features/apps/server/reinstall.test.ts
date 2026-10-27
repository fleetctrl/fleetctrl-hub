import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { computers } from "@/features/computers/server";
import { computerGroupMembers, computerGroups } from "@/features/groups/server/schema";
import { createTestDatabase, type TestDatabase } from "@/server/testing/db";
import { normalizeInstallError } from "../contract";
import { requestReinstall, requestReinstallForApp } from "./admin.service";
import { getAssignedApps, updateInstallState } from "./device.service";
import { apps, computerAppsInstalls, computerGroupReleases, releases, wingetReleases } from "./schema";

// Port of tests/reinstall.test.ts (convex-test) to Postgres.

type Fixture = { computerId: string; appId: string; releaseId: string; installId: string };

let t: TestDatabase;
let ids: Fixture;

beforeEach(async () => {
    t = await createTestDatabase();
    const { db } = t;
    const [computer] = await db.insert(computers).values({ name: "pc" }).returning();
    const [app] = await db.insert(apps).values({ displayName: "App", publisher: "Pub", autoUpdate: false }).returning();
    const [release] = await db.insert(releases).values({
        appId: app.id, version: "1.0", installerType: "winget", uninstallPrevious: false, versionSortKey: "1",
    }).returning();
    await db.insert(wingetReleases).values({ releaseId: release.id, wingetId: "Pub.App" });
    const [group] = await db.insert(computerGroups).values({ displayName: "g" }).returning();
    await db.insert(computerGroupMembers).values({ groupId: group.id, computerId: computer.id });
    await db.insert(computerGroupReleases).values({ releaseId: release.id, groupId: group.id, assignType: "include", action: "install" });
    const [install] = await db.insert(computerAppsInstalls).values({
        computerId: computer.id, appId: app.id, releaseId: release.id, status: "INSTALLED", reinstallRequestedAt: new Date(100),
    }).returning();
    ids = { computerId: computer.id, appId: app.id, releaseId: release.id, installId: install.id };
});

afterEach(async () => {
    await t.close();
});

async function install(id = ids.installId) {
    const [row] = await t.db.select().from(computerAppsInstalls).where(eq(computerAppsInstalls.id, id));
    return row;
}

const report = (args: Omit<Parameters<typeof updateInstallState>[1], "computerId" | "releaseId">) =>
    t.db.transaction((tx) => updateInstallState(tx, { computerId: ids.computerId, releaseId: ids.releaseId, ...args }));

describe("app reinstall requests", () => {
    test("assigned apps expose the pending reinstall request", async () => {
        const assigned = await getAssignedApps(t.db, ids.computerId);
        expect(assigned[0].reinstall_requested_at).toBe(100);
    });

    test("plain state reports keep the request, matching acknowledgement clears it", async () => {
        await report({ status: "INSTALLED" });
        expect((await install()).reinstallRequestedAt?.getTime()).toBe(100);

        await report({ status: "INSTALLED", reinstallRequestedAt: 50 });
        expect((await install()).reinstallRequestedAt?.getTime()).toBe(100);

        await report({ status: "INSTALLED", reinstallRequestedAt: 100 });
        expect((await install()).reinstallRequestedAt).toBeNull();
    });

    test("acknowledgement compares epoch milliseconds exactly", async () => {
        const requested = await requestReinstall(t.db, ids.installId);
        expect(requested).toEqual({ success: true });
        const echoed = (await getAssignedApps(t.db, ids.computerId))[0].reinstall_requested_at;
        expect(echoed).toEqual(expect.any(Number));

        await report({ status: "INSTALLED", reinstallRequestedAt: (echoed ?? 0) + 1 });
        expect((await install()).reinstallRequestedAt?.getTime()).toBe(echoed);
        await report({ status: "INSTALLED", reinstallRequestedAt: echoed });
        expect((await install()).reinstallRequestedAt).toBeNull();
    });

    test("app reinstall only targets installed or failed devices", async () => {
        const [other] = await t.db.insert(computers).values({ name: "other" }).returning();
        const [pending] = await t.db.insert(computerAppsInstalls).values({ computerId: other.id, appId: ids.appId, status: "PENDING" }).returning();
        const result = await requestReinstallForApp(t.db, ids.appId);
        expect(result.requested).toBe(1);
        expect((await install()).reinstallRequestedAt?.getTime()).toBeGreaterThan(100);
        expect((await install(pending.id)).reinstallRequestedAt).toBeNull();
    });

    test("unassigned devices are not targeted", async () => {
        const [other] = await t.db.insert(computers).values({ name: "left-group" }).returning();
        const [orphan] = await t.db.insert(computerAppsInstalls).values({
            computerId: other.id, appId: ids.appId, releaseId: ids.releaseId, status: "INSTALLED",
        }).returning();

        const result = await requestReinstallForApp(t.db, ids.appId);
        expect(result.requested).toBe(1);
        expect((await install(orphan.id)).reinstallRequestedAt).toBeNull();

        await expect(requestReinstall(t.db, orphan.id)).rejects.toThrow("no longer assigned");
        await requestReinstall(t.db, ids.installId);
        expect((await install()).reinstallRequestedAt?.getTime()).toBeGreaterThan(100);
    });

    test("disabled releases do not count as an assignment", async () => {
        await t.db.update(releases).set({ disabledAt: new Date(1) }).where(eq(releases.id, ids.releaseId));
        await expect(requestReinstall(t.db, ids.installId)).rejects.toThrow("no longer assigned");
    });
});

describe("install error details", () => {
    test("error reports store the message and later states clear it", async () => {
        await report({ status: "ERROR", error: normalizeInstallError("  install failed: exit code 1603  ") });
        expect((await install()).error).toBe("install failed: exit code 1603");

        await report({ status: "INSTALLED" });
        expect((await install()).error).toBeNull();
    });

    test("oversized and blank messages are normalized", () => {
        expect(normalizeInstallError("x".repeat(2 * 1024 * 1024))).toHaveLength(2000);
        expect(normalizeInstallError("   ")).toBeUndefined();
        expect(normalizeInstallError(undefined)).toBeUndefined();
    });

    test("error reports without a message leave no stale details", async () => {
        await report({ status: "ERROR", error: "first failure" });
        await report({ status: "ERROR" });
        expect((await install()).error).toBeNull();
    });
});

describe("install state reports", () => {
    test("the first report creates the row; unassigned releases are rejected", async () => {
        await t.db.delete(computerAppsInstalls);
        await report({ status: "INSTALLING" });
        expect((await t.db.select().from(computerAppsInstalls)).map((row) => row.status)).toEqual(["INSTALLING"]);

        const [other] = await t.db.insert(computers).values({ name: "outsider" }).returning();
        await expect(t.db.transaction((tx) => updateInstallState(tx, {
            computerId: other.id, releaseId: ids.releaseId, status: "INSTALLED",
        }))).rejects.toThrow("Release not assigned to computer");
    });
});
