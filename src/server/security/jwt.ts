/**
 * Device access and refresh tokens.
 * Ported from convex/lib/jwt.ts; the secret and issuer now come from config instead of process.env.
 * Tokens issued by v2 stay valid because JWT_SECRET and API_URL (issuer + audience) are unchanged.
 */

import { SignJWT, jwtVerify } from "jose";
import { arrayBufferToBase64Url } from "./encoding";

const ACCESS_TOKEN_TTL = 900; // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 2592000; // 30 days in seconds

export type TokenConfig = {
    jwtSecret: string;
    apiUrl: string | undefined;
};

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

function signingInput(config: TokenConfig) {
    if (!config.jwtSecret || config.jwtSecret.length < 32) {
        throw new Error("JWT_SECRET is missing or too short (>=32 chars)");
    }
    if (!config.apiUrl) {
        throw new Error("API_URL is not configured");
    }
    return { secret: new TextEncoder().encode(config.jwtSecret), apiUrl: config.apiUrl };
}

/** Issues an access token bound to a JWK thumbprint (DPoP `cnf.jkt`). */
export async function issueAccessToken(
    config: TokenConfig,
    subject: string,
    jkt: string
): Promise<{ token: string; expiresAt: number }> {
    const { secret, apiUrl } = signingInput(config);
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

/** Verifies an access token and returns its payload; throws when invalid or expired. */
export async function verifyAccessToken(config: TokenConfig, token: string): Promise<TokenPayload> {
    const { secret, apiUrl } = signingInput(config);

    const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        issuer: apiUrl,
        audience: apiUrl,
    });

    // SAFETY: jwtVerify checked the signature, issuer and audience; the token was minted by issueAccessToken.
    return payload as TokenPayload;
}

/** 32 random bytes, base64url encoded. */
export function generateRefreshToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return arrayBufferToBase64Url(bytes);
}

/** SHA-256 of a token, base64url encoded. Raw tokens are never stored. */
export async function hashToken(token: string): Promise<string> {
    const data = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return arrayBufferToBase64Url(hashBuffer);
}

/** Expiry of a new refresh token, epoch ms. */
export function getRefreshTokenExpiry(): number {
    return Date.now() + REFRESH_TOKEN_TTL * 1000;
}

/** Access token TTL in seconds (the `expires_in` of token responses). */
export function getAccessTokenTTL(): number {
    return ACCESS_TOKEN_TTL;
}
