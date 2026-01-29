import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

// In Docker: CONVEX_URL = internal container URL (http://convex:3210)
// NEXT_PUBLIC_CONVEX_URL = public URL for browser (https://localhost/api)
// The library's getToken() uses convexSiteUrl for server-side API calls,
// so we need to use the internal URL when running in Docker.
const serverConvexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

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
    convexSiteUrl: serverConvexUrl,
});
