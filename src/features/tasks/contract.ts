import { z } from "zod";

export const TASK_TYPES = ["SET_PASSWD", "SET_NETWORK_STRING"] as const;
export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "SUCCESS", "ERROR"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const createTaskSchema = z.object({
    computerId: z.string(),
    taskType: z.enum(TASK_TYPES),
    taskData: z.unknown().optional(),
});
