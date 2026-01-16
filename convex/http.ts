/**
 * HTTP Actions - API Compatibility Layer
 *
 * Provides HTTP endpoints that match the existing Go API.
 * Clients can continue using the same endpoints with no changes.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { verifyDPoP, computeATH } from "./lib/dpop";
import { verifyAccessToken } from "./lib/jwt";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Register BetterAuth routes for admin authentication
authComponent.registerRoutes(http, createAuth);

// ========================================
// CORS Configuration
// ========================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, DPoP, Content-Type, X-Client-Version, enrollment-token",
};

// ========================================
// Response Helpers
// ========================================

function errorResponse(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
        },
    });
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
        },
    });
}

// ========================================
// DPoP Protected Handler Wrapper
// ========================================

type ActionContext = {
    runQuery: (query: unknown, args: unknown) => Promise<unknown>;
    runMutation: (mutation: unknown, args: unknown) => Promise<unknown>;
    runAction: (action: unknown, args: unknown) => Promise<unknown>;
};

type ProtectedHandler = (
    ctx: ActionContext,
    request: Request,
    computerId: string
) => Promise<Response>;

/**
 * Wraps an HTTP handler with DPoP validation.
 * Validates the DPoP proof, access token, and JKT binding.
 */
function withDPoP(handler: ProtectedHandler) {
    return httpAction(async (ctx, request: Request) => {
        try {
            // 1. Extract headers
            const dpopHeader = request.headers.get("DPoP");
            const authHeader = request.headers.get("Authorization");

            if (!dpopHeader) {
                return errorResponse(401, "Missing DPoP header");
            }

            if (!authHeader?.startsWith("Bearer ")) {
                return errorResponse(401, "Missing bearer token");
            }

            const accessToken = authHeader.slice(7);
            const url = new URL(request.url);
            const expectedUrl = `${url.origin}${url.pathname}`;

            // 2. Verify DPoP proof
            const dpopResult = await verifyDPoP(
                dpopHeader,
                request.method,
                expectedUrl
            );

            // 3. Check JTI for replay
            try {
                await ctx.runMutation(api.lib.jtiStore.checkAndStore, {
                    jti: dpopResult.jti,
                });
            } catch {
                return errorResponse(401, "Replayed DPoP proof");
            }

            // 4. Verify access token
            let tokenPayload;
            try {
                tokenPayload = await verifyAccessToken(accessToken);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : "Invalid access token";
                return errorResponse(401, message);
            }

            // 5. Verify JKT binding
            if (tokenPayload.cnf?.jkt !== dpopResult.jkt) {
                return errorResponse(401, "JKT mismatch");
            }

            // 6. Verify ATH if present
            if (dpopResult.ath) {
                const expectedAth = await computeATH(accessToken);
                if (dpopResult.ath !== expectedAth) {
                    return errorResponse(401, "ATH mismatch");
                }
            }

            // 7. Extract computer ID from subject
            const sub = tokenPayload.sub;
            if (!sub.startsWith("device:")) {
                return errorResponse(401, "Invalid token subject");
            }
            const computerId = sub.slice(7);

            // 8. Update client version if provided
            const clientVersion = request.headers.get("X-Client-Version");
            if (clientVersion) {
                try {
                    await ctx.runMutation(internal.computers.updateClientVersion, {
                        computerId,
                        clientVersion,
                    });
                } catch {
                    // Non-critical, continue even if this fails
                }
            }

            // Call the actual handler
            return await handler(ctx as ActionContext, request, computerId);
        } catch (error: unknown) {
            console.error("DPoP validation error:", error);
            const message =
                error instanceof Error ? error.message : "Authentication failed";
            return errorResponse(401, message);
        }
    });
}

// ========================================
// CORS Preflight Handler
// ========================================

// Handle OPTIONS requests for CORS preflight
http.route({
    pathPrefix: "/",
    method: "OPTIONS",
    handler: httpAction(async () => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }),
});

