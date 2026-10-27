import { Hono } from "hono";
import { cors } from "hono/cors";
import { appsAdminRoutes, appsDeviceRoutes } from "@/features/apps/server";
import { createAuth, requireSession } from "@/features/auth/server";
import {
    clientUpdateHeader,
    clientUpdatesAdminRoutes,
    clientUpdatesDeviceRoutes,
    clientUpdatesPublicRoutes,
} from "@/features/client-updates/server";
import { computersAdminRoutes, computersDeviceRoutes } from "@/features/computers/server";
import { deviceAuthDeviceRoutes, deviceAuthJobs, enrollmentTokensAdminRoutes } from "@/features/device-auth/server";
import { filesAdminRoutes, filesJobs } from "@/features/files/server";
import { groupsAdminRoutes, groupsJobs, registerGroupsEventHandlers } from "@/features/groups/server";
import { tasksAdminRoutes, tasksDeviceRoutes } from "@/features/tasks/server";
import type { Job } from "@/server/cron";
import type { AppDeps } from "@/server/deps";
import { adminErrorHandler } from "@/server/http/errors";
import { purgeExpiredJtis } from "@/server/security/jti";
import { requireDevice } from "@/server/security/require-device";

/**
 * Device API: the contract of the deployed Windows client (paths, status codes, JSON shapes).
 * Order matters: public routes answer before the requireDevice middleware is reached, and every
 * other path, including unknown ones, needs a valid DPoP-bound access token (as in v2).
 */
function createDeviceApp(deps: AppDeps) {
    const device = new Hono();
    device.use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
            allowHeaders: ["Authorization", "DPoP", "Content-Type", "X-Client-Version", "enrollment-token"],
            exposeHeaders: ["Content-Length"],
            maxAge: 86400,
        }),
    );
    device.get("/health", (c) => c.json({ status: "ok" }));
    device.route("/", deviceAuthDeviceRoutes(deps));
    device.route("/", clientUpdatesPublicRoutes(deps));

    device.use("*", requireDevice(deps), clientUpdateHeader(deps));
    device.route("/", tasksDeviceRoutes(deps));
    device.route("/", appsDeviceRoutes(deps));
    device.route("/", clientUpdatesDeviceRoutes(deps));
    device.route("/", computersDeviceRoutes(deps));
    return device;
}

/** Admin API for the dashboard (public path `/api/admin/*`); every route needs a session. */
function createAdminApp(deps: AppDeps, auth: ReturnType<typeof createAuth>) {
    const admin = new Hono().basePath("/admin");
    admin.onError(adminErrorHandler);
    admin.notFound((c) => c.json({ error: "Not found" }, 404));
    admin.use("*", requireSession(auth));
    admin.route("/computers", computersAdminRoutes(deps));
    admin.route("/enrollment-tokens", enrollmentTokensAdminRoutes(deps));
    admin.route("/groups", groupsAdminRoutes(deps));
    admin.route("/apps", appsAdminRoutes(deps));
    admin.route("/tasks", tasksAdminRoutes(deps));
    admin.route("/client-updates", clientUpdatesAdminRoutes(deps));
    admin.route("/files", filesAdminRoutes(deps));
    return admin;
}

const kernelJobs: Job[] = [
    { name: "dpop-jti-cleanup", schedule: "*/10 * * * *", run: async (tx) => ({ purged: await purgeExpiredJtis(tx) }) },
];

/**
 * Composition root: the only place that mounts feature routers, applies auth middleware and
 * registers event handlers and jobs. The three surfaces are separate apps, so their middleware,
 * error handling and 404s never mix.
 */
export function createServer(deps: AppDeps) {
    const auth = createAuth(deps);
    registerGroupsEventHandlers(deps.events);

    const device = createDeviceApp(deps);
    const admin = createAdminApp(deps, auth);

    const app = new Hono();
    app.all("/auth/*", (c) => auth.handler(c.req.raw));
    app.all("/admin/*", (c) => admin.fetch(c.req.raw, c.env));
    app.all("/admin", (c) => admin.fetch(c.req.raw, c.env));
    app.all("*", (c) => device.fetch(c.req.raw, c.env));

    const jobs: Job[] = [...kernelJobs, ...deviceAuthJobs, ...groupsJobs, ...filesJobs(deps.storage)];
    return { app, auth, jobs };
}
