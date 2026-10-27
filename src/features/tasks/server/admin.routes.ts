import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { createTaskSchema } from "../contract";
import { createTask, getTasksByComputer } from "./service";

export function tasksAdminRoutes(deps: AppDeps) {
    return new Hono()
        .get("/computer/:computerId", async (c) => c.json(await getTasksByComputer(deps.db, c.req.param("computerId"))))
        .post("/", validate("json", createTaskSchema), async (c) => c.json(await createTask(deps.db, c.req.valid("json"))));
}

export type TasksAdminRoutes = ReturnType<typeof tasksAdminRoutes>;
