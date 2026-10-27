import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { computers } from "@/features/computers/server";
import { computerGroups, dynamicComputerGroups } from "@/features/groups/server";
import type { Database } from "@/server/db/client";
import { DomainError } from "@/server/http/errors";
import { mapPage, paginate } from "@/server/pagination";
import { versionSortKey } from "@/server/version-sort-key";
import { INSTALL_STATUSES, type InstallStatus, type ReleaseInput } from "../contract";
import {
    detectionDoc,
    dynamicAssignmentDoc,
    requirementDoc,
    scriptDoc,
    staticAssignmentDoc,
    win32Doc,
    wingetDoc,
} from "./dto";
import { getReleaseAssignmentsForComputer } from "./assignments";
import { takeReleaseChildren, writeReleaseChildren } from "./release-writer";
import {
    apps,
    computerAppsInstalls,
    computerGroupReleases,
    detectionRules,
    dynamicGroupReleases,
    releaseRequirements,
    releaseScripts,
    releases,
    win32Releases,
    wingetReleases,
    type AppRow,
    type InstallRow,
    type ReleaseRow,
} from "./schema";

const APP_RELEASE_PREVIEW_LIMIT = 10;
const APP_ASSIGNMENT_PREVIEW_LIMIT = 10;
const RELEASE_RELATED_ROWS_LIMIT = 100;
const REINSTALLABLE_STATUSES = new Set<InstallStatus>(["INSTALLED", "ERROR"]);

const byCreation = <Row extends { createdAt: Date; id: string }>(a: Row, b: Row) =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

// ========================================
// App tables
// ========================================

async function installedCounts(db: Database, appIds: string[]) {
    if (appIds.length === 0) return new Map<string, number>();
    const rows = await db
        .select({ appId: computerAppsInstalls.appId, value: count() })
        .from(computerAppsInstalls)
        .where(and(inArray(computerAppsInstalls.appId, appIds), eq(computerAppsInstalls.status, "INSTALLED")))
        .groupBy(computerAppsInstalls.appId);
    return new Map(rows.map((row) => [row.appId, row.value]));
}

/** Group assignments of each app's releases, with group names (display-only join). */
async function appAssignments(db: Database, appIds: string[]) {
    if (appIds.length === 0) return [];
    const [staticRows, dynamicRows] = await Promise.all([
        db
            .select({
                appId: releases.appId,
                releaseId: releases.id,
                releaseCreatedAt: releases.createdAt,
                createdAt: computerGroupReleases.createdAt,
                groupId: computerGroupReleases.groupId,
                groupName: computerGroups.displayName,
            })
            .from(computerGroupReleases)
            .innerJoin(releases, eq(releases.id, computerGroupReleases.releaseId))
            .leftJoin(computerGroups, eq(computerGroups.id, computerGroupReleases.groupId))
            .where(inArray(releases.appId, appIds)),
        db
            .select({
                appId: releases.appId,
                releaseId: releases.id,
                releaseCreatedAt: releases.createdAt,
                createdAt: dynamicGroupReleases.createdAt,
                groupId: dynamicGroupReleases.groupId,
                groupName: dynamicComputerGroups.displayName,
            })
            .from(dynamicGroupReleases)
            .innerJoin(releases, eq(releases.id, dynamicGroupReleases.releaseId))
            .leftJoin(dynamicComputerGroups, eq(dynamicComputerGroups.id, dynamicGroupReleases.groupId))
            .where(inArray(releases.appId, appIds)),
    ]);
    const order = (a: { releaseCreatedAt: Date; createdAt: Date }, b: { releaseCreatedAt: Date; createdAt: Date }) =>
        a.releaseCreatedAt.getTime() - b.releaseCreatedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
    return [
        ...staticRows.map((row) => ({ ...row, kind: "static" as const })),
        ...dynamicRows.map((row) => ({ ...row, kind: "dynamic" as const })),
    ].sort(order);
}

