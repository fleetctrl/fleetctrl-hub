import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { computers, listComputers, pickComputers } from "@/features/computers/server";
import type { Database } from "@/server/db/client";
import { DomainError } from "@/server/http/errors";
import { mapPage, paginate } from "@/server/pagination";
import {
    computerGroupMembers,
    computerGroups,
    dynamicComputerGroups,
    dynamicGroupMembers,
    type ComputerGroupRow,
    type DynamicComputerGroupRow,
} from "./schema";
import { refreshGroupMembership } from "./membership";
import { evaluateRule, parseRuleExpression, toRuleSubject } from "./rules";

const STATIC_MEMBER_PREVIEW_LIMIT = 2;
const DUPLICATE_NAME = "A group with this name already exists";

const iso = (value: Date | null) => (value ? value.toISOString() : null);

// ========================================
// Static groups
// ========================================

async function staticMemberCounts(db: Database, groupIds: string[]) {
    if (groupIds.length === 0) return new Map<string, number>();
    const rows = await db
        .select({ groupId: computerGroupMembers.groupId, value: count() })
        .from(computerGroupMembers)
        .where(inArray(computerGroupMembers.groupId, groupIds))
        .groupBy(computerGroupMembers.groupId);
    return new Map(rows.map((row) => [row.groupId, row.value]));
}

export async function listStaticGroups(db: Database) {
    const groups = await db.select().from(computerGroups).orderBy(asc(computerGroups.createdAt), asc(computerGroups.id));
    const counts = await staticMemberCounts(db, groups.map((group) => group.id));
    return groups.map((group) => ({
        id: group.id,
        displayName: group.displayName,
        description: group.description ?? undefined,
        memberCount: counts.get(group.id) ?? 0,
        createdAt: group.createdAt.getTime(),
    }));
}

export async function listStaticGroupsForTable(db: Database, args: { cursor?: string; numItems: number }) {
    const result = await paginate({
        ...args,
        desc: true,
        sortKey: computerGroups.createdAt,
        idKey: computerGroups.id,
        sortValue: (row: ComputerGroupRow) => row.createdAt.toISOString(),
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) => db.select().from(computerGroups).where(where).orderBy(...orderBy).limit(limit),
    });
    const groupIds = result.page.map((group) => group.id);
    const counts = await staticMemberCounts(db, groupIds);

    // First members of each group (by membership age) for the table preview; display-only join.
    const ranked = db
        .select({
            groupId: computerGroupMembers.groupId,
            computerId: computerGroupMembers.computerId,
            position: sql<number>`row_number() over (partition by ${computerGroupMembers.groupId} order by ${computerGroupMembers.createdAt}, ${computerGroupMembers.computerId})`.as("position"),
        })
        .from(computerGroupMembers)
        .where(inArray(computerGroupMembers.groupId, groupIds))
        .as("ranked");
    const previews = await db
        .select({ groupId: ranked.groupId, id: computers.id, name: computers.name })
        .from(ranked)
        .innerJoin(computers, eq(computers.id, ranked.computerId))
        .where(sql`${ranked.position} <= ${STATIC_MEMBER_PREVIEW_LIMIT}`)
        .orderBy(ranked.groupId, ranked.position);

    return mapPage(result, (group) => ({
        id: group.id,
        displayName: group.displayName,
        description: group.description ?? undefined,
        members: previews.filter((member) => member.groupId === group.id).map(({ id, name }) => ({ id, name })),
        memberCount: counts.get(group.id) ?? 0,
        createdAt: group.createdAt.getTime(),
    }));
}

export async function listStaticMemberIds(db: Database, groupId: string, args: { cursor?: string; numItems: number }) {
    const result = await paginate({
        ...args,
        desc: false,
        sortKey: computerGroupMembers.createdAt,
        idKey: computerGroupMembers.computerId,
        sortValue: (row: { computerId: string; createdAt: Date }) => row.createdAt.toISOString(),
        idValue: (row) => row.computerId,
        query: ({ where, orderBy, limit }) =>
            db
                .select({ computerId: computerGroupMembers.computerId, createdAt: computerGroupMembers.createdAt })
                .from(computerGroupMembers)
                .where(and(eq(computerGroupMembers.groupId, groupId), where))
                .orderBy(...orderBy)
                .limit(limit),
    });
    return mapPage(result, (member) => member.computerId);
}

export async function listComputersForGroups(db: Database, args: { search?: string; cursor?: string; numItems: number }) {
    const result = await pickComputers(db, { ...args, search: args.search?.trim().toLowerCase() || undefined });
    return mapPage(result, (c) => ({ id: c.id, name: c.name, os: c.os ?? undefined, ip: c.ip ?? undefined }));
}

async function assertStaticNameFree(tx: Database, displayName: string, exceptId?: string) {
    const [duplicate] = await tx
        .select({ id: computerGroups.id })
        .from(computerGroups)
        .where(and(eq(computerGroups.displayName, displayName), exceptId ? ne(computerGroups.id, exceptId) : undefined))
        .limit(1);
    if (duplicate) throw new DomainError(DUPLICATE_NAME);
}

