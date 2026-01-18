/**
 * JWT Token Service
 * Handles access token and refresh token generation for device authentication.
 */

import { SignJWT, jwtVerify } from "jose";
import { arrayBufferToBase64Url } from "./encoding";

// Token TTLs
const ACCESS_TOKEN_TTL = 900; // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 2592000; // 30 days in seconds

export interface TokenPayload {
    sub: string;
    cnf?: { jkt: string };
    iat: number;
    exp: number;
    iss: string;
    aud: string;
}

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

/**
 * Issues a new access token bound to a JWK Thumbprint (DPoP cnf claim).
 *
 * @param subject - Token subject (e.g., "device:computerId")
 * @param jkt - JWK Thumbprint for DPoP binding
 * @returns Object with token string and expiration timestamp
 */
export async function issueAccessToken(
    subject: string,
    jkt: string
): Promise<{ token: string; expiresAt: number }> {
    const jwtSecret = process.env.JWT_SECRET;
    const apiUrl = process.env.API_URL;

    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error("JWT_SECRET is missing or too short (>=32 chars)");
    }

    if (!apiUrl) {
        throw new Error("API_URL is not configured");
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ACCESS_TOKEN_TTL;

    const token = await new SignJWT({
        cnf: { jkt },
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(expiresAt)
        .setIssuer(apiUrl)
        .setAudience(apiUrl)
        .setSubject(subject)
        .sign(secret);

    return { token, expiresAt: expiresAt * 1000 };
}

/**
 * Verifies an access token and returns the payload.
 *
 * @param token - The access token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
    const jwtSecret = process.env.JWT_SECRET;
    const apiUrl = process.env.API_URL;

    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error("JWT_SECRET is missing or too short");
    }

    if (!apiUrl) {
        throw new Error("API_URL is not configured");
    }

    const secret = new TextEncoder().encode(jwtSecret);

    const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        issuer: apiUrl,
        audience: apiUrl,
    });

    return payload as unknown as TokenPayload;
}

/**
 * Generates a cryptographically secure random refresh token.
 * Uses 32 bytes (256 bits) of randomness.
 *
 * @returns Base64url encoded random token
 */
export function generateRefreshToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return arrayBufferToBase64Url(bytes);
}

/**
 * Computes SHA-256 hash of a token for secure storage.
 * Never store raw tokens in the database!
 *
 * @param token - The token to hash
 * @returns Base64url encoded SHA-256 hash
 */
export async function hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return arrayBufferToBase64Url(hashBuffer);
}

/**
 * Returns the expiration timestamp for a new refresh token.
 *
 * @returns Expiration timestamp in milliseconds
 */
export function getRefreshTokenExpiry(): number {
    return Date.now() + REFRESH_TOKEN_TTL * 1000;
}

/**
 * Returns the access token TTL in seconds.
 *
 * @returns TTL in seconds
 */
export function getAccessTokenTTL(): number {
    return ACCESS_TOKEN_TTL;
}

/**
 * Returns the refresh token TTL in seconds.
 *
 * @returns TTL in seconds
 */
export function getRefreshTokenTTL(): number {
    return REFRESH_TOKEN_TTL;
}
