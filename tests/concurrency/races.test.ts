import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { computerAppsInstalls, apps, releases, wingetReleases, computerGroupReleases } from "@/features/apps/server/schema";
import { updateInstallState } from "@/features/apps/server/device.service";
import { clientUpdates } from "@/features/client-updates/server/schema";
import { setActiveClientUpdate } from "@/features/client-updates/server/service";
import { computers } from "@/features/computers/server";
import { enrollmentTokens, refreshTokens } from "@/features/device-auth/server/schema";
import { createEnrollmentToken, enroll, refreshTokensFor } from "@/features/device-auth/server/service";
import { files } from "@/features/files/server";
import { computerGroupMembers, computerGroups } from "@/features/groups/server/schema";
import { createPostgresTestDatabase, testDatabaseUrl } from "@/server/testing/postgres";

// The hot spots where Convex relied on serializable OCC mutations (§5 of the migration plan),
// exercised with real parallel connections. Run with TEST_DATABASE_URL=postgres://... pnpm test.

const tokens = { jwtSecret: "test-secret-that-is-at-least-32-characters", apiUrl: "https://fleet.test/api" };

describe.skipIf(!testDatabaseUrl)("concurrency on Postgres", () => {
    let database: Awaited<ReturnType<typeof createPostgresTestDatabase>>;
    const deps = () => ({ db: database.db, tokens });

    beforeAll(async () => {
        database = await createPostgresTestDatabase();
    });

    afterAll(async () => {
        await database?.close();
    });

    test("parallel enrollments cannot overdraw a limited-use token", async () => {
        const { token, id } = await createEnrollmentToken(database.db, { remainingUses: 3 });
        const results = await Promise.allSettled(
            Array.from({ length: 12 }, (_, index) => enroll(deps(), { enrollmentToken: token, name: `pc-${index}`, jkt: `jkt-race-${index}` })),
        );
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
        const failures = results.filter((result) => result.status === "rejected").map((result) => String(result.reason));
        expect(failures.every((message) => message.includes("no remaining uses"))).toBe(true);
        const [row] = await database.db.select().from(enrollmentTokens).where(eq(enrollmentTokens.id, id));
        expect(row.remainingUses).toBe(0);
    });

    test("the refresh grace window can be used exactly once under a race", async () => {
        const { token } = await createEnrollmentToken(database.db, { remainingUses: -1 });
        const session = await enroll(deps(), { enrollmentToken: token, name: "grace", jkt: "jkt-grace" });
        await refreshTokensFor(deps(), { refreshToken: session.refresh_token, dpopJkt: "jkt-grace" });

        const results = await Promise.allSettled(
            Array.from({ length: 8 }, () => refreshTokensFor(deps(), { refreshToken: session.refresh_token, dpopJkt: "jkt-grace" })),
        );
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const active = await database.db.select().from(refreshTokens).where(eq(refreshTokens.computerId, session.device_id));
        // enroll + rotation + one grace use
        expect(active).toHaveLength(3);
    });

    test("concurrent first install reports create one row", async () => {
        const [computer] = await database.db.insert(computers).values({ name: "installer" }).returning();
        const [app] = await database.db.insert(apps).values({ displayName: "App", publisher: "P", autoUpdate: false }).returning();
        const [release] = await database.db.insert(releases).values({
            appId: app.id, version: "1", installerType: "winget", uninstallPrevious: false, versionSortKey: "1",
        }).returning();
        await database.db.insert(wingetReleases).values({ releaseId: release.id, wingetId: "P.App" });
        const [group] = await database.db.insert(computerGroups).values({ displayName: "race" }).returning();
        await database.db.insert(computerGroupMembers).values({ groupId: group.id, computerId: computer.id });
        await database.db.insert(computerGroupReleases).values({ releaseId: release.id, groupId: group.id, assignType: "include", action: "install" });

        const statuses = ["INSTALLING", "INSTALLED", "ERROR", "INSTALLED", "INSTALLING", "INSTALLED"] as const;
        const results = await Promise.allSettled(statuses.map((status) =>
            database.db.transaction((tx) => updateInstallState(tx, { computerId: computer.id, releaseId: release.id, status }))));
        expect(results.filter((result) => result.status === "rejected")).toEqual([]);
        const rows = await database.db.select().from(computerAppsInstalls).where(eq(computerAppsInstalls.computerId, computer.id));
        expect(rows).toHaveLength(1);
    });

    test("concurrent activations leave exactly one active client version", async () => {
        const [file] = await database.db.insert(files).values({ objectKey: "files/race", size: 1, sha256: "x" }).returning();
        const versions = await database.db.insert(clientUpdates).values(
            Array.from({ length: 5 }, (_, index) => ({ version: `1.0.${index}`, versionSortKey: `${index}`, fileId: file.id, hash: "x", byteSize: 1 })),
        ).returning();
        await Promise.allSettled(versions.map((version) => setActiveClientUpdate(database.db, version.id)));
        const active = await database.db.select().from(clientUpdates).where(eq(clientUpdates.isActive, true));
        expect(active).toHaveLength(1);
    });
});
