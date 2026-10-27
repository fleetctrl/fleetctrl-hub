import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { streamFile } from "@/features/files/server";
import type { AppDeps } from "@/server/deps";
import type { DeviceEnv } from "@/server/security/require-device";
import { getActiveVersion, getVersionForDownload } from "./service";

/** Public: the active client version. */
export function clientUpdatesPublicRoutes(deps: AppDeps) {
    return new Hono().get("/client/version", async (c) => {
        const version = await getActiveVersion(deps.db);
        return c.json(version || { version: null });
    });
}

/**
 * Runs after requireDevice: tells clients that report an outdated `X-Client-Version` about the
 * active version through the `X-Client-Update` response header. Failures never block the request.
 */
export function clientUpdateHeader(deps: AppDeps) {
    return createMiddleware(async (c, next) => {
        const clientVersion = c.req.header("X-Client-Version");
        if (clientVersion) {
            try {
                const activeVersion = await getActiveVersion(deps.db);
                if (activeVersion && activeVersion.version !== clientVersion) {
                    c.header(
                        "X-Client-Update",
                        JSON.stringify({
                            version: activeVersion.version,
                            id: activeVersion.id,
                            hash: activeVersion.hash,
                        }),
                    );
                }
            } catch (e) {
                console.error("Client update check failed:", e);
            }
        }
        await next();
    });
}

export function clientUpdatesDeviceRoutes(deps: AppDeps) {
    return new Hono<DeviceEnv>().get("/client/download/:versionId", async (c) => {
        const version = await getVersionForDownload(deps.db, c.req.param("versionId"));
        const response = version ? await streamFile(deps, version.fileId) : null;
        if (!response) {
            return c.json({ error: "Version not found" }, 404);
        }
        return response;
    });
}
