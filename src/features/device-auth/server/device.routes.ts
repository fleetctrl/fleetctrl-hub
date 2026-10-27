import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { verifyDPoP } from "@/server/security/dpop";
import { expectedHtu } from "@/server/security/dpop-request";
import { storeJti } from "@/server/security/jti";
import { enroll, isEnrolled, recover, refreshTokensFor } from "./service";

/** Public device routes (no access token yet). Ported from convex/http.ts with the same status codes. */
export function deviceAuthDeviceRoutes(deps: AppDeps) {
    return new Hono()
        .post("/enroll", async (c) => {
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

                    const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedHtu(c, deps.tokens.apiUrl));

                    if (!(await storeJti(deps.db, dpopResult.jti))) {
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

                const result = await enroll(deps, {
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
                    201,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Enrollment failed";
                return c.json({ error: message }, 400);
            }
        })
        // Behavior change from v2: a deleted computer now gets 404 (v2 only checked the ID format).
        .get("/devices/:deviceId/is-enrolled", async (c) => {
            const deviceId = c.req.param("deviceId");

            if (!deviceId) {
                return c.json({ error: "Missing deviceId" }, 400);
            }

            if (await isEnrolled(deps.db, deviceId)) {
                return c.json({ is_enrolled: true });
            }
            return c.json({ is_enrolled: false }, 404);
        })
        .post("/token/refresh", async (c) => {
            try {
                const body = await c.req.json();
                const { refresh_token } = body as { refresh_token?: string };

                if (!refresh_token) {
                    return c.json({ error: "Missing refresh_token" }, 400);
                }

                // Verified here instead of requireDevice: there is no valid access token yet, just a proof.
                const dpopHeader = c.req.header("DPoP");
                if (!dpopHeader) {
                    return c.json({ error: "Missing DPoP header" }, 401);
                }

                const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedHtu(c, deps.tokens.apiUrl));

                if (!(await storeJti(deps.db, dpopResult.jti))) {
                    return c.json({ error: "Replayed DPoP proof" }, 401);
                }

                const result = await refreshTokensFor(deps, { refreshToken: refresh_token, dpopJkt: dpopResult.jkt });
                return c.json({ tokens: result });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Token refresh failed";
                return c.json({ error: message }, 401);
            }
        })
        .post("/token/recover", async (c) => {
            try {
                const dpopHeader = c.req.header("DPoP");
                if (!dpopHeader) {
                    return c.json({ error: "Missing DPoP header" }, 401);
                }

                const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedHtu(c, deps.tokens.apiUrl));

                if (!(await storeJti(deps.db, dpopResult.jti))) {
                    return c.json({ error: "Replayed DPoP proof" }, 401);
                }

                const result = await recover(deps, dpopResult.jkt);
                return c.json({ tokens: result });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Token recovery failed";
                return c.json({ error: message }, 401);
            }
        });
}