async function insertStaticMembers(tx: Database, groupId: string, memberIds: string[]) {
    if (memberIds.length === 0) return;
    await tx
        .insert(computerGroupMembers)
        .values(memberIds.map((computerId) => ({ groupId, computerId })))
        .onConflictDoNothing();
}

export async function createStaticGroup(
    db: Database,
    args: { displayName: string; description?: string; memberIds?: string[] },
) {
    return db.transaction(async (tx) => {
        await assertStaticNameFree(tx, args.displayName);
        const [group] = await tx
            .insert(computerGroups)
            .values({ displayName: args.displayName, description: args.description })
            .returning({ id: computerGroups.id });
        await insertStaticMembers(tx, group.id, args.memberIds ?? []);
        return { id: group.id };
    });
}

export async function updateStaticGroup(
    db: Database,
    id: string,
    args: { displayName?: string; description?: string; memberIds?: string[] },
) {
    return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(computerGroups).where(eq(computerGroups.id, id)).for("update");
        if (!existing) throw new DomainError("Group not found");

        if (args.displayName && args.displayName !== existing.displayName) {
            await assertStaticNameFree(tx, args.displayName, id);
        }

        const updates: Partial<typeof computerGroups.$inferInsert> = {};
        if (args.displayName !== undefined) updates.displayName = args.displayName;
        if (args.description !== undefined) updates.description = args.description;
        if (Object.keys(updates).length > 0) {
            await tx.update(computerGroups).set(updates).where(eq(computerGroups.id, id));
        }

        if (args.memberIds !== undefined) {
            await tx.delete(computerGroupMembers).where(eq(computerGroupMembers.groupId, id));
            await insertStaticMembers(tx, id, args.memberIds);
        }
        return { success: true };
    });
}

/** Members and release assignments go with the group through FK cascades. */
export async function removeStaticGroup(db: Database, id: string) {
    await db.delete(computerGroups).where(eq(computerGroups.id, id));
    return { success: true };
}

// ========================================
// Dynamic groups
// ========================================

async function dynamicMemberCounts(db: Database, groupIds: string[]) {
    if (groupIds.length === 0) return new Map<string, number>();
    const rows = await db
        .select({ groupId: dynamicGroupMembers.groupId, value: count() })
        .from(dynamicGroupMembers)
        .where(inArray(dynamicGroupMembers.groupId, groupIds))
        .groupBy(dynamicGroupMembers.groupId);
    return new Map(rows.map((row) => [row.groupId, row.value]));
}

function toDynamicGroupListItem(group: DynamicComputerGroupRow, memberCount: number) {
    return {
        id: group.id,
        displayName: group.displayName,
        description: group.description ?? undefined,
        ruleExpression: group.ruleExpression,
        memberCount,
        createdAt: group.createdAt.toISOString(),
        updatedAt: iso(group.lastEvaluatedAt),
        lastEvaluatedAt: iso(group.lastEvaluatedAt),
    };
}

export async function listDynamicGroups(db: Database) {
    const groups = await db
        .select()
        .from(dynamicComputerGroups)
        .orderBy(asc(dynamicComputerGroups.createdAt), asc(dynamicComputerGroups.id));
    const counts = await dynamicMemberCounts(db, groups.map((group) => group.id));
    return groups.map((group) => toDynamicGroupListItem(group, counts.get(group.id) ?? 0));
}

export async function listDynamicGroupsPaginated(db: Database, args: { cursor?: string; numItems: number }) {
    const result = await paginate({
        ...args,
        desc: true,
        sortKey: dynamicComputerGroups.createdAt,
        idKey: dynamicComputerGroups.id,
        sortValue: (row: DynamicComputerGroupRow) => row.createdAt.toISOString(),
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) =>
            db.select().from(dynamicComputerGroups).where(where).orderBy(...orderBy).limit(limit),
    });
    const counts = await dynamicMemberCounts(db, result.page.map((group) => group.id));
    return mapPage(result, (group) => toDynamicGroupListItem(group, counts.get(group.id) ?? 0));
}

export async function getDynamicGroup(db: Database, id: string) {
    const [group] = await db.select().from(dynamicComputerGroups).where(eq(dynamicComputerGroups.id, id));
    if (!group) return null;
    return {
        id: group.id,
        displayName: group.displayName,
        description: group.description ?? undefined,
        ruleExpression: group.ruleExpression,
        lastEvaluatedAt: group.lastEvaluatedAt?.getTime(),
        createdAt: group.createdAt.getTime(),
    };
}

