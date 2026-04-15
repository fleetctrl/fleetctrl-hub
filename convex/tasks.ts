/**
 * Tasks Module
 *
 * Handles task management for computers.
 */

import { internalQuery } from "./_generated/server";
import { internalMutation } from "./functions";
import { withAuthQuery, withAuthMutation } from "./lib/withAuth";
import { v } from "convex/values";
import { normalizeTableId } from "./lib/idNormalization";

const taskStatusValidator = v.union(
    v.literal("PENDING"),
    v.literal("IN_PROGRESS"),
    v.literal("SUCCESS"),
    v.literal("ERROR")
);

// ========================================
// Public Queries
// ========================================

/**
 * Get pending tasks for a computer.
 */
export const getPending = internalQuery({
    args: { computerId: v.string() },
    handler: async (ctx, { computerId }) => {
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );

        const tasks = await ctx.db
            .query("tasks")
            .withIndex("by_computer_status", (q) =>
                q.eq("computer_id", normalizedComputerId).eq("status", "PENDING")
            )
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
export const getByComputer = withAuthQuery({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
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
        taskId: v.string(),
        computerId: v.string(),
        status: taskStatusValidator,
        error: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, { taskId, computerId, status, error }) => {
        const normalizedTaskId = normalizeTableId(ctx.db, "tasks", taskId, "task ID");
        const normalizedComputerId = normalizeTableId(
            ctx.db,
            "computers",
            computerId,
            "computer ID"
        );

        const task = await ctx.db.get("tasks", normalizedTaskId);

        if (!task || task.computer_id !== normalizedComputerId) {
            throw new Error("Task not found or access denied");
        }

        const now = Date.now();
        const updates: Record<string, unknown> = {
            status,
        };

        if (error !== undefined) {
            updates.error = error;
        }

        if (status === "SUCCESS" || status === "ERROR") {
            updates.finish_at = now;
        } else if (status === "IN_PROGRESS") {
            updates.started_at = now;
        }

        await ctx.db.patch("tasks", task._id, updates);

        return { success: true };
    },
});

/**
 * Create a new task.
 */
export const create = withAuthMutation({
    args: {
        computerId: v.id("computers"),
        taskType: v.union(v.literal("SET_PASSWD"), v.literal("SET_NETWORK_STRING")),
        taskData: v.optional(v.any()),
    },
    handler: async (ctx, { computerId, taskType, taskData }) => {
        const id = await ctx.db.insert("tasks", {
            computer_id: computerId,
            task_type: taskType,
            status: "PENDING",
            task_data: taskData,
        });

        return { id };
    },
});
