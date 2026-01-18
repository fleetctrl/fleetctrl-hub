import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
    plugins: [convexClient()],
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession } = authClient;
