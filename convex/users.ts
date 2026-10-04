/**
 * Users Module
 *
 * Handles user-related queries for the admin panel.
 */


import { v } from "convex/values";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { authComponent, isRegistrationOpen } from "./auth";
import { withAuthQuery } from "./lib/withAuth";

/**
 * Whether the sign-in page should offer sign-up.
 * Public: the sign-in page calls it before anyone is logged in.
 */
export const registrationOpen = query({
    args: {},
    returns: v.boolean(),
    handler: async (ctx) => {
        const anyUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
        });
        return isRegistrationOpen(anyUser !== null);
    },
});

/**
 * Get the currently authenticated user.
 * Returns null if not authenticated.
 */
export const viewer = withAuthQuery({
    args: {},
    handler: async (ctx) => {
        try {
            const authUser = await authComponent.getAuthUser(ctx);
            if (!authUser) {
                return null;
            }

            return {
                id: authUser._id,
                email: authUser.email,
                name: authUser.name,
            };
        } catch {
            // User is not authenticated
            return null;
        }
    },
});
