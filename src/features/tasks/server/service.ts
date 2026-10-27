import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { TASK_STATUSES, type TaskStatus } from "../contract";
import { tasks, type TaskRow } from "./schema";

const isTaskStatus = (value: string): value is TaskStatus => TASK_STATUSES.some((status) => status === value);

/** Pending tasks in the device API shape (`created_at` in epoch ms). */
export async function getPendingTasks(db: Database, computerId: string) {
    const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.computerId, computerId), eq(tasks.status, "PENDING")))
        .orderBy(asc(tasks.createdAt), asc(tasks.id));
    return rows.map((task) => ({
        id: task.id,
        created_at: task.createdAt.getTime(),
        status: task.status,
        task: task.taskType,
        task_data: task.taskData ?? undefined,
    }));
}

/** Status report from the device that owns the task. Failures surface as 500, as in v2. */
export async function updateTaskStatus(
    db: Database,
    args: { taskId: string; computerId: string; status: string; error: string | null },
) {
    if (!isTaskStatus(args.status)) {
        throw new Error("Invalid task status");
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, args.taskId));
    if (!task || task.computerId !== args.computerId) {
        throw new Error("Task not found or access denied");
    }

    const now = new Date();
    const updates: Partial<typeof tasks.$inferInsert> = { status: args.status };
    if (args.error != null) {
        updates.error = args.error;
    }
    if (args.status === "SUCCESS" || args.status === "ERROR") {
        updates.finishAt = now;
    } else if (args.status === "IN_PROGRESS") {
        updates.startedAt = now;
    }

    await db.update(tasks).set(updates).where(eq(tasks.id, task.id));
}

function toTaskItem(task: TaskRow) {
    return {
        id: task.id,
        createdAt: task.createdAt.getTime(),
        status: task.status,
        taskType: task.taskType,
        taskData: task.taskData ?? undefined,
        error: task.error ?? undefined,
        startedAt: task.startedAt?.getTime(),
        finishAt: task.finishAt?.getTime(),
    };
}

export async function getTasksByComputer(db: Database, computerId: string) {
    const rows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.computerId, computerId))
        .orderBy(asc(tasks.createdAt), asc(tasks.id));
    return rows.map(toTaskItem);
}

export async function createTask(
    db: Database,
    args: { computerId: string; taskType: TaskRow["taskType"]; taskData?: unknown },
) {
    const [row] = await db
        .insert(tasks)
        .values({ computerId: args.computerId, taskType: args.taskType, status: "PENDING", taskData: args.taskData ?? null })
        .returning({ id: tasks.id });
    return { id: row.id };
}