// ========================================
// AUTH ENDPOINTS
// ========================================

/**
 * POST /enroll
 * Enroll a new computer or re-enroll an existing one.
 */
http.route({
    path: "/enroll",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const enrollmentToken = request.headers.get("enrollment-token");
            if (!enrollmentToken) {
                return errorResponse(400, "Missing enrollment-token");
            }

            const body = await request.json();
            const { name, fingerprint_hash, jkt } = body as {
                name?: string;
                fingerprint_hash?: string;
                jkt?: string;
            };

            if (!name || !fingerprint_hash || !jkt) {
                return errorResponse(400, "Missing required fields");
            }

            const result = await ctx.runAction(api.deviceAuth.enroll, {
                enrollmentToken,
                name,
                fingerprintHash: fingerprint_hash,
                jkt,
            });

            return jsonResponse({ tokens: result }, 201);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Enrollment failed";
            return errorResponse(400, message);
        }
    }),
});

/**
 * POST /token/refresh
 * Refresh access token using a valid refresh token.
 */
http.route({
    path: "/token/refresh",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const body = await request.json();
            const { refresh_token } = body as { refresh_token?: string };

            if (!refresh_token) {
                return errorResponse(400, "Missing refresh_token");
            }

            const result = await ctx.runAction(api.deviceAuth.refreshTokens, {
                refreshToken: refresh_token,
            });

            return jsonResponse({ tokens: result });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Token refresh failed";
            return errorResponse(401, message);
        }
    }),
});

/**
 * POST /token/recover
 * Recover tokens using DPoP proof (for lost refresh tokens).
 */
http.route({
    path: "/token/recover",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        try {
            const dpopHeader = request.headers.get("DPoP");
            if (!dpopHeader) {
                return errorResponse(401, "Missing DPoP header");
            }

            const url = new URL(request.url);
            const expectedUrl = `${url.origin}${url.pathname}`;

            const dpopResult = await verifyDPoP(
                dpopHeader,
                request.method,
                expectedUrl
            );

            // Check JTI for replay
            try {
                await ctx.runMutation(api.lib.jtiStore.checkAndStore, {
                    jti: dpopResult.jti,
                });
            } catch {
                return errorResponse(401, "Replayed DPoP proof");
            }

            const result = await ctx.runAction(api.deviceAuth.recover, {
                jkt: dpopResult.jkt,
            });

            return jsonResponse({ tokens: result });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Token recovery failed";
            return errorResponse(401, message);
        }
    }),
});

/**
 * GET /enroll/:fingerprintHash/is-enrolled
 * Check if a computer is enrolled.
 */
http.route({
    path: "/enroll/{fingerprintHash}/is-enrolled",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        const url = new URL(request.url);
        // Extract fingerprintHash from path
        const pathParts = url.pathname.split("/");
        const fingerprintHash = pathParts[2];

        if (!fingerprintHash) {
            return errorResponse(400, "Missing fingerprint hash");
        }

        const result = await ctx.runQuery(api.deviceAuth.isEnrolled, {
            fingerprintHash,
        });

        if (result) {
            return jsonResponse({ is_enrolled: true });
        }
        return jsonResponse({ is_enrolled: false }, 404);
    }),
});

// ========================================
// TASKS ENDPOINTS
// ========================================

/**
 * GET /tasks
 * Get pending tasks for the authenticated computer.
 */
http.route({
    path: "/tasks",
    method: "GET",
    handler: withDPoP(async (ctx, _request, computerId) => {
        const tasks = await ctx.runQuery(api.tasks.getPending, { computerId });
        return jsonResponse({ tasks });
    }),
});

/**
 * PATCH /task/:id
 * Update task status.
 */
http.route({
    path: "/task/{taskId}",
    method: "PATCH",
    handler: withDPoP(async (ctx, request, computerId) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split("/");
        const taskId = pathParts[2];

        if (!taskId) {
            return errorResponse(400, "Missing task ID");
        }

        const body = await request.json();
        const { status, error } = body as { status?: string; error?: string };

        if (!status) {
            return errorResponse(400, "Missing status");
        }

        await ctx.runMutation(api.tasks.updateStatus, {
            taskId,
            computerId,
            status,
            error: error || null,
        });

        return jsonResponse({ status: "ok" });
    }),
});

