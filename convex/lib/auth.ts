import { SignJWT, importJWK, jwtVerify, calculateJwkThumbprint } from "jose";

/**
 * Verify DPoP header and claims.
 * This function mimics the behavior of the Go backend's auth service.
 */
export async function verifyDPoP(
  dpopHeader: string | null,
  method: string,
  url: string,
  nonceChecker?: (jti: string) => Promise<boolean>
) {
  if (!dpopHeader) {
    throw new Error("Missing DPoP header");
  }

  // 1. Parse and verify DPoP JWT
  // We don't know the key yet, it's embedded in the header (jwk).
  // 'jose' can extract it, but we need to trust it for the signature first,
  // then we use the Thumbprint (jkt) to identify the device.

  // Decoded header to get JWK
  // Note: jwtVerify with a function key resolver can handle embedded JWK
  const { payload, protectedHeader } = await jwtVerify(
    dpopHeader,
    async (protectedHeader, token) => {
      if (!protectedHeader.jwk) {
        throw new Error("Missing DPoP jwk");
      }
      if (protectedHeader.typ !== "dpop+jwt") {
         throw new Error("Invalid DPoP typ");
      }
      if (protectedHeader.alg && protectedHeader.alg.startsWith("HS")) {
         throw new Error("DPoP alg not allowed"); // Asymmetric only
      }
      return importJWK(protectedHeader.jwk, protectedHeader.alg);
    },
    {
      typ: "dpop+jwt",
      algorithms: ["ES256", "RS256"], // Allowed algs
    }
  );

  // 2. Validate Claims
  const now = Math.floor(Date.now() / 1000);
  const iat = payload.iat;
  if (!iat || now - iat > 900) { // 15 mins window? Go code says 15 mins max
     // Go code: if iat.After(now.Add(2*time.Minute)) || now.Sub(iat) > 15*time.Minute
     // Simple check: not too old, not in future
     throw new Error("Stale DPoP proof");
  }

  if (payload.htm !== method) {
    throw new Error("htm mismatch");
  }

  if (payload.htu !== url) {
    // Basic normalization might be needed here (e.g. trailing slash)
    // For now strict match
    throw new Error(`htu mismatch: expected ${url}, got ${payload.htu}`);
  }

  // 3. Replay Protection (JTI)
  if (payload.jti && nonceChecker) {
    const isReplay = await nonceChecker(payload.jti as string);
    if (isReplay) {
        throw new Error("Replayed DPoP proof");
    }
  }

  // 4. Compute JKT (Thumbprint)
  if (!protectedHeader.jwk) {
      throw new Error("Missing JWK");
  }
  const thumbprint = await calculateJwkThumbprint(protectedHeader.jwk, "sha256");

  return {
    jkt: thumbprint,
    jwk: protectedHeader.jwk,
    payload
  };
}

/**
 * Generate Access and Refresh Tokens
 */
export async function issueTokens(
  subject: string, // "device:uuid"
  computerId: string,
  jkt: string,
  apiUrl: string,
  jwtSecret: string
) {
  const secretKey = new TextEncoder().encode(jwtSecret);

  // Access Token (JWT)
  const atExp = Math.floor(Date.now() / 1000) + 900; // 15 mins
  const accessToken = await new SignJWT({
    sub: subject,
    cnf: { jkt }, // Bind to key
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(apiUrl)
    .setAudience(apiUrl)
    .setExpirationTime(atExp)
    .sign(secretKey);

  // Refresh Token (Random string, stored in DB)
  // We generate a random string and return it.
  // The hashing happens before DB insertion (in the calling Action).
  const refreshToken = crypto.randomUUID(); // Simple UUID as refresh token for now

  return {
    accessToken,
    refreshToken,
    expiresIn: 900,
  };
}

export async function hashToken(token: string) {
    // SHA-256 and Base64URL encode
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
