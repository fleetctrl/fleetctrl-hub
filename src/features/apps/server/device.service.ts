import { and, eq, inArray } from "drizzle-orm";
import { getComputer } from "@/features/computers/server";
import type { Database } from "@/server/db/client";
import { normalizeInstallError, type InstallStatus } from "../contract";
import { scriptDoc } from "./dto";
import { getReleaseAssignmentsForComputer, hasAssignedReleaseAccess } from "./assignments";
import {
    apps,
    computerAppsInstalls,
    detectionRules,
    releaseRequirements,
    releaseScripts,
    releases,
    win32Releases,
    wingetReleases,
} from "./schema";

const byCreation = <Row extends { createdAt: Date; id: string }>(a: Row, b: Row) =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

/** Apps assigned to a computer through its groups (`GET /apps/assigned`). Same JSON as v2. */
export async function getAssignedApps(db: Database, computerId: string) {
    const releaseAssignments = await getReleaseAssignmentsForComputer(db, computerId);
    const included = releaseAssignments.filter((assignment) => assignment.assignType !== "exclude");
    if (included.length === 0) {
        return [];
    }

    const releaseRows = await db.select().from(releases).where(inArray(releases.id, included.map((a) => a.releaseId)));
    const releaseById = new Map(releaseRows.map((release) => [release.id, release]));
    const activeReleases = included
        .map((assignment) => releaseById.get(assignment.releaseId))
        .filter((release): release is NonNullable<typeof release> => release !== undefined && !release.disabledAt);
    if (activeReleases.length === 0) {
        return [];
    }

    const releaseIds = activeReleases.map((release) => release.id);
    const appIds = [...new Set(activeReleases.map((release) => release.appId))];
    const [appRows, win32Rows, wingetRows, ruleRows, requirementRows, scriptRows, installRows] = await Promise.all([
        db.select().from(apps).where(inArray(apps.id, appIds)),
        db.select().from(win32Releases).where(inArray(win32Releases.releaseId, releaseIds)),
        db.select().from(wingetReleases).where(inArray(wingetReleases.releaseId, releaseIds)),
        db.select().from(detectionRules).where(inArray(detectionRules.releaseId, releaseIds)),
        db.select().from(releaseRequirements).where(inArray(releaseRequirements.releaseId, releaseIds)),
        db.select().from(releaseScripts).where(inArray(releaseScripts.releaseId, releaseIds)),
        db.select().from(computerAppsInstalls).where(eq(computerAppsInstalls.computerId, computerId)),
    ]);
    const appById = new Map(appRows.map((app) => [app.id, app]));
    const reinstallRequests = new Map(
        installRows
            .filter((install) => install.reinstallRequestedAt !== null)
            .map((install) => [install.appId, install.reinstallRequestedAt?.getTime()]),
    );

    return appIds
        .map((appId) => appById.get(appId))
        .filter((app): app is NonNullable<typeof app> => app !== undefined)
        .map((app) => ({
            id: app.id,
            display_name: app.displayName,
            publisher: app.publisher,
            auto_update: app.autoUpdate,
            reinstall_requested_at: reinstallRequests.get(app.id),
            releases: activeReleases
                .filter((release) => release.appId === app.id)
                .map((release) => {
                    const assignment = releaseAssignments.find((a) => a.releaseId === release.id);
                    const win32 = win32Rows.find((row) => row.releaseId === release.id);
                    const winget = wingetRows.find((row) => row.releaseId === release.id);
                    return {
                        id: release.id,
                        version: release.version,
                        assign_type: assignment?.assignType || "include",
                        action: assignment?.action || "install",
                        installer_type: release.installerType,
                        uninstall_previous: release.uninstallPrevious,
                        win32: win32
                            ? {
                                install_binary_path: win32.installBinaryFileId,
                                installer_name: win32.installerName,
                                hash: win32.hash,
                                install_script: win32.installScript,
                                uninstall_script: win32.uninstallScript,
                                install_binary_size: win32.installBinarySize ?? undefined,
                            }
                            : null,
                        winget: winget ? { winget_id: winget.wingetId } : null,
                        detection_rules: ruleRows
                            .filter((rule) => rule.releaseId === release.id)
                            .sort(byCreation)
                            .map((rule) => ({ type: rule.type, config: rule.config })),
                        requirements: requirementRows
                            .filter((requirement) => requirement.releaseId === release.id)
                            .sort(byCreation)
                            .map((requirement) => ({
                                id: requirement.id,
                                script_name: requirement.scriptName,
                                timeout_seconds: requirement.timeoutSeconds,
                                run_as_system: requirement.runAsSystem,
                                hash: requirement.hash,
                            })),
                        // Raw documents in v2; the client reads `_id` and `storage_id`.
                        scripts: scriptRows
                            .filter((script) => script.releaseId === release.id)
                            .sort(byCreation)
                            .map(scriptDoc),
                    };
                }),
        }));
}

