import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_CONVEX_URL + "/auth",
    plugins: [convexClient()],
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession } = authClient;
