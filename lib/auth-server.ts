import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { getToken as getRequestToken } from "@convex-dev/better-auth/utils";
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

const authOptions = {
    convexUrl: serverConvexUrl,
    convexSiteUrl: serverConvexSiteUrl,
    jwtCache: {
        enabled: true,
        isAuthError: (error: unknown) => {
            if (!(error instanceof Error)) {
                return false;
            }

            return /unauth|unauthorized|forbidden/i.test(error.message);
        },
    },
};

const auth = convexBetterAuthNextJs(authOptions);

const getRequestHeaders = async () => {
    const nextHeaders = await (await import("next/headers.js")).headers();
    const headers = new Headers(nextHeaders);
    headers.delete("content-length");
    headers.delete("transfer-encoding");
    headers.set("accept-encoding", "identity");
    return headers;
};

const isConnectionError = (error: unknown) => {
    if (!(error instanceof Error)) {
        return false;
    }

    return /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(error.message);
};

export const {
    handler,
    preloadAuthQuery,
    isAuthenticated,
    fetchAuthQuery,
    fetchAuthMutation,
    fetchAuthAction,
} = auth;

export async function getToken() {
    try {
        return await auth.getToken();
    } catch (error) {
        if (!isConnectionError(error)) {
            throw error;
        }

        try {
            const headers = await getRequestHeaders();
            const token = await getRequestToken(authOptions.convexSiteUrl, headers, {
                jwtCache: authOptions.jwtCache,
            });

            return token.token ?? null;
        } catch {
            return null;
        }
    }
}
