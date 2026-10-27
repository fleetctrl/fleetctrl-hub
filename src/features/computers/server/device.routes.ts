import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import type { DeviceEnv } from "@/server/security/require-device";
import { inventorySchema } from "../contract";
import { recordPresence, updateInventory } from "./service";

export function computersDeviceRoutes(deps: AppDeps) {
    return new Hono<DeviceEnv>()
        .post("/computer/heartbeat", async (c) => {
            await deps.db.transaction((tx) => recordPresence(tx, c.var.computerId));
            return c.json({ status: "ok" });
        })
        // Keep the old route for existing clients during a gradual rollout.
        .on("PATCH", ["/computer/rustdesk-sync", "/computer/hardware-sync"], async (c) => {
            const parsed = inventorySchema.safeParse(await c.req.json().catch(() => null));
            if (!parsed.success) return c.json({ error: "Invalid inventory payload" }, 400);
            const data = parsed.data;
            const clientVersion = c.req.header("X-Client-Version");
            if (clientVersion) data.client_version = clientVersion;
            const legacyPresence = c.req.path.endsWith("/rustdesk-sync");
            await deps.db.transaction((tx) =>
                updateInventory(tx, deps.events, c.var.computerId, data, { legacyPresence }),
            );
            return c.json({ status: "ok" });
        });
}
