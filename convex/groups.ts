/**
 * Groups Module
 *
 * Handles static and dynamic group management.
 * Replaces SQL triggers for dynamic group membership evaluation.
 */
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";
import {
    evaluateRule,
    parseRuleExpression,
} from "./lib/groupRules";
import { paginationOptsValidator } from "convex/server";

async function refreshSingleGroupMembership(
    ctx: MutationCtx,
    group: Doc<"dynamic_computer_groups">,
    computers: Doc<"computers">[]
) {
    // Index existing members by computer; any duplicate rows get removed below.
    const existingByComputer = new Map<Id<"computers">, Id<"dynamic_group_members">>();
    const toRemove: Id<"dynamic_group_members">[] = [];
    for await (const member of ctx.db
        .query("dynamic_group_members")
        .withIndex("by_group_id", (q) => q.eq("group_id", group._id))) {
        if (existingByComputer.has(member.computer_id)) {
            toRemove.push(member._id);
        } else {
            existingByComputer.set(member.computer_id, member._id);
        }
    }

    const parsedRuleExpression = parseRuleExpression(group.rule_expression);
    const evaluatedAt = Date.now();
    let added = 0;

    // Only write the difference, so unchanged memberships don't churn and
    // don't invalidate every query reading them.
    for (const computer of computers) {
        const matches = evaluateRule(parsedRuleExpression, computer, evaluatedAt);
        const memberId = existingByComputer.get(computer._id);
        if (matches && !memberId) {
            await ctx.db.insert("dynamic_group_members", {
                group_id: group._id,
                computer_id: computer._id,
                added_at: evaluatedAt,
            });
            added++;
        } else if (!matches && memberId) {
            toRemove.push(memberId);
        }
        existingByComputer.delete(computer._id);
    }

    // Members whose computer no longer exists.
    toRemove.push(...existingByComputer.values());

    for (const memberId of toRemove) {
        await ctx.db.delete("dynamic_group_members", memberId);
    }

    await ctx.db.patch("dynamic_computer_groups", group._id, {
        last_evaluated_at: evaluatedAt,
    });

    return { added, removed: toRemove.length };
}

/**
 * Schedule one refresh per group, so each group gets its own transaction
 * instead of the whole fleet × all groups having to fit into one.
 */
async function scheduleAllGroupRefreshes(ctx: MutationCtx) {
    let groups = 0;
    for await (const group of ctx.db.query("dynamic_computer_groups")) {
        await ctx.scheduler.runAfter(0, internal.groups.refreshGroupMembership, {
            groupId: group._id,
        });
        groups++;
    }
    return { groups };
}

// ========================================
// Internal Mutations (for triggers/crons)
// ========================================

/**
 * Refresh membership for a single computer across all dynamic groups.
 * Called when a computer is created or updated.
 */
export const refreshComputerMemberships = internalMutation({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
        const computer = await ctx.db.get("computers", computerId);
        if (!computer) return { added: 0, removed: 0 };

        // Index existing memberships by group; any duplicate rows get removed below.
        const existingByGroup = new Map<Id<"dynamic_computer_groups">, Id<"dynamic_group_members">>();
        const toRemove: Id<"dynamic_group_members">[] = [];
        for await (const member of ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))) {
            if (existingByGroup.has(member.group_id)) {
                toRemove.push(member._id);
            } else {
                existingByGroup.set(member.group_id, member._id);
            }
        }

        // Evaluate all dynamic groups and only write the difference
        let added = 0;
        const evaluatedAt = Date.now();

        for await (const group of ctx.db.query("dynamic_computer_groups")) {
            const parsedRuleExpression = parseRuleExpression(group.rule_expression);
            const matches = evaluateRule(parsedRuleExpression, computer, evaluatedAt);
            const memberId = existingByGroup.get(group._id);
            if (matches && !memberId) {
                await ctx.db.insert("dynamic_group_members", {
                    group_id: group._id,
                    computer_id: computerId,
                    added_at: evaluatedAt,
                });
                added++;
            } else if (!matches && memberId) {
                toRemove.push(memberId);
            }
            existingByGroup.delete(group._id);
        }

        // Memberships of groups that no longer exist.
        toRemove.push(...existingByGroup.values());

        for (const memberId of toRemove) {
            await ctx.db.delete("dynamic_group_members", memberId);
        }

        return { added, removed: toRemove.length };
    },
});

/**
 * Refresh all computers for a specific group.
 * Called when a group's rule expression is updated.
 */
