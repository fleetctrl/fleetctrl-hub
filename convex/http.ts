/**
 * HTTP Actions - API Compatibility Layer using Hono
 *
 * Provides HTTP endpoints that match the existing Go API.
 * Clients can continue using the same endpoints with no changes.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyDPoP, computeATH } from "./lib/dpop";
import { checkAndStoreJti } from "../lib/jtiStore";
import { verifyAccessToken } from "./lib/jwt";
import { authComponent, createAuth } from "./auth";
import { createMiddleware } from "hono/factory";

// Define the environment for Hono (ctx from Convex)
type Env = {
    Bindings: {
        ctx: {
            runQuery: (query: any, args: any) => Promise<any>;
            runMutation: (mutation: any, args: any) => Promise<any>;
            runAction: (action: any, args: any) => Promise<any>;
        };
    };
    Variables: {
        computerId: string;
    };
};

const app = new Hono<Env>();
const installStateStatuses = new Set([
    "PENDING",
    "INSTALLING",
    "INSTALLED",
    "ERROR",
    "UNINSTALLED",
] as const);

type InstallStateStatus =
    | "PENDING"
    | "INSTALLING"
    | "INSTALLED"
    | "ERROR"
    | "UNINSTALLED";

// ========================================
// Middleware
// ========================================

// CORS Middleware
app.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowHeaders: [
            "Authorization",
            "DPoP",
            "Content-Type",
            "X-Client-Version",
            "enrollment-token",
        ],
        exposeHeaders: ["Content-Length"],
        maxAge: 86400,
    })
);

// DPoP Authentication Middleware
const dpopAuth = createMiddleware<Env>(async (c, next) => {
    try {
        const dpopHeader = c.req.header("DPoP");
        const authHeader = c.req.header("Authorization");

        if (!dpopHeader) {
            return c.json({ error: "Missing DPoP header" }, 401);
        }

        if (!authHeader?.startsWith("Bearer ")) {
            return c.json({ error: "Missing bearer token" }, 401);
        }

        const accessToken = authHeader.slice(7);
        const url = new URL(c.req.url);
        const apiUrl = process.env.API_URL;

        // Use API_URL as base (includes /api path) and append request pathname
        let expectedUrl: string;
        if (apiUrl) {
            const apiBase = apiUrl.replace(/\/$/, ""); // remove trailing slash
            expectedUrl = `${apiBase}${url.pathname}`;
        } else {
            url.search = "";
            url.hash = "";
            expectedUrl = url.href;
        }

        // Verify DPoP proof
        const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedUrl);

        // Check JTI for replay
        try {
            checkAndStoreJti(dpopResult.jti);
        } catch {
            return c.json({ error: "Replayed DPoP proof" }, 401);
        }

        // Verify access token
        let tokenPayload;
        try {
            tokenPayload = await verifyAccessToken(accessToken);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Invalid access token";
            return c.json({ error: message }, 401);
        }

        // Verify JKT binding
        if (tokenPayload.cnf?.jkt !== dpopResult.jkt) {
            return c.json({ error: "JKT mismatch" }, 401);
        }

        // Verify ATH if present
        if (dpopResult.ath) {
            const expectedAth = await computeATH(accessToken);
            if (dpopResult.ath !== expectedAth) {
                return c.json({ error: "ATH mismatch" }, 401);
            }
        }

        // Extract computer ID from subject
        const sub = tokenPayload.sub;
        if (!sub.startsWith("device:")) {
            return c.json({ error: "Invalid token subject" }, 401);
        }
        const computerId = sub.slice(7);


        // Check for client updates
        const clientVersion = c.req.header("X-Client-Version");
        if (clientVersion) {
            try {
                // Check if update is needed
                const activeVersion = await c.env.ctx.runQuery(internal.client.getActiveVersion, {});

                if (activeVersion && activeVersion.version !== clientVersion) {
                    // Inject update instruction as response header
                    c.header(
                        "X-Client-Update",
                        JSON.stringify({
                            version: activeVersion.version,
                            id: activeVersion.id,
                            hash: activeVersion.hash,
                        })
                    );
                }
            } catch (e) {
                console.error("Client update check failed:", e);
                // Non-critical, continue
            }
        }

        // Set computerId in context
        c.set("computerId", computerId);

        await next();
    } catch (error: unknown) {
        console.error("DPoP validation error:", error);
        const message =
            error instanceof Error ? error.message : "Authentication failed";
        return c.json({ error: message }, 401);
    }
});

// ========================================
// Routes
// ========================================

/**
 * Health Check
 */
app.get("/health", (c) => c.json({ status: "ok" }));

/**
 * Enroll Computer
 */
