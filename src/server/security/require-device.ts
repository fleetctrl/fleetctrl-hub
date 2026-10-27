import { createMiddleware } from "hono/factory";
import type { Database } from "@/server/db/client";
import { computeATH, verifyDPoP } from "./dpop";
import { expectedHtu } from "./dpop-request";
import { storeJti } from "./jti";
import { verifyAccessToken, type TokenConfig, type TokenPayload } from "./jwt";

export type DeviceEnv = {
    Variables: {
        computerId: string;
    };
};

/**
 * Authenticates device requests: DPoP proof (signature, htm/htu binding, replay), DPoP-bound
 * access token (cnf.jkt and ath), and a `device:<id>` subject. Ported from the `dpopAuth`
 * middleware in convex/http.ts with the same status codes and `{ error }` bodies.
 */
export function requireDevice(deps: { db: Database; tokens: TokenConfig }) {
    return createMiddleware<DeviceEnv>(async (c, next) => {
        let computerId: string;
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
            const dpopResult = await verifyDPoP(dpopHeader, c.req.method, expectedHtu(c, deps.tokens.apiUrl));

            if (!(await storeJti(deps.db, dpopResult.jti))) {
                return c.json({ error: "Replayed DPoP proof" }, 401);
            }

            let tokenPayload: TokenPayload;
            try {
                tokenPayload = await verifyAccessToken(deps.tokens, accessToken);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : "Invalid access token";
                return c.json({ error: message }, 401);
            }

            if (tokenPayload.cnf?.jkt !== dpopResult.jkt) {
                return c.json({ error: "JKT mismatch" }, 401);
            }

            if (dpopResult.ath) {
                const expectedAth = await computeATH(accessToken);
                if (dpopResult.ath !== expectedAth) {
                    return c.json({ error: "ATH mismatch" }, 401);
                }
            }

            const sub = tokenPayload.sub;
            if (!sub.startsWith("device:")) {
                return c.json({ error: "Invalid token subject" }, 401);
            }
            computerId = sub.slice(7);
        } catch (error: unknown) {
            console.error("DPoP validation error:", error);
            const message = error instanceof Error ? error.message : "Authentication failed";
            return c.json({ error: message }, 401);
        }

        c.set("computerId", computerId);
        await next();
    });
}