export const refreshGroupMembership = internalMutation({
    args: { groupId: v.id("dynamic_computer_groups") },
    handler: async (ctx, { groupId }) => {
        const group = await ctx.db.get("dynamic_computer_groups", groupId);
        if (!group) return { added: 0, removed: 0 };
        const computers = await ctx.db.query("computers").collect();
        return await refreshSingleGroupMembership(ctx, group, computers);
    },
});

/**
 * Refresh all dynamic groups.
 * Called by cron job to handle time-based rules.
 */
export const refreshAllDynamicGroups = internalMutation({
    args: {},
    handler: async (ctx) => {
        const result = await scheduleAllGroupRefreshes(ctx);

        console.log(`[Dynamic Groups] Scheduled refresh of ${result.groups} groups`);
        return result;
    },
});

/**
 * Public mutation to refresh all dynamic groups.
 * Called from admin UI. Memberships update shortly after, as each group's
 * scheduled refresh runs.
 */
export const refreshAll = withAuthMutation({
    args: {},
    handler: async (ctx) => {
        return await scheduleAllGroupRefreshes(ctx);
    },
});

// ========================================
// Public Queries
// ========================================

/**
 * Get a single dynamic group by ID.
 */
export const getById = withAuthQuery({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        const group = await ctx.db.get("dynamic_computer_groups", id);
        if (!group) return null;

        return {
            id: group._id,
            displayName: group.display_name,
            description: group.description,
            ruleExpression: group.rule_expression,
            lastEvaluatedAt: group.last_evaluated_at,
            createdAt: group._creationTime,
        };
    },
});

/**
 * Get all dynamic groups - alias for listDynamicGroups for frontend compatibility.
 */
export const getAll = withAuthQuery({
    handler: async (ctx) => {
        const groups = await ctx.db.query("dynamic_computer_groups").collect();

        return Promise.all(
            groups.map(async (group) => {
                const members = await ctx.db
                    .query("dynamic_group_members")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                    .collect();

                return {
                    id: group._id,
                    displayName: group.display_name,
                    description: group.description,
                    ruleExpression: group.rule_expression,
                    memberCount: members.length,
                    createdAt: new Date(group._creationTime).toISOString(),
                    updatedAt: group.last_evaluated_at
                        ? new Date(group.last_evaluated_at).toISOString()
                        : null,
                    lastEvaluatedAt: group.last_evaluated_at
                        ? new Date(group.last_evaluated_at).toISOString()
                        : null,
                };
            })
        );
    },
});

export const getAllPaginated = withAuthQuery({
    args: { paginationOpts: paginationOptsValidator },
    handler: async (ctx, { paginationOpts }) => {
        const result = await ctx.db.query("dynamic_computer_groups").order("desc").paginate(paginationOpts);
        return {
            ...result,
            page: await Promise.all(result.page.map(async (group) => {
                const members = await ctx.db
                    .query("dynamic_group_members")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                    .collect();

                return {
                    id: group._id,
                    displayName: group.display_name,
                    description: group.description,
                    ruleExpression: group.rule_expression,
                    memberCount: members.length,
                    createdAt: new Date(group._creationTime).toISOString(),
                    updatedAt: group.last_evaluated_at ? new Date(group.last_evaluated_at).toISOString() : null,
                    lastEvaluatedAt: group.last_evaluated_at ? new Date(group.last_evaluated_at).toISOString() : null,
                };
            })),
        };
    },
});

/**
 * Get members for admin UI.
 */
export const getMembers = withAuthQuery({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        const members = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", id))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const computer = await ctx.db.get("computers", member.computer_id);
                return {
                    computerId: member.computer_id,
                    addedAt: member.added_at,
                    computer: computer
                        ? {
                            id: computer._id,
                            name: computer.name,
                            os: computer.os,
                            ip: computer.ip,
                        }
                        : null,
                };
            })
        );
    },
});

export const getMembersPaginated = withAuthQuery({
    args: { id: v.id("dynamic_computer_groups"), paginationOpts: paginationOptsValidator },
    handler: async (ctx, { id, paginationOpts }) => {
        const result = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", id))
            .order("desc")
            .paginate(paginationOpts);
        return {
            ...result,
            page: await Promise.all(result.page.map(async (member) => {
                const computer = await ctx.db.get("computers", member.computer_id);
                return {
                    computerId: member.computer_id,
                    addedAt: member.added_at,
                    computer: computer ? { id: computer._id, name: computer.name, os: computer.os, ip: computer.ip } : null,
                };
            })),
        };
    },
});
export const listDynamicGroups = withAuthQuery({
    handler: async (ctx) => {
        const groups = await ctx.db.query("dynamic_computer_groups").collect();

        return Promise.all(
            groups.map(async (group) => {
                const members = await ctx.db
                    .query("dynamic_group_members")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                    .collect();

                return {
                    id: group._id,
                    displayName: group.display_name,
                    description: group.description,
                    ruleExpression: group.rule_expression,
                    lastEvaluatedAt: group.last_evaluated_at,
                    memberCount: members.length,
                    createdAt: group._creationTime,
                };
            })
        );
    },
});