export async function listDynamicMembers(db: Database, groupId: string, args: { cursor?: string; numItems: number }) {
    type MemberRow = { computerId: string; addedAt: Date; name: string | null; os: string | null; ip: string | null };
    const result = await paginate({
        ...args,
        desc: true,
        sortKey: dynamicGroupMembers.addedAt,
        idKey: dynamicGroupMembers.computerId,
        sortValue: (row: MemberRow) => row.addedAt.toISOString(),
        idValue: (row) => row.computerId,
        query: ({ where, orderBy, limit }) =>
            db
                .select({
                    computerId: dynamicGroupMembers.computerId,
                    addedAt: dynamicGroupMembers.addedAt,
                    name: computers.name,
                    os: computers.os,
                    ip: computers.ip,
                })
                .from(dynamicGroupMembers)
                .leftJoin(computers, eq(computers.id, dynamicGroupMembers.computerId))
                .where(and(eq(dynamicGroupMembers.groupId, groupId), where))
                .orderBy(...orderBy)
                .limit(limit),
    });
    return mapPage(result, (member) => ({
        computerId: member.computerId,
        addedAt: member.addedAt.getTime(),
        computer: member.name !== null
            ? { id: member.computerId, name: member.name, os: member.os ?? undefined, ip: member.ip ?? undefined }
            : null,
    }));
}

/** Computers that would match a rule right now, without saving anything. */
export async function previewRuleMatches(db: Database, ruleExpression: unknown, asOf: number) {
    const rule = parseRuleExpression(ruleExpression);
    const rows = await listComputers(db);
    return rows
        .filter((computer) => evaluateRule(rule, toRuleSubject(computer), asOf))
        .map((c) => ({
            id: c.id,
            name: c.name,
            os: c.os ?? undefined,
            osVersion: c.osVersion ?? undefined,
            ip: c.ip ?? undefined,
            loginUser: c.loginUser ?? undefined,
        }));
}

async function assertDynamicNameFree(tx: Database, displayName: string, exceptId?: string) {
    const [duplicate] = await tx
        .select({ id: dynamicComputerGroups.id })
        .from(dynamicComputerGroups)
        .where(and(
            eq(dynamicComputerGroups.displayName, displayName),
            exceptId ? ne(dynamicComputerGroups.id, exceptId) : undefined,
        ))
        .limit(1);
    if (duplicate) throw new DomainError(DUPLICATE_NAME);
}

export async function createDynamicGroup(
    db: Database,
    args: { displayName: string; description?: string; ruleExpression: unknown },
) {
    const ruleExpression = parseRuleExpression(args.ruleExpression);
    return db.transaction(async (tx) => {
        await assertDynamicNameFree(tx, args.displayName);
        const [group] = await tx
            .insert(dynamicComputerGroups)
            .values({ displayName: args.displayName, description: args.description, ruleExpression })
            .returning({ id: dynamicComputerGroups.id });
        await refreshGroupMembership(tx, group.id);
        return { id: group.id };
    });
}

export async function updateDynamicGroup(
    db: Database,
    id: string,
    args: { displayName?: string; description?: string; ruleExpression?: unknown },
) {
    const ruleExpression = args.ruleExpression !== undefined ? parseRuleExpression(args.ruleExpression) : undefined;
    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(dynamicComputerGroups)
            .where(eq(dynamicComputerGroups.id, id))
            .for("update");
        if (!existing) throw new DomainError("Group not found");

        if (args.displayName && args.displayName !== existing.displayName) {
            await assertDynamicNameFree(tx, args.displayName, id);
        }

        const updates: Partial<typeof dynamicComputerGroups.$inferInsert> = {};
        if (args.displayName !== undefined) updates.displayName = args.displayName;
        if (args.description !== undefined) updates.description = args.description;
        if (ruleExpression !== undefined) updates.ruleExpression = ruleExpression;
        if (Object.keys(updates).length > 0) {
            await tx.update(dynamicComputerGroups).set(updates).where(eq(dynamicComputerGroups.id, id));
        }

        if (ruleExpression !== undefined) {
            await refreshGroupMembership(tx, id);
        }
        return { success: true };
    });
}

export async function removeDynamicGroup(db: Database, id: string) {
    await db.delete(dynamicComputerGroups).where(eq(dynamicComputerGroups.id, id));
    return { success: true };
}

/** Group IDs a computer belongs to, oldest membership first, for app assignment resolution. */
export async function membershipsOfComputer(db: Database, computerId: string) {
    const [staticRows, dynamicRows] = await Promise.all([
        db
            .select({ groupId: computerGroupMembers.groupId })
            .from(computerGroupMembers)
            .where(eq(computerGroupMembers.computerId, computerId))
            .orderBy(asc(computerGroupMembers.createdAt), asc(computerGroupMembers.groupId)),
        db
            .select({ groupId: dynamicGroupMembers.groupId })
            .from(dynamicGroupMembers)
            .where(eq(dynamicGroupMembers.computerId, computerId))
            .orderBy(asc(dynamicGroupMembers.addedAt), asc(dynamicGroupMembers.groupId)),
    ]);
    return {
        staticGroupIds: staticRows.map((row) => row.groupId),
        dynamicGroupIds: dynamicRows.map((row) => row.groupId),
    };
}
