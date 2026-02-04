import type { AuthConfig } from "convex/server";

// Custom auth config provider for self-hosted Convex
// The standard getAuthConfigProvider uses process.env.CONVEX_SITE_URL which 
// may not be available during module analysis in self-hosted environments
const normalizeBaseUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
};

const getIssuerUrl = () => {
  return (
    normalizeBaseUrl(process.env.CONVEX_SITE_URL) ||
    normalizeBaseUrl(process.env.SITE_URL) ||
    "https://localhost"
  );
};

const getJwksBaseUrl = (issuer: string) => {
  // Convex (the backend) needs to fetch the JWKS to verify RS256 tokens.
  // In local Docker setups, `issuer` is typically an https URL (e.g. https://localhost)
  // which may not be reachable or trusted (self-signed) from inside the backend.
  //
  // Prefer an internal http URL if provided, otherwise fall back to the local site port.
  const internal = normalizeBaseUrl(process.env.CONVEX_SITE_INTERNAL_URL);
  if (internal) return internal;

  const isLocalIssuer =
    issuer.includes("localhost") || issuer.includes("127.0.0.1");
  if (isLocalIssuer) return "http://127.0.0.1:3211";

  return issuer;
};

const issuer = getIssuerUrl();
const jwksBaseUrl = getJwksBaseUrl(issuer);

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer,
      applicationID: "convex",
      algorithm: "RS256" as const,
      jwks: `${jwksBaseUrl}/auth/convex/jwks`,
    },
  ],
} satisfies AuthConfig;
