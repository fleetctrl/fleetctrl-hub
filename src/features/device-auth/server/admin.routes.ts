import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { mapPage } from "@/server/pagination";
import { createEnrollmentTokenSchema, paginationQuerySchema } from "../contract";
import {
    createEnrollmentToken,
    listEnrollmentTokens,
    listEnrollmentTokensPaginated,
    removeEnrollmentToken,
    toEnrollmentTokenItem,
} from "./service";

export function enrollmentTokensAdminRoutes(deps: AppDeps) {
    return new Hono()
        .get("/", validate("query", paginationQuerySchema), async (c) => {
            const result = await listEnrollmentTokensPaginated(deps.db, c.req.valid("query"));
            return c.json(mapPage(result, toEnrollmentTokenItem));
        })
        .get("/all", async (c) => {
            const rows = await listEnrollmentTokens(deps.db);
            return c.json(rows.map(toEnrollmentTokenItem));
        })
        .post("/", validate("json", createEnrollmentTokenSchema), async (c) => {
            return c.json(await createEnrollmentToken(deps.db, c.req.valid("json")));
        })
        .delete("/:id", async (c) => {
            await removeEnrollmentToken(deps.db, c.req.param("id"));
            return c.json({ success: true });
        });
}

export type EnrollmentTokensAdminRoutes = ReturnType<typeof enrollmentTokensAdminRoutes>;
