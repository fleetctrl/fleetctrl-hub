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

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

// ========================================
// Public Queries
// ========================================

/**
 * List all computers (simple version).
 */
export const list = withAuthQuery({
    handler: async (ctx) => {
        const computers = await ctx.db.query("computers").collect();
        const now = Date.now();
        const onlineThreshold = now - ONLINE_THRESHOLD_MS;

        return computers.map((c) => ({
            id: c._id,
            name: c.name,
            fingerprint: c.fingerprint,
            rustdeskId: c.rustdesk_id,
            ip: c.ip,
            os: c.os,
            osVersion: c.os_version,
            loginUser: c.login_user,
            clientVersion: c.client_version,
            lastConnection:
                c.last_connection && c.last_connection >= onlineThreshold
                    ? "Online"
                    : "Offline",
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
        const now = Date.now();
        const onlineThreshold = now - ONLINE_THRESHOLD_MS;
        const lowerFilter = filter?.toLowerCase();
        const pageSize = paginationOpts.numItems;
        const order = sortDesc ? "desc" : "asc";

        const sortItems = <T extends {
            name?: string;
            rustdesk_id?: number;
            ip?: string;
            os?: string;
            os_version?: string;
            login_user?: string;
            last_connection?: number;
        }>(items: T[]) => {
            if (!sortField) {
                return items;
            }

            items.sort((a, b) => {
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

            return items;
        };

        let items: Awaited<ReturnType<typeof ctx.db.query<"computers">>> extends never
            ? never[]
            : any[] = [];
        let continueCursor: string | null = paginationOpts.cursor;
        let isDone = false;
        let total: number;

        if (lowerFilter) {
            const allComputers = await ctx.db.query("computers").collect();
            const filteredComputers = sortItems(
                allComputers.filter(
                    (c) =>
                        c.login_user?.toLowerCase().includes(lowerFilter) ||
                        c.name?.toLowerCase().includes(lowerFilter)
                )
            );

            const offset = paginationOpts.cursor ? Number.parseInt(paginationOpts.cursor, 10) : 0;
            const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

            total = filteredComputers.length;
            items = filteredComputers.slice(safeOffset, safeOffset + pageSize);
            isDone = safeOffset + pageSize >= total;
            continueCursor = isDone ? null : String(safeOffset + pageSize);
        } else {
            const { page, continueCursor: nextCursor, isDone: pageDone } = await ctx.db
                .query("computers")
                .order(order)
                .paginate({
                    numItems: pageSize,
                    cursor: paginationOpts.cursor,
                });

            items = sortItems(page);
            continueCursor = nextCursor;
            isDone = pageDone;
            total = await computerCountAggregate.count(ctx, {
                namespace: null,
            });
        }

        return {
            page: items.map((c) => ({
                id: c._id,
                rustdeskID: c.rustdesk_id,
                name: c.name,
                ip: c.ip,
                os: c.os,
                osVersion: c.os_version,
                loginUser: c.login_user,
                lastConnection:
                    c.last_connection && c.last_connection >= onlineThreshold
                        ? "Online"
                        : "Offline",
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
        const computer = await ctx.db.get(id);
        if (!computer) return null;

        return {
            id: computer._id,
            name: computer.name,
            fingerprint: computer.fingerprint,
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
        data: v.any(),
    },
    handler: async (ctx, { computerId, data }) => {
        // Find computer
        const computers = await ctx.db.query("computers").collect();
        const computer = computers.find((c) => c._id.toString() === computerId);

        if (!computer) {
            throw new Error("Computer not found");
        }

        const syncData = data as {
            rustdesk_id?: number | string;
            name?: string;
            ip?: string;
            os?: string;
            os_version?: string;
            login_user?: string;
        };

        const updates: Record<string, unknown> = {
            last_connection: Date.now(),
        };

        if (syncData.rustdesk_id !== undefined) {
            // Handle RustDesk ID being sent as string
            let rid = syncData.rustdesk_id;
            if (typeof rid === "string") {
                rid = parseInt(rid, 10);
            }
            if (!isNaN(rid)) {
                updates.rustdesk_id = rid;
            }
        }
        if (syncData.name !== undefined) {
            updates.name = syncData.name;
        }
        if (syncData.ip !== undefined) {
            updates.ip = syncData.ip;
        }
        if (syncData.os !== undefined) {
            updates.os = syncData.os;
        }
        if (syncData.os_version !== undefined) {
            updates.os_version = syncData.os_version;
        }
        if (syncData.login_user !== undefined) {
            updates.login_user = syncData.login_user;
        }
        // @ts-expect-error - dynamic field
        if (syncData.client_version !== undefined) {
            // @ts-expect-error - dynamic field
            updates.client_version = syncData.client_version;
        }

        await ctx.db.patch(computer._id, updates);

        // Trigger dynamic group membership refresh
        await ctx.scheduler.runAfter(0, internal.groups.refreshComputerMemberships, {
            computerId: computer._id,
        });

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
            await ctx.db.delete(token._id);
        }

        // Tasks
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const task of tasks) {
            await ctx.db.delete(task._id);
        }

        // Static group memberships
        const staticMemberships = await ctx.db
            .query("computer_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const membership of staticMemberships) {
            await ctx.db.delete(membership._id);
        }

        // Dynamic group memberships
        const dynamicMemberships = await ctx.db
            .query("dynamic_group_members")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const membership of dynamicMemberships) {
            await ctx.db.delete(membership._id);
        }

        // Delete computer
        await ctx.db.delete(id);

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
        const computers = await ctx.db.query("computers").collect();
        const computer = computers.find((c) => c._id.toString() === computerId);

        if (computer) {
            await ctx.db.patch(computer._id, {
                client_version: clientVersion,
                last_connection: Date.now(),
            });
        }
    },
});

// ========================================
// Internal Queries (for auth)
// ========================================

export const getByFingerprint = internalQuery({
    args: { fingerprint: v.string() },
    handler: async (ctx, { fingerprint }) => {
        return await ctx.db
            .query("computers")
            .withIndex("by_fingerprint", (q) =>
                q.eq("fingerprint", fingerprint)
            )
            .first();
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
