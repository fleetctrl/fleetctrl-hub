import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { env } from "./env";

export const authClient = createAuthClient({
    baseURL: env.NEXT_PUBLIC_CONVEX_SITE_URL + "/auth",
    plugins: [convexClient()],
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession } = authClient;
