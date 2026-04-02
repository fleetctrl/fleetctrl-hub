/**
 * Groups Module
 *
 * Handles static and dynamic group management.
 * Replaces SQL triggers for dynamic group membership evaluation.
 */
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";
import {
    evaluateRule,
    parseRuleExpression,
} from "./lib/groupRules";

async function refreshSingleGroupMembership(
    ctx: MutationCtx,
    group: Doc<"dynamic_computer_groups">,
    computers: Doc<"computers">[]
) {
    const existing = await ctx.db
        .query("dynamic_group_members")
        .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
        .collect();

    for (const member of existing) {
        await ctx.db.delete("dynamic_group_members", member._id);
    }

    const parsedRuleExpression = parseRuleExpression(group.rule_expression);
    const evaluatedAt = Date.now();
    let added = 0;

    for (const computer of computers) {
        if (evaluateRule(parsedRuleExpression, computer, evaluatedAt)) {
            await ctx.db.insert("dynamic_group_members", {
                group_id: group._id,
                computer_id: computer._id,
                added_at: evaluatedAt,
            });
            added++;
        }
    }

    await ctx.db.patch("dynamic_computer_groups", group._id, {
        last_evaluated_at: evaluatedAt,
    });

    return { added, removed: existing.length };
}

async function refreshAllGroupMemberships(
    ctx: MutationCtx
) {
    const groups = await ctx.db.query("dynamic_computer_groups").collect();
    const computers = await ctx.db.query("computers").collect();
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const group of groups) {
        const result = await refreshSingleGroupMembership(ctx, group, computers);
        totalAdded += result.added;
        totalRemoved += result.removed;
    }

    return { groups: groups.length, added: totalAdded, removed: totalRemoved };
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

        // Remove existing memberships
        const existing = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .collect();

        for (const member of existing) {
            await ctx.db.delete("dynamic_group_members", member._id);
        }

        // Evaluate all dynamic groups
        const groups = await ctx.db.query("dynamic_computer_groups").collect();
        let added = 0;
        const evaluatedAt = Date.now();

        for (const group of groups) {
            const parsedRuleExpression = parseRuleExpression(group.rule_expression);
            if (evaluateRule(parsedRuleExpression, computer, evaluatedAt)) {
                await ctx.db.insert("dynamic_group_members", {
                    group_id: group._id,
                    computer_id: computerId,
                    added_at: evaluatedAt,
                });
                added++;
            }
        }

        return { added, removed: existing.length };
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
    handler: async (ctx) => {
        const result = await refreshAllGroupMemberships(ctx);

        console.log(
            `[Dynamic Groups] Refreshed ${result.groups} groups. Added: ${result.added}, Removed: ${result.removed}`
        );
        return result;
    },
});

/**
 * Public mutation to refresh all dynamic groups.
 * Called from admin UI.
 */
export const refreshAll = withAuthMutation({
    handler: async (ctx): Promise<{ groups: number; added: number; removed: number }> => {
        const result = await ctx.runMutation(internal.groups.refreshAllDynamicGroups, {});
        return result;
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
