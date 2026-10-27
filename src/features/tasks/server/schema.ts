import { index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamptz } from "@/server/db/columns";
import { computers } from "@/features/computers/server";

export const taskType = pgEnum("task_type", ["SET_PASSWD", "SET_NETWORK_STRING"]);
export const taskStatus = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "SUCCESS", "ERROR"]);

export const tasks = pgTable("tasks", {
    id: primaryId(),
    createdAt: createdAt(),
    computerId: text().notNull().references(() => computers.id, { onDelete: "cascade" }),
    taskType: taskType().notNull(),
    status: taskStatus().notNull(),
    taskData: jsonb(),
    error: text(),
    startedAt: timestamptz(),
    finishAt: timestamptz(),
}, (t) => [
    index("tasks_computer_status_idx").on(t.computerId, t.status),
]);

export type TaskRow = typeof tasks.$inferSelect;