type AssignmentRow = Awaited<ReturnType<typeof appAssignments>>[number];

function uniqueGroups(rows: { groupId: string; groupName: string | null }[]) {
    const groups = new Map<string, { id: string; name: string }>();
    for (const row of rows) {
        if (row.groupName !== null && !groups.has(row.groupId)) groups.set(row.groupId, { id: row.groupId, name: row.groupName });
    }
    return [...groups.values()];
}

/** Groups shown in the apps table: first 10 releases, first 10 static and dynamic assignments each. */
function previewGroups(rows: AssignmentRow[]) {
    const releaseOrder = [...new Set(rows.map((row) => row.releaseId))];
    const preview: AssignmentRow[] = [];
    for (const releaseId of releaseOrder.slice(0, APP_RELEASE_PREVIEW_LIMIT)) {
        const releaseRows = rows.filter((row) => row.releaseId === releaseId);
        preview.push(...releaseRows.filter((row) => row.kind === "static").slice(0, APP_ASSIGNMENT_PREVIEW_LIMIT));
        preview.push(...releaseRows.filter((row) => row.kind === "dynamic").slice(0, APP_ASSIGNMENT_PREVIEW_LIMIT));
    }
    return uniqueGroups(preview);
}

function toAppTableRow(app: AppRow, groups: { id: string; name: string }[], groupsCount: number, installedCount: number) {
    return {
        id: app.id,
        displayName: app.displayName,
        createdAt: app.createdAt.getTime(),
        updatedAt: app.createdAt.getTime(),
        groups,
        groupsCount,
        installedCount,
    };
}

export async function listAppsTable(db: Database) {
    const appRows = await db.select().from(apps).orderBy(asc(apps.createdAt), asc(apps.id));
    const appIds = appRows.map((app) => app.id);
    const [assignments, counts] = await Promise.all([appAssignments(db, appIds), installedCounts(db, appIds)]);
    return appRows.map((app) => {
        const groups = uniqueGroups(assignments.filter((row) => row.appId === app.id));
        return toAppTableRow(app, groups, groups.length, counts.get(app.id) ?? 0);
    });
}

export async function listAppsTablePaginated(db: Database, args: { cursor?: string; numItems: number }) {
    const result = await paginate({
        ...args,
        desc: true,
        sortKey: apps.createdAt,
        idKey: apps.id,
        sortValue: (row: AppRow) => row.createdAt.toISOString(),
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) => db.select().from(apps).where(where).orderBy(...orderBy).limit(limit),
    });
    const appIds = result.page.map((app) => app.id);
    const [assignments, counts] = await Promise.all([appAssignments(db, appIds), installedCounts(db, appIds)]);
    return mapPage(result, (app) => {
        const rows = assignments.filter((row) => row.appId === app.id);
        return toAppTableRow(app, previewGroups(rows), new Set(rows.map((row) => row.groupId)).size, counts.get(app.id) ?? 0);
    });
}

export async function getApp(db: Database, appId: string) {
    const [app] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!app) return null;
    const releaseRows = await db.select().from(releases).where(eq(releases.appId, appId)).orderBy(asc(releases.createdAt), asc(releases.id));
    return {
        id: app.id,
        display_name: app.displayName,
        description: app.description ?? undefined,
        publisher: app.publisher,
        auto_update: app.autoUpdate,
        created_at: app.createdAt.getTime(),
        updated_at: app.createdAt.getTime(),
        releases: releaseRows.map((release) => ({
            id: release.id,
            version: release.version,
            created_at: release.createdAt.getTime(),
            installer_type: release.installerType,
            disabled_at: release.disabledAt?.getTime(),
        })),
    };
}

export async function updateApp(
    db: Database,
    appId: string,
    data: { display_name?: string; description?: string; publisher?: string },
) {
    const updates: Partial<typeof apps.$inferInsert> = {};
    if (data.display_name !== undefined) updates.displayName = data.display_name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.publisher !== undefined) updates.publisher = data.publisher;
    if (Object.keys(updates).length > 0) {
        await db.update(apps).set(updates).where(eq(apps.id, appId));
    }
    return { success: true };
}

