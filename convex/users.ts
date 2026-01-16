/**
 * Users Module
 *
 * Handles user-related queries for the admin panel.
 */

import { query } from "./_generated/server";
import { authComponent } from "./auth";

/**
 * Get the currently authenticated user.
 * Returns null if not authenticated.
 */
export const viewer = query({
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
