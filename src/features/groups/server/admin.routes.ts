import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "@/server/deps";
import {
    dynamicGroupInputSchema,
    dynamicGroupUpdateSchema,
    paginationQuerySchema,
    rulePreviewSchema,
    staticGroupInputSchema,
    staticGroupUpdateSchema,
} from "../contract";
import { refreshAllDynamicGroups } from "./membership";
import {
    createDynamicGroup,
    createStaticGroup,
    getDynamicGroup,
    listComputersForGroups,
    listDynamicGroups,
    listDynamicGroupsPaginated,
    listDynamicMembers,
    listStaticGroups,
    listStaticGroupsForTable,
    listStaticMemberIds,
    previewRuleMatches,
    removeDynamicGroup,
    removeStaticGroup,
    updateDynamicGroup,
    updateStaticGroup,
} from "./service";

const computerPickerQuerySchema = paginationQuerySchema.extend({ search: z.string().optional() });

export function groupsAdminRoutes(deps: AppDeps) {
    const { db } = deps;
    return new Hono()
        // Static groups
        .get("/static", async (c) => c.json(await listStaticGroups(db)))
        .get("/static/table", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listStaticGroupsForTable(db, c.req.valid("query"))))
        .get("/static/computers", validate("query", computerPickerQuerySchema), async (c) =>
            c.json(await listComputersForGroups(db, c.req.valid("query"))))
        .get("/static/:id/member-ids", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listStaticMemberIds(db, c.req.param("id"), c.req.valid("query"))))
        .post("/static", validate("json", staticGroupInputSchema), async (c) =>
            c.json(await createStaticGroup(db, c.req.valid("json"))))
        .patch("/static/:id", validate("json", staticGroupUpdateSchema), async (c) =>
            c.json(await updateStaticGroup(db, c.req.param("id"), c.req.valid("json"))))
        .delete("/static/:id", async (c) => c.json(await removeStaticGroup(db, c.req.param("id"))))
        // Dynamic groups
        .get("/dynamic", async (c) => c.json(await listDynamicGroups(db)))
        .get("/dynamic/table", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listDynamicGroupsPaginated(db, c.req.valid("query"))))
        .post("/dynamic/preview", validate("json", rulePreviewSchema), async (c) => {
            const { ruleExpression, asOf } = c.req.valid("json");
            return c.json(await previewRuleMatches(db, ruleExpression, asOf));
        })
        .post("/dynamic/refresh-all", async (c) =>
            c.json(await db.transaction((tx) => refreshAllDynamicGroups(tx))))
        .get("/dynamic/:id", async (c) => c.json(await getDynamicGroup(db, c.req.param("id"))))
        .get("/dynamic/:id/members", validate("query", paginationQuerySchema), async (c) =>
            c.json(await listDynamicMembers(db, c.req.param("id"), c.req.valid("query"))))
        .post("/dynamic", validate("json", dynamicGroupInputSchema), async (c) =>
            c.json(await createDynamicGroup(db, c.req.valid("json"))))
        .patch("/dynamic/:id", validate("json", dynamicGroupUpdateSchema), async (c) =>
            c.json(await updateDynamicGroup(db, c.req.param("id"), c.req.valid("json"))))
        .delete("/dynamic/:id", async (c) => c.json(await removeDynamicGroup(db, c.req.param("id"))));
}

export type GroupsAdminRoutes = ReturnType<typeof groupsAdminRoutes>;
