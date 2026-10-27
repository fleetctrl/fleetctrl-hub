import { inArray } from "drizzle-orm";
import { membershipsOfComputer } from "@/features/groups/server";
import type { Database } from "@/server/db/client";
import { computerGroupReleases, dynamicGroupReleases } from "./schema";

export type ReleaseAssignment = {
    releaseId: string;
    assignType: "include" | "exclude";
    action: "install" | "uninstall";
};

// Resolve multiple group assignments for the same release deterministically.
// Exclude always wins over include, independent of static/dynamic group order.
function resolveAssignments(assignments: ReleaseAssignment[]): ReleaseAssignment[] {
    const resolved = new Map<string, ReleaseAssignment>();
    for (const assignment of assignments) {
        const current = resolved.get(assignment.releaseId);
        if (!current || (assignment.assignType === "exclude" && current.assignType !== "exclude")) {
            resolved.set(assignment.releaseId, assignment);
        }
    }
    return [...resolved.values()];
}

/** Assignments reaching a computer through its static and dynamic groups, in membership order. */
export async function getReleaseAssignmentsForComputer(db: Database, computerId: string): Promise<ReleaseAssignment[]> {
    const { staticGroupIds, dynamicGroupIds } = await membershipsOfComputer(db, computerId);
    const [staticRows, dynamicRows] = await Promise.all([
        staticGroupIds.length > 0
            ? db.select().from(computerGroupReleases).where(inArray(computerGroupReleases.groupId, staticGroupIds))
            : [],
        dynamicGroupIds.length > 0
            ? db.select().from(dynamicGroupReleases).where(inArray(dynamicGroupReleases.groupId, dynamicGroupIds))
            : [],
    ]);
    const byMembership = <Row extends { groupId: string; createdAt: Date; id: string }>(rows: Row[], groupIds: string[]) =>
        [...rows].sort((a, b) =>
            groupIds.indexOf(a.groupId) - groupIds.indexOf(b.groupId)
            || a.createdAt.getTime() - b.createdAt.getTime()
            || (a.id < b.id ? -1 : 1));

    return resolveAssignments(
        [...byMembership(staticRows, staticGroupIds), ...byMembership(dynamicRows, dynamicGroupIds)].map((row) => ({
            releaseId: row.releaseId,
            assignType: row.assignType,
            action: row.action,
        })),
    );
}

export async function hasAssignedReleaseAccess(db: Database, computerId: string, releaseId: string) {
    const assignments = await getReleaseAssignmentsForComputer(db, computerId);
    return assignments.some((assignment) => assignment.releaseId === releaseId && assignment.assignType !== "exclude");
}
