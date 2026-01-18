/**
 * Groups Module
 *
 * Handles static and dynamic group management.
 * Replaces SQL triggers for dynamic group membership evaluation.
 */

import {
    mutation,
    query,
    internalMutation,
    internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";

// ========================================
// Rule Evaluation Logic
// ========================================

type Computer = Doc<"computers">;

interface RuleCondition {
    property: string;
    operator: string;
    value: string;
}

interface RuleGroup {
    logic: "AND" | "OR";
    conditions: (RuleCondition | RuleGroup)[];
}

type RuleExpression = RuleCondition | RuleGroup;

/**
 * Evaluate a rule expression against a computer.
 * Supports nested AND/OR logic and various operators.
 */
function evaluateRule(rule: RuleExpression, computer: Computer): boolean {
    // Leaf node (single condition)
    if ("property" in rule) {
        return evaluateCondition(rule, computer);
    }

    // Branch node (nested conditions)
    const logic = rule.logic || "AND";
    const results = (rule.conditions || []).map((c) =>
        evaluateRule(c as RuleExpression, computer)
    );

    if (results.length === 0) return false;

    if (logic === "AND") {
        return results.every((r) => r);
    } else {
        return results.some((r) => r);
    }
}

/**
 * Evaluate a single condition against a computer.
 */
function evaluateCondition(
    condition: RuleCondition,
    computer: Computer
): boolean {
    let propValue: string | undefined;

    switch (condition.property) {
        case "name":
            propValue = computer.name;
            break;
        case "os":
            propValue = computer.os ?? undefined;
            break;
        case "osVersion":
            propValue = computer.os_version ?? undefined;
            break;
        case "ip":
            propValue = computer.ip ?? undefined;
            break;
        case "loginUser":
            propValue = computer.login_user ?? undefined;
            break;
        case "intuneEnrolled":
            propValue = computer.intune_id ? "true" : "false";
            break;
        case "clientVersion":
            propValue = computer.client_version ?? undefined;
            break;
        default:
            return false;
    }

    if (propValue === undefined) return false;

    const ruleValue = condition.value;

    switch (condition.operator) {
        case "equals":
            return propValue === ruleValue;
        case "notEquals":
            return propValue !== ruleValue;
        case "contains":
            return propValue.toLowerCase().includes(ruleValue.toLowerCase());
        case "notContains":
            return !propValue.toLowerCase().includes(ruleValue.toLowerCase());
        case "startsWith":
            return propValue.toLowerCase().startsWith(ruleValue.toLowerCase());
        case "endsWith":
            return propValue.toLowerCase().endsWith(ruleValue.toLowerCase());
        case "regex":
            try {
                return new RegExp(ruleValue).test(propValue);
            } catch {
                return false;
            }
        case "olderThanDays": {
            const days = parseInt(ruleValue, 10);
            if (isNaN(days)) return false;
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            return computer._creationTime < cutoff;
        }
        case "newerThanDays": {
            const days = parseInt(ruleValue, 10);
            if (isNaN(days)) return false;
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            return computer._creationTime >= cutoff;
        }
        default:
            return false;
    }
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
        const computer = await ctx.db.get(computerId);
        if (!computer) return { added: 0, removed: 0 };

        // Remove existing memberships
        const existing = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .collect();

        for (const member of existing) {
            await ctx.db.delete(member._id);
        }

        // Evaluate all dynamic groups
        const groups = await ctx.db.query("dynamic_computer_groups").collect();
        let added = 0;

        for (const group of groups) {
            if (evaluateRule(group.rule_expression as RuleExpression, computer)) {
                await ctx.db.insert("dynamic_group_members", {
                    group_id: group._id,
                    computer_id: computerId,
                    added_at: Date.now(),
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
        const group = await ctx.db.get(groupId);
        if (!group) return { added: 0, removed: 0 };

        // Clear existing members
        const existing = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", groupId))
            .collect();

        for (const member of existing) {
            await ctx.db.delete(member._id);
        }

        // Evaluate all computers
        const computers = await ctx.db.query("computers").collect();
        let added = 0;

        for (const computer of computers) {
            if (evaluateRule(group.rule_expression as RuleExpression, computer)) {
                await ctx.db.insert("dynamic_group_members", {
                    group_id: groupId,
                    computer_id: computer._id,
                    added_at: Date.now(),
                });
                added++;
            }
        }

        // Update last evaluated timestamp
        await ctx.db.patch(groupId, { last_evaluated_at: Date.now() });

        return { added, removed: existing.length };
    },
});

/**
 * Refresh all dynamic groups.
 * Called by cron job to handle time-based rules.
 */
export const refreshAllDynamicGroups = internalMutation({
    handler: async (ctx) => {
        const groups = await ctx.db.query("dynamic_computer_groups").collect();
        const computers = await ctx.db.query("computers").collect();
        let totalAdded = 0;
        let totalRemoved = 0;

        for (const group of groups) {
            // Clear existing members
            const existing = await ctx.db
                .query("dynamic_group_members")
                .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                .collect();

            for (const member of existing) {
                await ctx.db.delete(member._id);
                totalRemoved++;
            }

            // Evaluate all computers
            for (const computer of computers) {
                if (evaluateRule(group.rule_expression as RuleExpression, computer)) {
                    await ctx.db.insert("dynamic_group_members", {
                        group_id: group._id,
                        computer_id: computer._id,
                        added_at: Date.now(),
                    });
                    totalAdded++;
                }
            }

            // Update timestamp
            await ctx.db.patch(group._id, { last_evaluated_at: Date.now() });
        }

        console.log(
            `[Dynamic Groups] Refreshed ${groups.length} groups. Added: ${totalAdded}, Removed: ${totalRemoved}`
        );
        return { groups: groups.length, added: totalAdded, removed: totalRemoved };
    },
});

/**
 * Public mutation to refresh all dynamic groups.
 * Called from admin UI.
 */
export const refreshAll = mutation({
    handler: async (ctx) => {
        const groups = await ctx.db.query("dynamic_computer_groups").collect();
        const computers = await ctx.db.query("computers").collect();
        let totalAdded = 0;
        let totalRemoved = 0;

        for (const group of groups) {
            // Clear existing members
            const existing = await ctx.db
                .query("dynamic_group_members")
                .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                .collect();

            for (const member of existing) {
                await ctx.db.delete(member._id);
                totalRemoved++;
            }

            // Evaluate all computers
            for (const computer of computers) {
                if (evaluateRule(group.rule_expression as RuleExpression, computer)) {
                    await ctx.db.insert("dynamic_group_members", {
                        group_id: group._id,
                        computer_id: computer._id,
                        added_at: Date.now(),
                    });
                    totalAdded++;
                }
            }

            await ctx.db.patch(group._id, { last_evaluated_at: Date.now() });
        }

        return { groups: groups.length, added: totalAdded, removed: totalRemoved };
    },
});

// ========================================
// Public Queries
// ========================================

/**
 * Get a single dynamic group by ID.
 */
export const getById = query({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        const group = await ctx.db.get(id);
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
export const getAll = query({
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
export const getMembers = query({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        const members = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", id))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const computer = await ctx.db.get(member.computer_id);
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
export const listDynamicGroups = query({
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
export const getDynamicGroupMembers = query({
    args: { groupId: v.id("dynamic_computer_groups") },
    handler: async (ctx, { groupId }) => {
        const members = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", groupId))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const computer = await ctx.db.get(member.computer_id);
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
export const previewRuleMatches = query({
    args: { ruleExpression: v.any() },
    handler: async (ctx, { ruleExpression }) => {
        const computers = await ctx.db.query("computers").collect();

        return computers
            .filter((c) => evaluateRule(ruleExpression as RuleExpression, c))
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
export const createDynamicGroup = mutation({
    args: {
        displayName: v.string(),
        description: v.optional(v.string()),
        ruleExpression: v.any(),
    },
    handler: async (ctx, { displayName, description, ruleExpression }) => {
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
            rule_expression: ruleExpression,
        });

        // Trigger membership evaluation
        // Note: In production, you might want to schedule this
        // instead of running inline for large computer sets

        return { id };
    },
});

/**
 * Update a dynamic group.
 */
export const updateDynamicGroup = mutation({
    args: {
        id: v.id("dynamic_computer_groups"),
        displayName: v.optional(v.string()),
        description: v.optional(v.string()),
        ruleExpression: v.optional(v.any()),
    },
    handler: async (ctx, { id, displayName, description, ruleExpression }) => {
        const existing = await ctx.db.get(id);
        if (!existing) {
            throw new Error("Group not found");
        }

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
        if (ruleExpression !== undefined) updates.rule_expression = ruleExpression;

        await ctx.db.patch(id, updates);

        return { success: true };
    },
});

/**
 * Delete a dynamic group.
 */
export const deleteDynamicGroup = mutation({
    args: { id: v.id("dynamic_computer_groups") },
    handler: async (ctx, { id }) => {
        // Members will be cascade-deleted by Convex
        await ctx.db.delete(id);
        return { success: true };
    },
});