/**
 * Get members of a dynamic group.
 */
export const getDynamicGroupMembers = withAuthQuery({
    args: { groupId: v.id("dynamic_computer_groups") },
    handler: async (ctx, { groupId }) => {
        const members = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", groupId))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const computer = await ctx.db.get("computers", member.computer_id);
                return {
                    memberId: member._id,
                    addedAt: member.added_at,
                    computer: computer
                        ? {
                            id: computer._id,
                            name: computer.name,
                            os: computer.os,
                            ip: computer.ip,
                            loginUser: computer.login_user,
                        }
                        : null,
                };
            })
        );
    },
});

/**
 * Preview which computers would match a rule expression.
 */
export const previewRuleMatches = withAuthQuery({
    args: { ruleExpression: v.any(), asOf: v.number() },
    handler: async (ctx, { ruleExpression, asOf }) => {
        const parsedRuleExpression = parseRuleExpression(ruleExpression);
        const computers = await ctx.db.query("computers").collect();

        return computers
            .filter((c) => evaluateRule(parsedRuleExpression, c, asOf))
            .map((c) => ({
                id: c._id,
                name: c.name,
                os: c.os,
                osVersion: c.os_version,
                ip: c.ip,
                loginUser: c.login_user,
            }));
    },
});

// ========================================
// Public Mutations
// ========================================

/**
 * Create a new dynamic group.
 */
export const createDynamicGroup = withAuthMutation({
    args: {
        displayName: v.string(),
        description: v.optional(v.string()),
        ruleExpression: v.any(),
    },
    handler: async (ctx, { displayName, description, ruleExpression }) => {
        const parsedRuleExpression = parseRuleExpression(ruleExpression);

        // Check for duplicate name
        const existing = await ctx.db
            .query("dynamic_computer_groups")
            .withIndex("by_display_name", (q) => q.eq("display_name", displayName))
            .first();

        if (existing) {
            throw new Error("A group with this name already exists");
        }

        const id = await ctx.db.insert("dynamic_computer_groups", {
            display_name: displayName,
            description,
            rule_expression: parsedRuleExpression,
        });

        await ctx.scheduler.runAfter(0, internal.groups.refreshGroupMembership, {
            groupId: id,
        });

        return { id };
    },
});

/**
 * Update a dynamic group.
 */
export const updateDynamicGroup = withAuthMutation({
    args: {
        id: v.id("dynamic_computer_groups"),
        displayName: v.optional(v.string()),
        description: v.optional(v.string()),
        ruleExpression: v.optional(v.any()),
    },
    handler: async (ctx, { id, displayName, description, ruleExpression }) => {
        const existing = await ctx.db.get("dynamic_computer_groups", id);
        if (!existing) {
            throw new Error("Group not found");
        }

        const parsedRuleExpression =
            ruleExpression !== undefined
                ? parseRuleExpression(ruleExpression)
                : undefined;

        // Check for duplicate name if changing
        if (displayName && displayName !== existing.display_name) {
            const duplicate = await ctx.db
                .query("dynamic_computer_groups")
                .withIndex("by_display_name", (q) => q.eq("display_name", displayName))
                .first();

            if (duplicate) {
                throw new Error("A group with this name already exists");
            }
        }

        const updates: Partial<Doc<"dynamic_computer_groups">> = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (description !== undefined) updates.description = description;
        if (parsedRuleExpression !== undefined) {
            updates.rule_expression = parsedRuleExpression;
        }

        await ctx.db.patch("dynamic_computer_groups", id, updates);

        if (parsedRuleExpression !== undefined) {
            await ctx.scheduler.runAfter(0, internal.groups.refreshGroupMembership, {
                groupId: id,
            });
        }

        return { success: true };
    },
});

/**
 * Delete a dynamic group.
 */
export const deleteDynamicGroup = withAuthMutation({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        // Members will be cascade-deleted by Convex
        await ctx.db.delete("dynamic_computer_groups", id);
        return { success: true };
    },
});
