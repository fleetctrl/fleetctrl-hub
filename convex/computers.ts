/**
 * Computers Module
 *
 * Handles computer CRUD operations.
 */

import { internalQuery } from "./_generated/server";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { computerCountAggregate } from "./lib/aggregate/computerAggregate";
import { internalMutation } from "./functions";
import { Doc } from "./_generated/dataModel";
import { normalizeTableId } from "./lib/idNormalization";

type ComputerDoc = Doc<"computers">;

// ========================================
// Public Queries
// ========================================

/**
 * List all computers (simple version).
 */
export const list = withAuthQuery({
    handler: async (ctx) => {
        const computers = await ctx.db.query("computers").collect();

        return computers.map((c) => ({
            id: c._id,
            deviceId: c._id,
            name: c.name,
            rustdeskId: c.rustdesk_id,
            ip: c.ip,
            os: c.os,
            osVersion: c.os_version,
            loginUser: c.login_user,
            clientVersion: c.client_version,
            lastConnection: c.last_connection,
            intuneId: c.intune_id,
            createdAt: c._creationTime,
        }));
    },
});

/**
 * Paginated list for admin table.
 * Supports filtering by login_user and sorting.
 */
export const listPaginated = withAuthQuery({
    args: {
        filter: v.optional(v.string()),
        sortField: v.optional(v.string()),
        sortDesc: v.optional(v.boolean()),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { filter, sortField, sortDesc, paginationOpts }) => {
        const lowerFilter = filter?.toLowerCase();
        const pageSize = paginationOpts.numItems;

        const sortItems = (items: ComputerDoc[]) => {
            if (!sortField) {
                return items;
            }

            return [...items].sort((a, b) => {
                let aVal: unknown;
                let bVal: unknown;

                switch (sortField) {
                    case "name":
                        aVal = a.name;
                        bVal = b.name;
                        break;
                    case "rustdeskID":
                        aVal = a.rustdesk_id;
                        bVal = b.rustdesk_id;
                        break;
                    case "ip":
                        aVal = a.ip;
                        bVal = b.ip;
                        break;
                    case "os":
                        aVal = a.os;
                        bVal = b.os;
                        break;
                    case "osVersion":
                        aVal = a.os_version;
                        bVal = b.os_version;
                        break;
                    case "loginUser":
                        aVal = a.login_user;
                        bVal = b.login_user;
                        break;
                    case "lastConnection":
                        aVal = a.last_connection;
                        bVal = b.last_connection;
                        break;
                    default:
                        return 0;
                }

                if (aVal === undefined || aVal === null) return 1;
                if (bVal === undefined || bVal === null) return -1;

                const comparison =
                    typeof aVal === "string"
                        ? aVal.localeCompare(bVal as string)
                        : (aVal as number) - (bVal as number);

                return sortDesc ? -comparison : comparison;
            });
        };

        const matchesFilter = (computer: ComputerDoc) => {
            if (!lowerFilter) {
                return true;
            }

            return (
                computer.login_user?.toLowerCase().includes(lowerFilter) ||
                computer.name?.toLowerCase().includes(lowerFilter)
            );
        };

        const requiresInMemoryPagination = Boolean(lowerFilter || sortField);

        let items: ComputerDoc[] = [];
        let continueCursor: string | null = paginationOpts.cursor;
        let isDone = false;
        let total = 0;

        if (requiresInMemoryPagination) {
            const allComputers = await ctx.db.query("computers").collect();
            const filteredComputers = allComputers.filter(matchesFilter);
            const sortedComputers = sortItems(filteredComputers);

            const offset = paginationOpts.cursor ? Number.parseInt(paginationOpts.cursor, 10) : 0;
            const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

            total = sortedComputers.length;
            items = sortedComputers.slice(safeOffset, safeOffset + pageSize);
            isDone = safeOffset + pageSize >= total;
            continueCursor = isDone ? null : String(safeOffset + pageSize);
        } else {
            const { page, continueCursor: nextCursor, isDone: pageDone } = await ctx.db
                .query("computers")
                .order(sortDesc ? "desc" : "asc")
                .paginate({
                    numItems: pageSize,
                    cursor: paginationOpts.cursor,
                });

            items = page;
            continueCursor = nextCursor;
            isDone = pageDone;
            total = await computerCountAggregate.count(ctx, {
                namespace: null,
            });
        }

        return {
            page: items.map((c) => ({
                id: c._id,
                deviceId: c._id,
                rustdeskID: c.rustdesk_id,
                name: c.name,
                ip: c.ip,
                os: c.os,
                osVersion: c.os_version,
                loginUser: c.login_user,
                lastConnection: c.last_connection,
                clientVersion: c.client_version,
                intuneId: c.intune_id,
            })),
            continueCursor,
            isDone,
            total,
        };
    },
});

/**
 * Get a computer by ID.
 */
