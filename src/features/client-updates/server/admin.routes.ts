import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { mapPage } from "@/server/pagination";
import { createClientUpdateSchema, paginationQuerySchema } from "../contract";
import {
    createClientUpdate,
    deactivateClientUpdate,
    getActiveClientUpdate,
    listClientUpdates,
    listClientUpdatesPaginated,
    removeClientUpdate,
    setActiveClientUpdate,
    toClientUpdateDoc,
} from "./service";

export function clientUpdatesAdminRoutes(deps: AppDeps) {
    const { db } = deps;
    return new Hono()
        .get("/", validate("query", paginationQuerySchema), async (c) =>
            c.json(mapPage(await listClientUpdatesPaginated(db, c.req.valid("query")), toClientUpdateDoc)))
        .get("/all", async (c) => c.json((await listClientUpdates(db)).map(toClientUpdateDoc)))
        .get("/active", async (c) => {
            const active = await getActiveClientUpdate(db);
            return c.json(active ? toClientUpdateDoc(active) : null);
        })
        .post("/", validate("json", createClientUpdateSchema), async (c) =>
            c.json(await createClientUpdate(db, c.req.valid("json"))))
        .post("/:id/activate", async (c) => c.json(await setActiveClientUpdate(db, c.req.param("id"))))
        .post("/:id/deactivate", async (c) => c.json(await deactivateClientUpdate(db, c.req.param("id"))))
        .delete("/:id", async (c) => c.json(await removeClientUpdate(db, c.req.param("id"))));
}

export type ClientUpdatesAdminRoutes = ReturnType<typeof clientUpdatesAdminRoutes>;
