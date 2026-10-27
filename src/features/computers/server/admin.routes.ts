import { validate } from "@/server/http/validate";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { mapPage } from "@/server/pagination";
import { listComputersQuerySchema } from "../contract";
import { toComputerDetail, toComputerListItem, toComputerTableRow } from "./dto";
import { presenceStream } from "./presence";
import { getComputer, listComputers, listComputersPaginated, removeComputer } from "./service";

export function computersAdminRoutes(deps: AppDeps) {
    return new Hono()
        .get("/", validate("query", listComputersQuerySchema), async (c) => {
            const query = c.req.valid("query");
            const result = await listComputersPaginated(deps.db, { ...query, sortDesc: query.sortDesc === "true" });
            return c.json(mapPage(result, toComputerTableRow));
        })
        .get("/all", async (c) => {
            const rows = await listComputers(deps.db);
            return c.json(rows.map(toComputerListItem));
        })
        .get("/presence", (c) => presenceStream(c, deps.pubsub))
        .get("/:id", async (c) => {
            const computer = await getComputer(deps.db, c.req.param("id"));
            return c.json(computer ? toComputerDetail(computer) : null);
        })
        .delete("/:id", async (c) => {
            await removeComputer(deps.db, c.req.param("id"));
            return c.json({ success: true });
        });
}

export type ComputersAdminRoutes = ReturnType<typeof computersAdminRoutes>;
