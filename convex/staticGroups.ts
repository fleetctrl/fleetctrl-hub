/**
 * Static Groups Module
 *
 * Handles static computer group management.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ========================================
// Public Queries
// ========================================

/**
 * Get all static groups with member counts.
 */
export const list = query({
    handler: async (ctx) => {
        const groups = await ctx.db.query("computer_groups").collect();

        return Promise.all(
            groups.map(async (group) => {
                const members = await ctx.db
                    .query("computer_group_members")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                    .collect();

                return {
                    id: group._id,
                    displayName: group.display_name,
                    description: group.description,
                    memberCount: members.length,
                    createdAt: group._creationTime,
                };
            })
        );
    },
});

/**
 * Get table data for admin UI.
 */
export const getTableData = query({
    handler: async (ctx) => {
        const groups = await ctx.db.query("computer_groups").collect();

        return Promise.all(
            groups.map(async (group) => {
                const memberRows = await ctx.db
                    .query("computer_group_members")
                    .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
                    .collect();

                const members = await Promise.all(
                    memberRows.map(async (m) => {
                        const computer = await ctx.db.get(m.computer_id);
                        return computer
                            ? {
                                id: computer._id,
                                name: computer.name,
                            }
                            : null;
                    })
                );

                return {
                    id: group._id,
                    displayName: group.display_name,
                    description: group.description,
                    members: members.filter(Boolean),
                    createdAt: group._creationTime,
                };
            })
        );
    },
});

/**
 * Get members of a static group.
 */
export const getMembers = query({
    args: { groupId: v.id("computer_groups") },
    handler: async (ctx, { groupId }) => {
        const members = await ctx.db
            .query("computer_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", groupId))
            .collect();

        return Promise.all(
            members.map(async (member) => {
                const computer = await ctx.db.get(member.computer_id);
                return computer
                    ? {
                        id: computer._id,
                        name: computer.name,
                        os: computer.os,
                        ip: computer.ip,
                        loginUser: computer.login_user,
                    }
                    : null;
            })
        ).then((results) => results.filter(Boolean));
    },
});

/**
 * Get all static groups for assignment dropdowns.
 */
export const getAllForAssignment = query({
    handler: async (ctx) => {
        const groups = await ctx.db.query("computer_groups").collect();

        return groups.map((g) => ({
            id: g._id,
            displayName: g.display_name,
        }));
    },
});

/**
 * Get computers for group assignment.
 */
export const getComputersForGroups = query({
    handler: async (ctx) => {
        const computers = await ctx.db.query("computers").collect();

        return computers.map((c) => ({
            id: c._id,
            name: c.name,
            os: c.os,
            ip: c.ip,
        }));
    },
});

// ========================================
// Public Mutations
// ========================================

/**
 * Create a new static group.
 */
export const create = mutation({
    args: {
        displayName: v.string(),
        description: v.optional(v.string()),
        memberIds: v.optional(v.array(v.id("computers"))),
    },
    handler: async (ctx, { displayName, description, memberIds }) => {
        // Check for duplicate name
        const existing = await ctx.db
            .query("computer_groups")
            .withIndex("by_display_name", (q) => q.eq("display_name", displayName))
            .first();

        if (existing) {
            throw new Error("A group with this name already exists");
        }

        const groupId = await ctx.db.insert("computer_groups", {
            display_name: displayName,
            description,
        });

        // Add members
        if (memberIds?.length) {
            for (const computerId of memberIds) {
                await ctx.db.insert("computer_group_members", {
                    group_id: groupId,
                    computer_id: computerId,
                });
            }
        }

        return { id: groupId };
    },
});

/**
 * Update a static group.
 */
export const edit = mutation({
    args: {
        id: v.id("computer_groups"),
        displayName: v.optional(v.string()),
        description: v.optional(v.string()),
        memberIds: v.optional(v.array(v.id("computers"))),
    },
    handler: async (ctx, { id, displayName, description, memberIds }) => {
        const existing = await ctx.db.get(id);
        if (!existing) {
            throw new Error("Group not found");
        }

        // Check for duplicate name if changing
        if (displayName && displayName !== existing.display_name) {
            const duplicate = await ctx.db
                .query("computer_groups")
                .withIndex("by_display_name", (q) => q.eq("display_name", displayName))
                .first();

            if (duplicate) {
                throw new Error("A group with this name already exists");
            }
        }

        // Update group
        const updates: Record<string, unknown> = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (description !== undefined) updates.description = description;

        if (Object.keys(updates).length > 0) {
            await ctx.db.patch(id, updates);
        }

        // Update members if provided
        if (memberIds !== undefined) {
            // Remove existing members
            const currentMembers = await ctx.db
                .query("computer_group_members")
                .withIndex("by_group_id", (q) => q.eq("group_id", id))
                .collect();

            for (const member of currentMembers) {
                await ctx.db.delete(member._id);
            }

            // Add new members
            for (const computerId of memberIds) {
                await ctx.db.insert("computer_group_members", {
                    group_id: id,
                    computer_id: computerId,
                });
            }
        }

        return { success: true };
    },
});

/**
 * Delete a static group.
 */
export const remove = mutation({
    args: { id: v.id("computer_groups") },
    handler: async (ctx, { id }) => {
        // Remove all members first
        const members = await ctx.db
            .query("computer_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", id))
            .collect();

        for (const member of members) {
            await ctx.db.delete(member._id);
        }

        // Remove release assignments
        const releases = await ctx.db
            .query("computer_group_releases")
            .withIndex("by_group_id", (q) => q.eq("group_id", id))
            .collect();

        for (const release of releases) {
            await ctx.db.delete(release._id);
        }

        // Delete group
        await ctx.db.delete(id);

        return { success: true };
    },
});
