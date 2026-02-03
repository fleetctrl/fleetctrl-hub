import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import authConfig from "./auth.config";

const normalizeBaseUrl = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/\/+$/, "");
};

const stripApiSuffix = (value?: string) => {
    if (!value) return undefined;
    return value.replace(/\/api$/, "");
};

const getBaseUrl = () => {
    // Better Auth routes are hosted on the Convex "site" server (port 3211) at
    // paths like `/auth/*`. In the local Docker setup we mount the site server
    // behind the proxy at `/api/*` and strip `/api` before forwarding.
    //
    // Because of that, Better Auth's `baseURL` must NOT include the `/api` prefix
    // (otherwise Better Auth will treat `/auth/*` as out-of-scope and return 404).
    const url =
        normalizeBaseUrl(process.env.SITE_URL) ??
        normalizeBaseUrl(stripApiSuffix(normalizeBaseUrl(process.env.CONVEX_SITE_URL))) ??
        normalizeBaseUrl(stripApiSuffix(normalizeBaseUrl(process.env.API_URL)));
    // Fallback for local self-hosted development where process.env may not be available
    // during Convex module analysis
    return url || "https://localhost";
};

import authSchema from "./betterAuth/schema";

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
    local: {
        schema: authSchema,
    },
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
    return {
        baseURL: getBaseUrl(),
        basePath: "/auth",
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
        },
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                if (ctx.path === "/sign-up/email") {
                    const allowRegistration = process.env.ALLOW_REGISTRATION !== "false";
                    if (!allowRegistration) {
                        throw new APIError("BAD_REQUEST", {
                            message: "Registration is disabled",
                        });
                    }
                }
            }),
        },
        plugins: [
            // The Convex plugin is required for Convex compatibility
            convex({ authConfig, options: { basePath: "/auth" } }),
        ],
    };
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth(createAuthOptions(ctx));
};

// Get the current authenticated user
export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
    },
});
