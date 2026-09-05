/**
 * Computers Module
 *
 * Handles computer CRUD operations.
 */

import { hardwareValidator } from "./lib/hardware";
import { internalQuery } from "./_generated/server";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./functions";
import { normalizeTableId } from "./lib/idNormalization";
import type { Doc } from "./_generated/dataModel";

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
        const search = filter?.trim().toLowerCase();
        const direction = sortDesc ? "desc" : "asc";
        const result = search
            ? await ctx.db
                .query("computers")
                .withSearchIndex("search_name_and_login", (q) => q.search("search_text", search))
                .paginate(paginationOpts)
            : sortField === "name"
                ? await ctx.db.query("computers").withIndex("by_name").order(direction).paginate(paginationOpts)
                : sortField === "os"
                    ? await ctx.db.query("computers").withIndex("by_os").order(direction).paginate(paginationOpts)
                    : await ctx.db.query("computers").order(direction).paginate(paginationOpts);

        return {
            page: result.page.map((c) => ({
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
            continueCursor: result.continueCursor,
            isDone: result.isDone,
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
            lastInventoryAt: computer.last_inventory_at,
            hardware: computer.hardware,
            intuneId: computer.intune_id,
            createdAt: computer._creationTime,
        };
    },
});

// ========================================
// Public Mutations
// ========================================

// Only the authenticated device's server-side presence timestamp is updated.
export const heartbeat = internalMutation({
    args: { computerId: v.string() },
    handler: async (ctx, { computerId }) => {
        const id = normalizeTableId(ctx.db, "computers", computerId, "computer ID");
        const computer = await ctx.db.get("computers", id);
        if (!computer) throw new Error("Computer not found");
        await ctx.db.patch("computers", id, { last_connection: Date.now() });
        return { success: true };
    },
});

/**
 * Update computer with RustDesk sync data.
 */
export const rustdeskSync = internalMutation({
    args: {
        legacyPresence: v.optional(v.boolean()),
        computerId: v.string(),
        data: v.object({
            hardware: v.optional(hardwareValidator),
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
    handler: async (ctx, { computerId, data, legacyPresence }) => {
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

        const updates: Partial<Doc<"computers">> = {
            // Inventory and presence have independent timestamps.
            last_inventory_at: Date.now(),
        };
        if (legacyPresence !== false) updates.last_connection = Date.now();
        if (data.hardware !== undefined) updates.hardware = data.hardware;
        let shouldRefreshDynamicGroups = false;

        if (data.rustdesk_id !== undefined) {
            // Handle RustDesk ID being sent as string
            const rid = Number(data.rustdesk_id);
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

        // App install states (must go before computer delete, otherwise
        // orphaned rows remain; the delete trigger also covers this, but
        // keep the mutation self-contained so it works even if trigger
        // ordering changes).
        const installs = await ctx.db
            .query("computer_apps_installs")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", id))
            .collect();

        for (const install of installs) {
            await ctx.db.delete("computer_apps_installs", install._id);
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
            const updates: Partial<Doc<"computers">> = { last_connection: Date.now() };
            if (clientVersionChanged) updates.client_version = clientVersion;
            await ctx.db.patch("computers", computer._id, updates);

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
