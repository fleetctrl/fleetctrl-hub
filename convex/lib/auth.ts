import { GenericCtx } from "@convex-dev/better-auth";
import { authComponent } from "../auth";
import { DataModel } from "../_generated/dataModel";

/**
 * Helper to check if the current user is an authenticated admin.
 * Throws an error if not authenticated.
 */
export async function checkAdmin(ctx: GenericCtx<DataModel>) {
    // We wrap getAuthUser in a try/catch because it might throw "Unauthenticated"
    // instead of returning null depending on the component version/config.
    let user;
    try {
        user = await authComponent.getAuthUser(ctx);
    } catch (e) {
        // Check if it's a known auth error
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("Unauthenticated")) {
            throw new Error("Unauthenticated: Please sign in. If you are signed in, check if CONVEX_SITE_URL is correctly configured.");
        }
        console.error("Auth check failed:", e);
        user = null;
    }

    if (!user) {
        throw new Error("Unauthorized: Admin access required");
    }
    return user;
}