app.post("/enroll", async (c) => {
    try {
        const enrollmentToken = c.req.header("enrollment-token");
        if (!enrollmentToken) {
            return c.json({ error: "Missing enrollment-token" }, 400);
        }

        const body = await c.req.json();
        const { name, jkt, device_id } = body as {
            name?: string;
            jkt?: string;
            device_id?: string;
        };

        if (!name) {
            return c.json({ error: "Missing required fields" }, 400);
        }

        let effectiveJkt = jkt;
        if (device_id) {
            const dpopHeader = c.req.header("DPoP");
            if (!dpopHeader) {
                return c.json({ error: "Missing DPoP header" }, 401);
            }

            const url = new URL(c.req.url);
            const apiUrl = process.env.API_URL;

            let expectedUrl: string;
            if (apiUrl) {
                const apiBase = apiUrl.replace(/\/$/, "");
                expectedUrl = `${apiBase}${url.pathname}`;
            } else {
                url.search = "";
                url.hash = "";
                expectedUrl = url.href;
            }

            const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedUrl);

            try {
                checkAndStoreJti(dpopResult.jti);
            } catch {
                return c.json({ error: "Replayed DPoP proof" }, 401);
            }

            if (effectiveJkt && effectiveJkt !== dpopResult.jkt) {
                return c.json({ error: "JKT mismatch" }, 401);
            }

            effectiveJkt = dpopResult.jkt;
        }

        if (!effectiveJkt) {
            return c.json({ error: "Missing required fields" }, 400);
        }

        const result = await c.env.ctx.runAction(internal.deviceAuth.enroll, {
            enrollmentToken,
            name,
            jkt: effectiveJkt,
            deviceId: device_id,
        });

        return c.json(
            {
                tokens: {
                    access_token: result.access_token,
                    refresh_token: result.refresh_token,
                    expires_in: result.expires_in,
                },
                device_id: result.device_id,
            },
            201
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Enrollment failed";
        return c.json({ error: message }, 400);
    }
});

/**
 * Check Enrollment Status
 */
app.get("/devices/:deviceId/is-enrolled", async (c) => {
    const deviceId = c.req.param("deviceId");

    if (!deviceId) {
        return c.json({ error: "Missing deviceId" }, 400);
    }

    const result = await c.env.ctx.runQuery(internal.deviceAuth.isEnrolled, {
        deviceId,
    });

    if (result) {
        return c.json({ is_enrolled: true });
    }
    return c.json({ is_enrolled: false }, 404);
});

/**
 * Refresh Token
 */
app.post("/token/refresh", async (c) => {
    try {
        const body = await c.req.json();
        const { refresh_token } = body as { refresh_token?: string };

        if (!refresh_token) {
            return c.json({ error: "Missing refresh_token" }, 400);
        }

        const result = await c.env.ctx.runAction(internal.deviceAuth.refreshTokens, {
            refreshToken: refresh_token,
        });

        return c.json({ tokens: result });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Token refresh failed";
        return c.json({ error: message }, 401);
    }
});

/**
 * Recover Token
 */
app.post("/token/recover", async (c) => {
    try {
        // We verify DPoP manually for recovery because it's slightly different flow (no access token yet, just proof)
        const dpopHeader = c.req.header("DPoP");
        if (!dpopHeader) {
            return c.json({ error: "Missing DPoP header" }, 401);
        }

        const url = new URL(c.req.url);
        const apiUrl = process.env.API_URL;

        let expectedUrl: string;
        if (apiUrl) {
            const apiBase = apiUrl.replace(/\/$/, "");
            expectedUrl = `${apiBase}${url.pathname}`;
        } else {
            url.search = "";
            url.hash = "";
            expectedUrl = url.href;
        }

        // Verify DPoP proof
        const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedUrl);

        // Check JTI for replay
        try {
            checkAndStoreJti(dpopResult.jti);
        } catch {
            return c.json({ error: "Replayed DPoP proof" }, 401);
        }

        const result = await c.env.ctx.runAction(internal.deviceAuth.recover, {
            jkt: dpopResult.jkt,
        });

        return c.json({ tokens: result });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Token recovery failed";
        return c.json({ error: message }, 401);
    }
});

// ========================================
// Protected Routes
// ========================================
const protectedApi = new Hono<Env>();
protectedApi.use("*", dpopAuth);

/**
 * Tasks
 */
protectedApi.get("/tasks", async (c) => {
    const computerId = c.var.computerId;
    const tasks = await c.env.ctx.runQuery(internal.tasks.getPending, { computerId });
    return c.json({ tasks });
});

protectedApi.patch("/task/:taskId", async (c) => {
    const computerId = c.var.computerId;
    const taskId = c.req.param("taskId");
    const body = await c.req.json();
    const { status, error } = body as { status?: string; error?: string };

    if (!status) {
        return c.json({ error: "Missing status" }, 400);
    }

    await c.env.ctx.runMutation(internal.tasks.updateStatus, {
        taskId,
        computerId,
        status,
        error: error || null,
    });

    return c.json({ status: "ok" });
});

/**
 * Apps
 */
protectedApi.get("/apps/assigned", async (c) => {
    const computerId = c.var.computerId;
    const apps = await c.env.ctx.runQuery(internal.apps.getAssigned, { computerId });
    return c.json({ apps });
});

protectedApi.get("/apps/download/:releaseId", async (c) => {
    const computerId = c.var.computerId;
    const releaseId = c.req.param("releaseId");

    const downloadUrl = await c.env.ctx.runAction(internal.apps.getDownloadUrl, {
        computerId,
        releaseId,
    });

    if (!downloadUrl) {
        return c.json({ error: "Release not found or access denied" }, 404);
    }

    return c.redirect(downloadUrl as string, 307);
});

