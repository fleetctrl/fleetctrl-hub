import type { AuthConfig } from "convex/server";

// Custom auth config provider for self-hosted Convex
// The standard getAuthConfigProvider uses process.env.CONVEX_SITE_URL which 
// may not be available during module analysis in self-hosted environments
const getSiteUrl = () => {
  return process.env.CONVEX_SITE_URL || process.env.SITE_URL || "https://localhost";
};

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: getSiteUrl(),
      applicationID: "convex",
      algorithm: "RS256" as const,
      jwks: `${getSiteUrl()}/api/auth/convex/jwks`,
    },
  ],
} satisfies AuthConfig;