export const getById = withAuthQuery({
    args: { id: v.id("computers") },
    handler: async (ctx, { id }) => {
        const computer = await ctx.db.get("computers", id);
        if (!computer) return null;

        return {
            id: computer._id,
            deviceId: computer._id,
            name: computer.name,
            rustdeskId: computer.rustdesk_id,
            ip: computer.ip,
            os: computer.os,
            osVersion: computer.os_version,
            loginUser: computer.login_user,
            clientVersion: computer.client_version,
            lastConnection: computer.last_connection,
            intuneId: computer.intune_id,
            createdAt: computer._creationTime,
        };
    },
});

// ========================================
// Public Mutations
// ========================================

/**
 * Update computer with RustDesk sync data.
 */
export const rustdeskSync = internalMutation({
    args: {
        computerId: v.string(),
        data: v.object({
            rustdesk_id: v.optional(v.union(v.number(), v.string())),
            name: v.optional(v.string()),
            ip: v.optional(v.string()),
            os: v.optional(v.string()),
            os_version: v.optional(v.string()),
            login_user: v.optional(v.string()),
            client_version: v.optional(v.string()),
            intune_id: v.optional(v.string()),
        }),
    },
    handler: async (ctx, { computerId, data }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const computer = await ctx.db.get("computers", normalizedComputerId);

        if (!computer) {
            throw new Error("Computer not found");
        }

        const updates: Record<string, unknown> = {
            // Keep connection freshness on every sync call.
            last_connection: Date.now(),
        };
        let shouldRefreshDynamicGroups = false;

        if (data.rustdesk_id !== undefined) {
            // Handle RustDesk ID being sent as string
            let rid = data.rustdesk_id;
            if (typeof rid === "string") {
                rid = parseInt(rid, 10);
            }
            if (!isNaN(rid) && computer.rustdesk_id !== rid) {
                updates.rustdesk_id = rid;
            }
        }
        if (data.name !== undefined && computer.name !== data.name) {
            updates.name = data.name;
            shouldRefreshDynamicGroups = true;
        }
        if (data.ip !== undefined && computer.ip !== data.ip) {
            updates.ip = data.ip;
            shouldRefreshDynamicGroups = true;
        }
        if (data.os !== undefined && computer.os !== data.os) {
            updates.os = data.os;
            shouldRefreshDynamicGroups = true;
        }
        if (data.os_version !== undefined && computer.os_version !== data.os_version) {
            updates.os_version = data.os_version;
            shouldRefreshDynamicGroups = true;
        }
        if (data.login_user !== undefined && computer.login_user !== data.login_user) {
            updates.login_user = data.login_user;
            shouldRefreshDynamicGroups = true;
        }
        if (data.client_version !== undefined && computer.client_version !== data.client_version) {
            updates.client_version = data.client_version;
            shouldRefreshDynamicGroups = true;
        }
        if (data.intune_id !== undefined && computer.intune_id !== data.intune_id) {
            updates.intune_id = data.intune_id;
            shouldRefreshDynamicGroups = true;
        }

        await ctx.db.patch("computers", computer._id, updates);

        // Only refresh memberships if rule-relevant fields changed.
        if (shouldRefreshDynamicGroups) {
            await ctx.scheduler.runAfter(0, internal.groups.refreshComputerMemberships, {
                computerId: computer._id,
            });
        }

        return { success: true };
    },
});

/**
 * Delete a computer.
 */
export const remove = withAuthMutation({
    args: { id: v.id("computers") },
    handler: async (ctx, { id }) => {
        // Delete related data first
        // Refresh tokens
        const refreshTokens = await ctx.db
            .query("refresh_tokens")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const token of refreshTokens) {
            await ctx.db.delete("refresh_tokens", token._id);
        }

        // Tasks
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const task of tasks) {
            await ctx.db.delete("tasks", task._id);
        }

        // Static group memberships
        const staticMemberships = await ctx.db
            .query("computer_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const membership of staticMemberships) {
            await ctx.db.delete("computer_group_members", membership._id);
        }

        // Dynamic group memberships
        const dynamicMemberships = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const membership of dynamicMemberships) {
            await ctx.db.delete("dynamic_group_members", membership._id);
        }

        // Delete computer
        await ctx.db.delete("computers", id);

        return { success: true };
    },
});

// ========================================
// Internal Mutations (for auth/http)
// ========================================

/**
 * Update client version for a computer.
 */
export const updateClientVersion = internalMutation({
    args: {
        computerId: v.string(),
        clientVersion: v.string(),
    },
    handler: async (ctx, { computerId, clientVersion }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );
        const computer = await ctx.db.get("computers", normalizedComputerId);

        if (computer) {
            const clientVersionChanged = computer.client_version !== clientVersion;
            await ctx.db.patch("computers", computer._id, {
                ...(clientVersionChanged ? { client_version: clientVersion } : {}),
                last_connection: Date.now(),
            });

            if (clientVersionChanged) {
                await ctx.scheduler.runAfter(0, internal.groups.refreshComputerMemberships, {
                    computerId: computer._id,
                });
            }
        }
    },
});

export const getByJkt = internalQuery({
    args: { jkt: v.string() },
    handler: async (ctx, { jkt }) => {
        return await ctx.db
            .query("computers")
            .withIndex("by_jkt", (q) => q.eq("jkt", jkt))
            .first();
    },
});
