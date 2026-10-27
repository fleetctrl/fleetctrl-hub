import { eq, sql } from "drizzle-orm";
import { getComputer, listComputers } from "@/features/computers/server";
import type { Database } from "@/server/db/client";
import { dynamicComputerGroups, dynamicGroupMembers, type DynamicComputerGroupRow } from "./schema";
import { evaluateRule, parseRuleExpression, toRuleSubject, type RuleSubject } from "./rules";

// Every rewrite of dynamic_group_members (cron, rule edits, inventory events) takes this lock, so
// concurrent rewrites queue instead of interleaving or deadlocking.
const MEMBERSHIP_LOCK_KEY = 727_274_001;

async function lockMemberships(tx: Database) {
    await tx.execute(sql`select pg_advisory_xact_lock(${MEMBERSHIP_LOCK_KEY})`);
}

async function replaceGroupMembers(
    tx: Database,
    group: DynamicComputerGroupRow,
    subjects: RuleSubject[],
    evaluatedAt: Date,
) {
    const removed = await tx
        .delete(dynamicGroupMembers)
        .where(eq(dynamicGroupMembers.groupId, group.id))
        .returning({ computerId: dynamicGroupMembers.computerId });

    const rule = parseRuleExpression(group.ruleExpression);
    const matches = subjects.filter((subject) => evaluateRule(rule, subject, evaluatedAt.getTime()));
    for (let index = 0; index < matches.length; index += 1000) {
        await tx.insert(dynamicGroupMembers).values(matches.slice(index, index + 1000).map((subject) => ({
            groupId: group.id,
            computerId: subject.id,
            addedAt: evaluatedAt,
        })));
    }

    await tx
        .update(dynamicComputerGroups)
        .set({ lastEvaluatedAt: evaluatedAt })
        .where(eq(dynamicComputerGroups.id, group.id));

    return { added: matches.length, removed: removed.length };
}

/** Re-evaluates one computer against every dynamic group (handler of `computer.ruleFieldsChanged`). */
export async function refreshComputerMemberships(tx: Database, computerId: string) {
    await lockMemberships(tx);
    const computer = await getComputer(tx, computerId);
    if (!computer) return { added: 0, removed: 0 };

    const removed = await tx
        .delete(dynamicGroupMembers)
        .where(eq(dynamicGroupMembers.computerId, computerId))
        .returning({ groupId: dynamicGroupMembers.groupId });

    const groups = await tx.select().from(dynamicComputerGroups);
    const subject = toRuleSubject(computer);
    const evaluatedAt = new Date();
    const matching = groups.filter((group) =>
        evaluateRule(parseRuleExpression(group.ruleExpression), subject, evaluatedAt.getTime()),
    );
    if (matching.length > 0) {
        await tx.insert(dynamicGroupMembers).values(matching.map((group) => ({
            groupId: group.id,
            computerId,
            addedAt: evaluatedAt,
        })));
    }

    return { added: matching.length, removed: removed.length };
}

/** Re-evaluates every computer for one group (after its rule changed). */
export async function refreshGroupMembership(tx: Database, groupId: string) {
    await lockMemberships(tx);
    const [group] = await tx.select().from(dynamicComputerGroups).where(eq(dynamicComputerGroups.id, groupId));
    if (!group) return { added: 0, removed: 0 };
    const subjects = (await listComputers(tx)).map(toRuleSubject);
    return replaceGroupMembers(tx, group, subjects, new Date());
}

/** Re-evaluates everything; the hourly job covers time-based rules (olderThanDays, ...). */
export async function refreshAllDynamicGroups(tx: Database) {
    await lockMemberships(tx);
    const groups = await tx.select().from(dynamicComputerGroups);
    const subjects = (await listComputers(tx)).map(toRuleSubject);
    let added = 0;
    let removed = 0;
    for (const group of groups) {
        const result = await replaceGroupMembers(tx, group, subjects, new Date());
        added += result.added;
        removed += result.removed;
    }
    return { groups: groups.length, added, removed };
}