/** Releases, their children, assignments and install states go with the app through FK cascades. */
export async function removeApp(db: Database, appId: string) {
    await db.delete(apps).where(eq(apps.id, appId));
    return { success: true };
}

// ========================================
// Releases
// ========================================

export async function listReleasesPaginated(db: Database, appId: string, args: { cursor?: string; numItems: number }) {
    const result = await paginate({
        ...args,
        desc: true,
        sortKey: releases.versionSortKey,
        idKey: releases.id,
        sortValue: (row: ReleaseRow) => row.versionSortKey,
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) =>
            db.select().from(releases).where(and(eq(releases.appId, appId), where)).orderBy(...orderBy).limit(limit),
    });
    const releaseIds = result.page.map((release) => release.id);

    const [staticRows, dynamicRows, ruleRows, win32Rows, wingetRows, requirementRows, scriptRows] = await Promise.all([
        db
            .select({ assignment: computerGroupReleases, group: computerGroups })
            .from(computerGroupReleases)
            .leftJoin(computerGroups, eq(computerGroups.id, computerGroupReleases.groupId))
            .where(inArray(computerGroupReleases.releaseId, releaseIds)),
        db
            .select({ assignment: dynamicGroupReleases, group: dynamicComputerGroups })
            .from(dynamicGroupReleases)
            .leftJoin(dynamicComputerGroups, eq(dynamicComputerGroups.id, dynamicGroupReleases.groupId))
            .where(inArray(dynamicGroupReleases.releaseId, releaseIds)),
        db.select().from(detectionRules).where(inArray(detectionRules.releaseId, releaseIds)),
        db.select().from(win32Releases).where(inArray(win32Releases.releaseId, releaseIds)),
        db.select().from(wingetReleases).where(inArray(wingetReleases.releaseId, releaseIds)),
        db.select().from(releaseRequirements).where(inArray(releaseRequirements.releaseId, releaseIds)),
        db.select().from(releaseScripts).where(inArray(releaseScripts.releaseId, releaseIds)),
    ]);

    const of = <Row extends { releaseId: string; createdAt: Date; id: string }>(rows: Row[], releaseId: string) =>
        rows.filter((row) => row.releaseId === releaseId).sort(byCreation).slice(0, RELEASE_RELATED_ROWS_LIMIT);

    return mapPage(result, (release) => {
        const computer_group_releases = of(staticRows.map((row) => ({ ...row.assignment, group: row.group })), release.id)
            .map((row) => staticAssignmentDoc(row, row.group ?? undefined));
        const dynamic_group_releases = of(dynamicRows.map((row) => ({ ...row.assignment, group: row.group })), release.id)
            .map((row) => dynamicAssignmentDoc(row, row.group ?? undefined));
        return {
            id: release.id,
            version: release.version,
            created_at: release.createdAt.getTime(),
            installer_type: release.installerType,
            disabled_at: release.disabledAt?.getTime(),
            uninstall_previous: release.uninstallPrevious,
            computer_group_releases,
            dynamic_group_releases,
            staticAssignments: computer_group_releases,
            dynamicAssignments: dynamic_group_releases,
            detections: of(ruleRows, release.id).map(detectionDoc),
            win32_releases: of(win32Rows, release.id).map(win32Doc),
            winget_releases: of(wingetRows, release.id).map(wingetDoc),
            release_requirements: of(requirementRows, release.id).map(requirementDoc),
            release_scripts: of(scriptRows, release.id).map(scriptDoc),
        };
    });
}

function releaseValues(input: { version?: string; type: ReleaseInput["type"]; uninstall_previous: boolean }) {
    const version = input.version || "latest";
    return {
        version,
        versionSortKey: versionSortKey(version),
        installerType: input.type,
        uninstallPrevious: input.uninstall_previous,
    };
}