protectedApi.get("/apps/requirement/download/:requirementId", async (c) => {
    const computerId = c.var.computerId;
    const requirementId = c.req.param("requirementId");

    const downloadUrl = await c.env.ctx.runAction(
        internal.apps.getRequirementDownloadUrl,
        {
            computerId,
            requirementId,
        }
    );

    if (!downloadUrl) {
        return c.json({ error: "Requirement not found or access denied" }, 404);
    }

    return c.redirect(downloadUrl as string, 307);
});

protectedApi.get("/apps/script/download/:scriptId", async (c) => {
    const computerId = c.var.computerId;
    const scriptId = c.req.param("scriptId");

    const downloadUrl = await c.env.ctx.runAction(
        internal.apps.getScriptDownloadUrl,
        {
            computerId,
            scriptId,
        }
    );

    if (!downloadUrl) {
        return c.json({ error: "Script not found or access denied" }, 404);
    }

    return c.redirect(downloadUrl as string, 307);
});

protectedApi.patch("/apps/release/:releaseId/state", async (c) => {
    const computerId = c.var.computerId;
    const releaseId = c.req.param("releaseId");
    const body = await c.req.json();
    const { status, installed_at, last_seen_at } = body as {
        status?: string;
        installed_at?: number;
        last_seen_at?: number;
    };

    if (!status) {
        return c.json({ error: "Missing status" }, 400);
    }
    if (!installStateStatuses.has(status as InstallStateStatus)) {
        return c.json({ error: "Invalid status" }, 400);
    }

    await c.env.ctx.runMutation(internal.apps.updateInstallState, {
        computerId,
        releaseId,
        status: status as InstallStateStatus,
        installedAt: installed_at,
        lastSeenAt: last_seen_at,
    });

    return c.json({ status: "ok" });
});

/**
 * Client Updates
 */
protectedApi.get("/client/download/:versionId", async (c) => {
    const versionId = c.req.param("versionId");

    // Note: This endpoint is technically protected in old code, but client download might generally avail?
    // Old code had withDPoP for download, so keeping it protected.

    const downloadUrl = await c.env.ctx.runAction(internal.client.getDownloadUrl, {
        versionId,
    });

    if (!downloadUrl) {
        return c.json({ error: "Version not found" }, 404);
    }

    return c.redirect(downloadUrl as string, 307);
});

protectedApi.patch("/computer/rustdesk-sync", async (c) => {
    const computerId = c.var.computerId;
    const body = await c.req.json();

    const clientVersion = c.req.header("X-Client-Version");

    const payload: Record<string, string | number> = {};

    if (body.rustdesk_id !== undefined) {
        payload.rustdesk_id = body.rustdesk_id;
    }
    if (body.name !== undefined) {
        payload.name = body.name;
    }
    if (body.ip !== undefined) {
        payload.ip = body.ip;
    }
    if (body.os !== undefined) {
        payload.os = body.os;
    }
    if (body.os_version !== undefined) {
        payload.os_version = body.os_version;
    }
    if (body.login_user !== undefined) {
        payload.login_user = body.login_user;
    }
    if (body.intune_id !== undefined) {
        payload.intune_id = body.intune_id;
    }

    const effectiveClientVersion = clientVersion || body.client_version;
    if (effectiveClientVersion !== undefined) {
        payload.client_version = effectiveClientVersion;
    }

    await c.env.ctx.runMutation(internal.computers.rustdeskSync, {
        computerId,
        data: payload,
    });

    return c.json({ status: "ok" });
});

// Mount protected routes
// Use Hono's app.route to mount protectedApi at the root
app.route("/", protectedApi);

/**
 * Public Client Version Check
 */
app.get("/client/version", async (c) => {
    const version = await c.env.ctx.runQuery(internal.client.getActiveVersion, {});
    return c.json(version || { version: null });
});

// ========================================
// Convex HTTP Router
// ========================================

const http = httpRouter();

// 1. Register BetterAuth Routes (handles /auth/* by default)
// cors: true enables CORS handling using trustedOrigins from createAuthOptions.
// Required for local dev where the browser hits localhost:3211 directly (different
// origin from the Next.js app on localhost:3000). Behind a proxy this is a no-op.
authComponent.registerRoutes(http, createAuth, { cors: true });

// 2. Register Hono App (Catch-all for everything else, except /auth/*)
// We register for each method to ensure full coverage
const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

// Create handler that skips auth routes (handled by Better Auth above)
const honoHandler = httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    // Skip /auth/* routes - they are handled by Better Auth
    if (url.pathname.startsWith("/auth")) {
        // Return 404 - should not reach here if Better Auth is configured correctly
        return new Response("Not Found", { status: 404 });
    }
    return app.fetch(request, { ctx });
});

methods.forEach((method) => {
    http.route({
        pathPrefix: "/",
        method: method as any,
        handler: honoHandler,
    });
});

export default http;