// ========================================
// APPS ENDPOINTS
// ========================================

/**
 * GET /apps/assigned
 * Get apps assigned to the authenticated computer.
 */
http.route({
    path: "/apps/assigned",
    method: "GET",
    handler: withDPoP(async (ctx, _request, computerId) => {
        const apps = await ctx.runQuery(api.apps.getAssigned, { computerId });
        return jsonResponse({ apps });
    }),
});

/**
 * GET /apps/download/:releaseID
 * Download app binary (redirects to signed URL).
 */
http.route({
    path: "/apps/download/{releaseId}",
    method: "GET",
    handler: withDPoP(async (ctx, request, computerId) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split("/");
        const releaseId = pathParts[3];

        if (!releaseId) {
            return errorResponse(400, "Missing release ID");
        }

        const downloadUrl = await ctx.runAction(api.apps.getDownloadUrl, {
            computerId,
            releaseId,
        });

        if (!downloadUrl) {
            return errorResponse(404, "Release not found or access denied");
        }

        return Response.redirect(downloadUrl as string, 307);
    }),
});

/**
 * GET /apps/requirement/download/:requirementID
 * Download requirement binary (redirects to signed URL).
 */
http.route({
    path: "/apps/requirement/download/{requirementId}",
    method: "GET",
    handler: withDPoP(async (ctx, request, computerId) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split("/");
        const requirementId = pathParts[4];

        if (!requirementId) {
            return errorResponse(400, "Missing requirement ID");
        }

        const downloadUrl = await ctx.runAction(api.apps.getRequirementDownloadUrl, {
            computerId,
            requirementId,
        });

        if (!downloadUrl) {
            return errorResponse(404, "Requirement not found or access denied");
        }

        return Response.redirect(downloadUrl as string, 307);
    }),
});

// ========================================
// CLIENT UPDATES ENDPOINTS
// ========================================

/**
 * GET /client/version
 * Get the currently active client version.
 */
http.route({
    path: "/client/version",
    method: "GET",
    handler: httpAction(async (ctx) => {
        const version = await ctx.runQuery(api.client.getActiveVersion, {});
        return jsonResponse(version || { version: null });
    }),
});

/**
 * GET /client/download/:versionID
 * Download client binary (redirects to signed URL).
 */
http.route({
    path: "/client/download/{versionId}",
    method: "GET",
    handler: withDPoP(async (ctx, request, _computerId) => {
        const url = new URL(request.url);
        const pathParts = url.pathname.split("/");
        const versionId = pathParts[3];

        if (!versionId) {
            return errorResponse(400, "Missing version ID");
        }

        const downloadUrl = await ctx.runAction(api.client.getDownloadUrl, {
            versionId,
        });

        if (!downloadUrl) {
            return errorResponse(404, "Version not found");
        }

        return Response.redirect(downloadUrl as string, 307);
    }),
});

// ========================================
// COMPUTER SYNC ENDPOINTS
// ========================================

/**
 * PATCH /computer/rustdesk-sync
 * Sync RustDesk data for the authenticated computer.
 */
http.route({
    path: "/computer/rustdesk-sync",
    method: "PATCH",
    handler: withDPoP(async (ctx, request, computerId) => {
        const body = await request.json();

        await ctx.runMutation(api.computers.rustdeskSync, {
            computerId,
            data: body,
        });

        return jsonResponse({ status: "ok" });
    }),
});

// ========================================
// HEALTH CHECK
// ========================================

/**
 * GET /health
 * Health check endpoint.
 */
http.route({
    path: "/health",
    method: "GET",
    handler: httpAction(async () => {
        return jsonResponse({ status: "ok" });
    }),
});

export default http;