/** Creates an app and its first release in one transaction. */
export async function createApp(
    db: Database,
    args: {
        appInfo: { name: string; description?: string; publisher: string };
        release: {
            type: ReleaseInput["type"];
            wingetId?: string;
            installScript?: string;
            uninstallScript?: string;
            installBinary?: ReleaseInput["installBinary"];
            autoUpdate: boolean;
            version?: string;
            uninstallPreviousVersion: boolean;
        };
        requirement?: ReleaseInput["requirements"];
        detection: { detections: ReleaseInput["detections"] };
        preScript?: ReleaseInput["preScript"];
        postScript?: ReleaseInput["postScript"];
        assignment: ReleaseInput["assignments"];
    },
) {
    return db.transaction(async (tx) => {
        const [app] = await tx
            .insert(apps)
            .values({
                displayName: args.appInfo.name,
                description: args.appInfo.description,
                publisher: args.appInfo.publisher,
                autoUpdate: args.release.autoUpdate,
            })
            .returning({ id: apps.id });
        const [release] = await tx
            .insert(releases)
            .values({
                appId: app.id,
                ...releaseValues({
                    version: args.release.version,
                    type: args.release.type,
                    uninstall_previous: args.release.uninstallPreviousVersion,
                }),
            })
            .returning({ id: releases.id });
        await writeReleaseChildren(tx, release.id, args.release.type, {
            wingetId: args.release.wingetId,
            installBinary: args.release.installBinary,
            installScript: args.release.installScript,
            uninstallScript: args.release.uninstallScript,
            detections: args.detection.detections,
            requirements: args.requirement,
            preScript: args.preScript,
            postScript: args.postScript,
            assignments: args.assignment,
        });
        return app.id;
    });
}

export async function createRelease(db: Database, appId: string, input: ReleaseInput) {
    return db.transaction(async (tx) => {
        const [release] = await tx
            .insert(releases)
            .values({ appId, ...releaseValues(input), disabledAt: input.disabled ? new Date() : null })
            .returning({ id: releases.id });
        await writeReleaseChildren(tx, release.id, input.type, input);
        return release.id;
    });
}

export async function updateRelease(db: Database, releaseId: string, input: ReleaseInput) {
    return db.transaction(async (tx) => {
        const [updated] = await tx
            .update(releases)
            .set({
                ...releaseValues(input),
                ...(input.disabled !== undefined ? { disabledAt: input.disabled ? new Date() : null } : {}),
            })
            .where(eq(releases.id, releaseId))
            .returning({ id: releases.id });
        if (!updated) throw new DomainError("Release not found");
        const existing = await takeReleaseChildren(tx, releaseId);
        await writeReleaseChildren(tx, releaseId, input.type, input, existing);
        return { success: true };
    });
}

/** Children, assignments and install states that point at the release go through FK cascades. */
export async function deleteRelease(db: Database, releaseId: string) {
    await db.delete(releases).where(eq(releases.id, releaseId));
    return { success: true };
}

// ========================================
// Install status
// ========================================

export async function getInstallStatusSummary(db: Database, appId: string) {
    const rows = await db
        .select({ status: computerAppsInstalls.status, value: count() })
        .from(computerAppsInstalls)
        .where(eq(computerAppsInstalls.appId, appId))
        .groupBy(computerAppsInstalls.status);
    const byStatus = Object.fromEntries(INSTALL_STATUSES.map((status) => [status, 0])) as Record<InstallStatus, number>;
    for (const row of rows) byStatus[row.status] = row.value;
    return { total: rows.reduce((sum, row) => sum + row.value, 0), byStatus };
}

