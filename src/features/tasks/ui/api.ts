"use client";

import { hc } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery } from "@/lib/api/hooks";
import type { TasksAdminRoutes } from "../server/admin.routes";

const client = hc<TasksAdminRoutes>("/api/admin/tasks");

export const taskKeys = {
    all: ["tasks"] as const,
};

/** Tasks of one computer and a creator for new ones (the computer page's activity tab). */
export function useComputerTasks(computerId: string) {
    const tasks = useApiQuery([...taskKeys.all, "computer", computerId], () =>
        call(client.computer[":computerId"].$get({ param: { computerId } })));
    const createTask = useApiMutation((args: {
        computerId: string;
        taskType: "SET_PASSWD" | "SET_NETWORK_STRING";
        taskData?: unknown;
    }) => call(client.index.$post({ json: args })));
    return { tasks, createTask };
}
