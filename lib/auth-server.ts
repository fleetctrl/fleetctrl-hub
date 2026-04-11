import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { env } from "./env";

// In Docker:
// - `CONVEX_URL` is the internal Convex API URL (http://convex:3210)
// - `CONVEX_SITE_INTERNAL_URL` is the internal Convex "site" URL (http://convex:3211)
// - `NEXT_PUBLIC_CONVEX_URL` is the public API URL for the browser (https://localhost/api)
// - `NEXT_PUBLIC_CONVEX_SITE_URL` is the public site URL for the browser (https://localhost)
const serverConvexUrl = env.CONVEX_URL || env.NEXT_PUBLIC_CONVEX_URL!;
const serverConvexSiteUrl =
    env.CONVEX_SITE_INTERNAL_URL ||
    env.CONVEX_URL ||
    env.NEXT_PUBLIC_CONVEX_SITE_URL!;

export const {
    handler,
    preloadAuthQuery,
    isAuthenticated,
    getToken,
    fetchAuthQuery,
    fetchAuthMutation,
    fetchAuthAction,
} = convexBetterAuthNextJs({
    convexUrl: serverConvexUrl,
    convexSiteUrl: serverConvexSiteUrl,
});