export async function listInstallStatusPaginated(db: Database, appId: string, args: { cursor?: string; numItems: number }) {
    type Row = { install: InstallRow; computerName: string | null; releaseVersion: string | null };
    const sortKey = sql`coalesce(${computerAppsInstalls.statusUpdatedAt}, 'epoch'::timestamptz)`;
    const result = await paginate({
        ...args,
        desc: true,
        sortKey,
        idKey: computerAppsInstalls.id,
        sortValue: (row: Row) => (row.install.statusUpdatedAt ?? new Date(0)).toISOString(),
        idValue: (row) => row.install.id,
        query: ({ where, orderBy, limit }) =>
            db
                .select({ install: computerAppsInstalls, computerName: computers.name, releaseVersion: releases.version })
                .from(computerAppsInstalls)
                .leftJoin(computers, eq(computers.id, computerAppsInstalls.computerId))
                .leftJoin(releases, eq(releases.id, computerAppsInstalls.releaseId))
                .where(and(eq(computerAppsInstalls.appId, appId), where))
                .orderBy(...orderBy)
                .limit(limit),
    });
    return mapPage(result, ({ install, computerName, releaseVersion }) => ({
        id: install.id,
        computerId: install.computerId,
        computerName: computerName ?? "Unknown computer",
        appId: install.appId,
        releaseVersion: releaseVersion || "Unknown version",
        status: install.status,
        installedAt: install.installedAt?.getTime(),
        lastSeenAt: install.lastSeenAt?.getTime(),
        statusUpdatedAt: install.statusUpdatedAt?.getTime(),
        reinstallRequestedAt: install.reinstallRequestedAt?.getTime(),
        error: install.error ?? undefined,
    }));
}

async function activeReleaseIds(db: Database, appId: string) {
    const rows = await db.select({ id: releases.id, disabledAt: releases.disabledAt }).from(releases).where(eq(releases.appId, appId));
    return new Set(rows.filter((release) => !release.disabledAt).map((release) => release.id));
}

// Mirrors getAssigned: the client only sees (and can acknowledge) reinstall requests for apps it is currently assigned.
async function isAppAssignedToComputer(db: Database, computerId: string, releaseIds: Set<string>) {
    const assignments = await getReleaseAssignmentsForComputer(db, computerId);
    return assignments.some((assignment) => assignment.assignType !== "exclude" && releaseIds.has(assignment.releaseId));
}

/** Asks the client to uninstall and install the app again on one computer. */
export async function requestReinstall(db: Database, installId: string) {
    return db.transaction(async (tx) => {
        const [install] = await tx.select().from(computerAppsInstalls).where(eq(computerAppsInstalls.id, installId)).for("update");
        if (!install) throw new DomainError("Install record not found");
        if (!REINSTALLABLE_STATUSES.has(install.status)) {
            throw new DomainError("Only installed or failed apps can be reinstalled");
        }
        const releaseIds = await activeReleaseIds(tx, install.appId);
        if (!(await isAppAssignedToComputer(tx, install.computerId, releaseIds))) {
            throw new DomainError("App is no longer assigned to this computer");
        }
        await tx.update(computerAppsInstalls).set({ reinstallRequestedAt: new Date() }).where(eq(computerAppsInstalls.id, installId));
        return { success: true };
    });
}

/** Asks every computer still assigned the app, with it installed or failed, to reinstall it. */
export async function requestReinstallForApp(db: Database, appId: string) {
    return db.transaction(async (tx) => {
        const installs = await tx.select().from(computerAppsInstalls).where(eq(computerAppsInstalls.appId, appId));
        const releaseIds = await activeReleaseIds(tx, appId);
        const now = new Date();
        let requested = 0;
        for (const install of installs) {
            if (!REINSTALLABLE_STATUSES.has(install.status)) continue;
            if (!(await isAppAssignedToComputer(tx, install.computerId, releaseIds))) continue;
            await tx.update(computerAppsInstalls).set({ reinstallRequestedAt: now }).where(eq(computerAppsInstalls.id, install.id));
            requested++;
        }
        return { requested };
    });
}
