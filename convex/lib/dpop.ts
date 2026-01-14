/**
 * DPoP (Demonstrating Proof-of-Possession) Validation
 * Implements RFC 9449 for token binding.
 */

import { importJWK, jwtVerify } from "jose";
import type { JWK } from "jose";

export interface DPoPClaims {
    htu: string;
    htm: string;
    iat: number;
    jti: string;
    ath?: string;
}

export interface DPoPResult {
    jwk: JWK;
    jkt: string;
    method: string;
    url: string;
    jti: string;
    issuedAt: Date;
    ath?: string;
}

/**
 * Validates a DPoP proof token.
 * Implements RFC 9449 DPoP validation.
 *
 * @param dpopHeader - The raw DPoP JWT from the DPoP header
 * @param expectedMethod - The expected HTTP method (GET, POST, etc.)
 * @param expectedUrl - The expected request URL (scheme + host + path, no query)
 * @returns DPoPResult with validated claims and computed JKT
 * @throws Error if validation fails
 */
export async function verifyDPoP(
    dpopHeader: string,
    expectedMethod: string,
    expectedUrl: string
): Promise<DPoPResult> {
    // 1. Decode header without verification to extract JWK
    const [headerB64] = dpopHeader.split(".");
    if (!headerB64) {
        throw new Error("Invalid DPoP format");
    }

    let header: { typ?: string; alg?: string; jwk?: JWK };
    try {
        const headerJson = Buffer.from(headerB64, "base64url").toString("utf-8");
        header = JSON.parse(headerJson);
    } catch {
        throw new Error("Invalid DPoP header encoding");
    }

    // 2. Validate header requirements
    if (header.typ?.toLowerCase() !== "dpop+jwt") {
        throw new Error("Invalid DPoP typ");
    }

    // 3. Reject symmetric algorithms
    if (!header.alg || header.alg.toUpperCase().startsWith("HS")) {
        throw new Error("DPoP alg not allowed");
    }

    // 4. Extract and validate JWK
    const jwk = header.jwk;
    if (!jwk) {
        throw new Error("Missing DPoP jwk");
    }

    // Reject symmetric key types
    if (jwk.kty === "oct") {
        throw new Error("Invalid DPoP key type");
    }

    // 5. Import public key and verify signature
    const publicKey = await importJWK(jwk, header.alg);
    const { payload } = await jwtVerify(dpopHeader, publicKey, {
        typ: "dpop+jwt",
    });

    const claims = payload as unknown as DPoPClaims;

    // 6. Validate required claims
    if (!claims.htm || !claims.htu || !claims.iat || !claims.jti) {
        throw new Error("Missing required DPoP claims");
    }

    // 7. Validate timing (iat freshness)
    const now = Date.now();
    const iat = claims.iat * 1000;
    const clockSkew = 2 * 60 * 1000; // 2 minutes
    const maxAge = 15 * 60 * 1000; // 15 minutes

    if (iat > now + clockSkew) {
        throw new Error("DPoP proof from the future");
    }

    if (now - iat > maxAge) {
        throw new Error("Stale DPoP proof");
    }

    // 8. Validate method and URL binding
    if (claims.htm.toUpperCase() !== expectedMethod.toUpperCase()) {
        throw new Error("htm mismatch");
    }

    if (claims.htu !== expectedUrl) {
        throw new Error("htu mismatch");
    }

    // 9. Compute JKT (JWK Thumbprint)
    const jkt = await computeJKT(jwk);

    return {
        jwk,
        jkt,
        method: claims.htm,
        url: claims.htu,
        jti: claims.jti,
        issuedAt: new Date(iat),
        ath: claims.ath,
    };
}

/**
 * Computes RFC 7638 JWK Thumbprint (SHA-256, base64url encoded)
 * The thumbprint is computed over a canonicalized JSON of required JWK members.
 *
 * @param jwk - JSON Web Key
 * @returns base64url encoded SHA-256 thumbprint
 */
export async function computeJKT(jwk: JWK): Promise<string> {
    // Extract required members based on key type (RFC 7638)
    let thumbprintInput: Record<string, string>;

    switch (jwk.kty) {
        case "RSA":
            if (!jwk.e || !jwk.n) {
                throw new Error("RSA key missing required members");
            }
            thumbprintInput = { e: jwk.e, kty: jwk.kty, n: jwk.n };
            break;
        case "EC":
            if (!jwk.crv || !jwk.x || !jwk.y) {
                throw new Error("EC key missing required members");
            }
            thumbprintInput = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
            break;
        case "OKP":
            if (!jwk.crv || !jwk.x) {
                throw new Error("OKP key missing required members");
            }
            thumbprintInput = { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
            break;
        default:
            throw new Error(`Unsupported key type: ${jwk.kty}`);
    }

    // Lexicographically sorted JSON (keys are already sorted in our objects)
    const sorted = JSON.stringify(
        thumbprintInput,
        Object.keys(thumbprintInput).sort()
    );

    // SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(sorted);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Base64url encode
    return Buffer.from(hashBuffer).toString("base64url");
}

/**
 * Validates ATH (Access Token Hash) in DPoP proof
 * Used to bind a DPoP proof to a specific access token.
 *
 * @param accessToken - The access token to verify
 * @param expectedATH - The ath claim from the DPoP proof
 * @returns true if ATH matches
 */
export async function verifyATH(
    accessToken: string,
    expectedATH: string
): Promise<boolean> {
    const encoder = new TextEncoder();
    const data = encoder.encode(accessToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const ath = Buffer.from(hashBuffer).toString("base64url");
    return ath === expectedATH;
}

/**
 * Computes the ATH (Access Token Hash) for a given access token.
 *
 * @param accessToken - The access token
 * @returns base64url encoded SHA-256 hash
 */
export async function computeATH(accessToken: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(accessToken);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Buffer.from(hashBuffer).toString("base64url");
}
