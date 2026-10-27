import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { createAppSchema, paginationQuerySchema, releaseInputSchema, updateAppSchema } from "../contract";
import {
    createApp,
    createRelease,
    deleteRelease,
    getApp,
    getInstallStatusSummary,
    listAppsTable,
    listAppsTablePaginated,
    listInstallStatusPaginated,
    listReleasesPaginated,
    removeApp,
    requestReinstall,
    requestReinstallForApp,
    updateApp,
    updateRelease,
} from "./admin.service";

export function appsAdminRoutes(deps: AppDeps) {
    const { db } = deps;
    return new Hono()
        .get("/table", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listAppsTablePaginated(db, c.req.valid("query"))))
        .get("/all", async (c) => c.json(await listAppsTable(db)))
        .post("/", validate("json", createAppSchema), async (c) => c.json(await createApp(db, c.req.valid("json"))))
        .patch("/releases/:releaseId", validate("json", releaseInputSchema), async (c) =>
            c.json(await updateRelease(db, c.req.param("releaseId"), c.req.valid("json"))))
        .delete("/releases/:releaseId", async (c) => c.json(await deleteRelease(db, c.req.param("releaseId"))))
        .post("/installs/:installId/reinstall", async (c) => c.json(await requestReinstall(db, c.req.param("installId"))))
        .get("/:id", async (c) => c.json(await getApp(db, c.req.param("id"))))
        .patch("/:id", validate("json", updateAppSchema), async (c) =>
            c.json(await updateApp(db, c.req.param("id"), c.req.valid("json"))))
        .delete("/:id", async (c) => c.json(await removeApp(db, c.req.param("id"))))
        .get("/:id/releases", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listReleasesPaginated(db, c.req.param("id"), c.req.valid("query"))))
        .post("/:id/releases", validate("json", releaseInputSchema), async (c) =>
            c.json(await createRelease(db, c.req.param("id"), c.req.valid("json"))))
        .get("/:id/installs", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listInstallStatusPaginated(db, c.req.param("id"), c.req.valid("query"))))
        .get("/:id/installs/summary", async (c) => c.json(await getInstallStatusSummary(db, c.req.param("id"))))
        .post("/:id/reinstall", async (c) => c.json(await requestReinstallForApp(db, c.req.param("id"))));
}

export type AppsAdminRoutes = ReturnType<typeof appsAdminRoutes>;
