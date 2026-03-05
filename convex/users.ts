/**
 * Users Module
 *
 * Handles user-related queries for the admin panel.
 */


import { authComponent } from "./auth";
import { withAuthQuery } from "./lib/withAuth";

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
