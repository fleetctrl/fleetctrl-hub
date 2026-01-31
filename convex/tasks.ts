/**
 * Tasks Module
 *
 * Handles task management for computers.
 */

import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { checkAdmin } from "./lib/auth";

// ========================================
// Public Queries
// ========================================

/**
 * Get pending tasks for a computer.
 */
export const getPending = internalQuery({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .filter((q) => q.eq(q.field("status"), "PENDING"))
            .collect();

        return tasks.map((task) => ({
            id: task._id,
            created_at: task._creationTime,
            status: task.status,
            task: task.task_type,
            task_data: task.task_data,
        }));
    },
});

/**
 * Get all tasks for a computer.
 */
export const getByComputer = query({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
        await checkAdmin(ctx);
        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .collect();

        return tasks.map((task) => ({
            id: task._id,
            createdAt: task._creationTime,
            status: task.status,
            taskType: task.task_type,
            taskData: task.task_data,
            error: task.error,
            startedAt: task.started_at,
            finishAt: task.finish_at,
        }));
    },
});

// ========================================
// Public Mutations
// ========================================

/**
 * Update task status.
 */
export const updateStatus = internalMutation({
    args: {
        taskId: v.id("tasks"),
        computerId: v.id("computers"),
        status: v.string(),
        error: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, { taskId, computerId, status, error }) => {
        // Validate status
        const validStatuses = ["PENDING", "IN_PROGRESS", "SUCCESS", "ERROR"];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
        }

        // Find the task - we need to validate it belongs to this computer
        const task = await ctx.db.get(taskId);

        if (!task || task.computer_id !== computerId) {
            throw new Error("Task not found or access denied");
        }

        const now = Date.now();
        const updates: Record<string, unknown> = {
            status: status as "PENDING" | "IN_PROGRESS" | "SUCCESS" | "ERROR",
        };

        if (error !== undefined) {
            updates.error = error;
        }

        if (status === "SUCCESS" || status === "ERROR") {
            updates.finish_at = now;
        } else if (status === "IN_PROGRESS") {
            updates.started_at = now;
        }

        await ctx.db.patch(task._id, updates);

        return { success: true };
    },
});

/**
 * Create a new task.
 */
export const create = mutation({
    args: {
        computerId: v.id("computers"),
        taskType: v.union(v.literal("SET_PASSWD"), v.literal("SET_NETWORK_STRING")),
        taskData: v.optional(v.any()),
    },
    handler: async (ctx, { computerId, taskType, taskData }) => {
        await checkAdmin(ctx);
        const id = await ctx.db.insert("tasks", {
            computer_id: computerId,
            task_type: taskType,
            status: "PENDING",
            task_data: taskData,
        });

        return { id };
    },
});
