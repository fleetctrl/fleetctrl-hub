import { Hono } from "hono";
import { streamFile } from "@/features/files/server";
import type { AppDeps } from "@/server/deps";
import type { DeviceEnv } from "@/server/security/require-device";
import { INSTALL_STATUSES, installStateBodySchema, type InstallStatus } from "../contract";
import {
    authorizedInstallerFile,
    authorizedRequirementFile,
    authorizedScriptFile,
    getAssignedApps,
    updateInstallState,
} from "./device.service";

const isInstallStatus = (value: string): value is InstallStatus => INSTALL_STATUSES.some((status) => status === value);

export function appsDeviceRoutes(deps: AppDeps) {
    // Downloads are streamed instead of redirected: the client sends Authorization + DPoP on the
    // redirected request too, and S3 rejects a presigned URL that also carries Authorization.
    const download = async (fileId: string | null) => (fileId ? streamFile(deps, fileId) : null);

    return new Hono<DeviceEnv>()
        .get("/apps/assigned", async (c) => {
            const apps = await getAssignedApps(deps.db, c.var.computerId);
            return c.json({ apps });
        })
        .get("/apps/download/:releaseId", async (c) => {
            const response = await download(await authorizedInstallerFile(deps.db, c.var.computerId, c.req.param("releaseId")));
            return response ?? c.json({ error: "Release not found or access denied" }, 404);
        })
        .get("/apps/requirement/download/:requirementId", async (c) => {
            const response = await download(
                await authorizedRequirementFile(deps.db, c.var.computerId, c.req.param("requirementId")),
            );
            return response ?? c.json({ error: "Requirement not found or access denied" }, 404);
        })
        .get("/apps/script/download/:scriptId", async (c) => {
            const response = await download(await authorizedScriptFile(deps.db, c.var.computerId, c.req.param("scriptId")));
            return response ?? c.json({ error: "Script not found or access denied" }, 404);
        })
        .patch("/apps/release/:releaseId/state", async (c) => {
            const parsed = installStateBodySchema.safeParse(await c.req.json().catch(() => null));
            if (!parsed.success) {
                return c.json({ error: "Invalid install state payload" }, 400);
            }
            const { status, installed_at, last_seen_at, reinstall_requested_at, error } = parsed.data;

            if (!status) {
                return c.json({ error: "Missing status" }, 400);
            }
            if (!isInstallStatus(status)) {
                return c.json({ error: "Invalid status" }, 400);
            }

            await deps.db.transaction((tx) =>
                updateInstallState(tx, {
                    computerId: c.var.computerId,
                    releaseId: c.req.param("releaseId"),
                    status,
                    installedAt: installed_at,
                    lastSeenAt: last_seen_at,
                    reinstallRequestedAt: reinstall_requested_at,
                    error,
                }),
            );

            return c.json({ status: "ok" });
        });
}
