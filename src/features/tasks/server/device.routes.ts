import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import type { DeviceEnv } from "@/server/security/require-device";
import { getPendingTasks, updateTaskStatus } from "./service";

export function tasksDeviceRoutes(deps: AppDeps) {
    return new Hono<DeviceEnv>()
        .get("/tasks", async (c) => {
            const tasks = await getPendingTasks(deps.db, c.var.computerId);
            return c.json({ tasks });
        })
        .patch("/task/:taskId", async (c) => {
            const body = await c.req.json();
            const { status, error } = body as { status?: string; error?: string };

            if (!status) {
                return c.json({ error: "Missing status" }, 400);
            }

            await updateTaskStatus(deps.db, {
                taskId: c.req.param("taskId"),
                computerId: c.var.computerId,
                status,
                error: error || null,
            });

            return c.json({ status: "ok" });
        });
}
