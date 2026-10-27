import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Database } from "@/server/db/client";
import type { AuthConfig } from "@/server/deps";
import { account, session, user, verification } from "./schema";

/**
 * Better Auth for the dashboard, mounted at `/auth/*` with `baseURL = SITE_URL`. Caddy forwards
 * `/auth*` without stripping a prefix, so the public URLs stay what the browser used with Convex.
 */
export function createAuth(deps: { db: Database; auth: AuthConfig }) {
    return betterAuth({
        secret: deps.auth.secret,
        baseURL: deps.auth.siteUrl,
        basePath: "/auth",
        trustedOrigins: deps.auth.trustedOrigins,
        database: drizzleAdapter(deps.db, {
            provider: "pg",
            schema: { user, session, account, verification },
        }),
        // Simple, non-verified email/password
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
        },
        user: {
            additionalFields: {
                role: { type: "string", required: false, input: false },
            },
        },
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                if (ctx.path === "/sign-up/email" && !deps.auth.allowRegistration) {
                    throw new APIError("BAD_REQUEST", {
                        message: "Registration is disabled",
                    });
                }
            }),
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;