async function isActiveRelease(db: Database, releaseId: string) {
    const [release] = await db.select({ disabledAt: releases.disabledAt }).from(releases).where(eq(releases.id, releaseId));
    return release !== undefined && !release.disabledAt;
}

/** File ID of a release's installer, when the computer may download it. */
export async function authorizedInstallerFile(db: Database, computerId: string, releaseId: string) {
    if (!(await isActiveRelease(db, releaseId))) return null;
    if (!(await hasAssignedReleaseAccess(db, computerId, releaseId))) return null;
    const [win32] = await db
        .select({ fileId: win32Releases.installBinaryFileId })
        .from(win32Releases)
        .where(eq(win32Releases.releaseId, releaseId));
    return win32?.fileId ?? null;
}

export async function authorizedRequirementFile(db: Database, computerId: string, requirementId: string) {
    const [requirement] = await db.select().from(releaseRequirements).where(eq(releaseRequirements.id, requirementId));
    if (!requirement) return null;
    if (!(await isActiveRelease(db, requirement.releaseId))) return null;
    return (await hasAssignedReleaseAccess(db, computerId, requirement.releaseId)) ? requirement.fileId : null;
}

export async function authorizedScriptFile(db: Database, computerId: string, scriptId: string) {
    const [script] = await db.select().from(releaseScripts).where(eq(releaseScripts.id, scriptId));
    if (!script?.fileId) return null;
    if (!(await isActiveRelease(db, script.releaseId))) return null;
    return (await hasAssignedReleaseAccess(db, computerId, script.releaseId)) ? script.fileId : null;
}

const ms = (value: number | undefined) => (value !== undefined ? new Date(value) : undefined);

/**
 * Install state report from a device. The (computer, app) row is locked, and the insert path
 * uses ON CONFLICT, so concurrent reports serialize. Failures surface as 500, as in v2.
 */
export async function updateInstallState(
    tx: Database,
    args: {
        computerId: string;
        releaseId: string;
        status: InstallStatus;
        installedAt?: number;
        lastSeenAt?: number;
        reinstallRequestedAt?: number;
        error?: string;
    },
) {
    const computer = await getComputer(tx, args.computerId);
    if (!computer) throw new Error("Computer not found");

    const [release] = await tx.select().from(releases).where(eq(releases.id, args.releaseId));
    if (!release) throw new Error("Release not found");

    if (!(await hasAssignedReleaseAccess(tx, args.computerId, args.releaseId))) {
        throw new Error("Release not assigned to computer");
    }

    const [existing] = await tx
        .select()
        .from(computerAppsInstalls)
        .where(and(eq(computerAppsInstalls.computerId, args.computerId), eq(computerAppsInstalls.appId, release.appId)))
        .for("update");

    const now = new Date();
    const releaseChanged = existing?.releaseId !== args.releaseId;
    const installedAt = ms(args.installedAt);
    const nextInstalledAt =
        args.status === "INSTALLED"
            ? installedAt ?? (releaseChanged ? now : existing?.installedAt) ?? now
            : installedAt ?? (releaseChanged ? undefined : existing?.installedAt ?? undefined);

    // Only clear the request the client actually handled; a newer request made meanwhile stays pending.
    // Compared in epoch ms, which timestamptz(3) stores exactly.
    const acknowledgesReinstall =
        args.reinstallRequestedAt !== undefined
        && existing?.reinstallRequestedAt?.getTime() === args.reinstallRequestedAt;

    const update = {
        status: args.status,
        releaseId: args.releaseId,
        statusUpdatedAt: now,
        lastSeenAt: ms(args.lastSeenAt) ?? now,
        // The error only describes the current ERROR state; any other status clears it.
        error: args.status === "ERROR" ? normalizeInstallError(args.error) ?? null : null,
        ...(nextInstalledAt !== undefined ? { installedAt: nextInstalledAt } : {}),
        ...(acknowledgesReinstall ? { reinstallRequestedAt: null } : {}),
    };

    if (existing) {
        await tx.update(computerAppsInstalls).set(update).where(eq(computerAppsInstalls.id, existing.id));
    } else {
        await tx
            .insert(computerAppsInstalls)
            .values({ computerId: args.computerId, appId: release.appId, ...update })
            .onConflictDoUpdate({
                target: [computerAppsInstalls.computerId, computerAppsInstalls.appId],
                set: update,
            });
    }
}
