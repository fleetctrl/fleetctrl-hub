import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
    return betterAuth({
        baseURL: siteUrl,
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
            convex({ authConfig }),
        ],
    });
};

// Get the current authenticated user
export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
    },
});
