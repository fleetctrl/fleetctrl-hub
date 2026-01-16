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
import { api, internal } from "./_generated/api";
import { verifyDPoP, computeATH } from "./lib/dpop";
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
        // Convex request URL typically includes origin, verify matches expectations
        const expectedUrl = url.href;

        // Verify DPoP proof
        const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedUrl);

        // Check JTI for replay
        try {
            await c.env.ctx.runMutation(api.lib.jtiStore.checkAndStore, {
                jti: dpopResult.jti,
            });
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
        const { name, fingerprint, fingerprint_hash, jkt } = body as {
            name?: string;
            fingerprint?: string;
            fingerprint_hash?: string;
            jkt?: string;
        };

        const fp = fingerprint || fingerprint_hash; // Backwards compatibility

        if (!name || !fp || !jkt) {
            return c.json({ error: "Missing required fields" }, 400);
        }

        const result = await c.env.ctx.runAction(api.deviceAuth.enroll, {
            enrollmentToken,
            name,
            fingerprint: fp,
            jkt,
        });

        return c.json({ tokens: result }, 201);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Enrollment failed";
        return c.json({ error: message }, 400);
    }
});

/**
 * Check Enrollment Status
 */
app.get("/enroll/:fingerprint/is-enrolled", async (c) => {
    const fingerprint = c.req.param("fingerprint");

    if (!fingerprint) {
        return c.json({ error: "Missing fingerprint" }, 400);
    }

    const result = await c.env.ctx.runQuery(api.deviceAuth.isEnrolled, {
        fingerprint,
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

        const result = await c.env.ctx.runAction(api.deviceAuth.refreshTokens, {
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
        const expectedUrl = url.href;

        // Verify DPoP proof
        const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedUrl);

        // Check JTI for replay
        try {
            await c.env.ctx.runMutation(api.lib.jtiStore.checkAndStore, {
                jti: dpopResult.jti,
            });
        } catch {
            return c.json({ error: "Replayed DPoP proof" }, 401);
        }

        const result = await c.env.ctx.runAction(api.deviceAuth.recover, {
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
    const tasks = await c.env.ctx.runQuery(api.tasks.getPending, { computerId });
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

    await c.env.ctx.runMutation(api.tasks.updateStatus, {
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
    const apps = await c.env.ctx.runQuery(api.apps.getAssigned, { computerId });
    return c.json({ apps });
});

protectedApi.get("/apps/download/:releaseId", async (c) => {
    const computerId = c.var.computerId;
    const releaseId = c.req.param("releaseId");

    const downloadUrl = await c.env.ctx.runAction(api.apps.getDownloadUrl, {
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
        api.apps.getRequirementDownloadUrl,
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

/**
 * Client Updates
 */
protectedApi.get("/client/download/:versionId", async (c) => {
    const versionId = c.req.param("versionId");

    // Note: This endpoint is technically protected in old code, but client download might generally avail?
    // Old code had withDPoP for download, so keeping it protected.

    const downloadUrl = await c.env.ctx.runAction(api.client.getDownloadUrl, {
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

    const payload = {
        ...body,
        client_version: clientVersion || body.client_version,
    };

    await c.env.ctx.runMutation(api.computers.rustdeskSync, {
        computerId,
        data: payload,
    });

    return c.json({ status: "ok" });
});

// Mount protected routes
app.route("/", protectedApi);

/**
 * Public Client Version Check
 */
app.get("/client/version", async (c) => {
    const version = await c.env.ctx.runQuery(api.client.getActiveVersion, {});
    return c.json(version || { version: null });
});

// ========================================
// Convex HTTP Router
// ========================================

const http = httpRouter();

// 1. Register BetterAuth Routes (handles /api/auth/*)
authComponent.registerRoutes(http, createAuth);

// 2. Register Hono App (Catch-all for everything else)
// We register for each method to ensure full coverage
const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

methods.forEach((method) => {
    http.route({
        pathPrefix: "/",
        method: method as any,
        handler: httpAction(async (ctx, request) => {
            return app.fetch(request, { ctx });
        }),
    });
});

export default http;
