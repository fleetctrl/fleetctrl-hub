import { createAuthClient } from "better-auth/react";
import { env } from "@/lib/env";

// Better Auth runs in the API service at /auth, on the same origin as the dashboard
// (Caddy routes /auth* to the API; `next dev` rewrites it).
export const authClient = createAuthClient({
    baseURL: `${typeof window === "undefined" ? env.NEXT_PUBLIC_SITE_URL : window.location.origin}/auth`,
});

// Export commonly used methods for convenience
export const { signIn, signUp, signOut, useSession } = authClient;
