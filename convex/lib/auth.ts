import { GenericCtx } from "@convex-dev/better-auth";
import { authComponent } from "../auth";
import { DataModel } from "../_generated/dataModel";

/**
 * Helper to check if the current user is an authenticated admin.
 * Throws an error if not authenticated.
 */
export async function checkAdmin(ctx: GenericCtx<DataModel>) {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
        throw new Error("Unauthorized: Admin access required");
    }
    return user;
}
