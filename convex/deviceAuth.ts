/**
 * Authentication Module
 *
 * Handles device enrollment, token refresh, and recovery.
 * Replaces Go auth package functionality.
 */

import {
    action,
    mutation,
    query,
    internalMutation,
    internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
    issueAccessToken,
    generateRefreshToken,
    hashToken,
    getRefreshTokenExpiry,
    getAccessTokenTTL,
} from "./lib/jwt";

// ========================================
// Public Queries
// ========================================

/**
 * Check if a computer is enrolled by fingerprint.
 */
export const isEnrolled = query({
    args: { fingerprint: v.string() },
    handler: async (ctx, { fingerprint }) => {
        const computer = await ctx.db
            .query("computers")
            .withIndex("by_fingerprint", (q) =>
                q.eq("fingerprint", fingerprint)
            )
            .first();

        return computer !== null;
    },
});

// ========================================
// Internal Queries (for use by actions)
// ========================================

export const getEnrollmentTokenByHash = internalQuery({
    args: { tokenHash: v.string() },
    handler: async (ctx, { tokenHash }) => {
        return await ctx.db
            .query("enrollment_tokens")
            .withIndex("by_token_hash", (q) => q.eq("token_hash", tokenHash))
            .first();
    },
});

export const getRefreshTokenByHash = internalQuery({
    args: { tokenHash: v.string() },
    handler: async (ctx, { tokenHash }) => {
        return await ctx.db
            .query("refresh_tokens")
            .withIndex("by_token_hash", (q) => q.eq("token_hash", tokenHash))
            .first();
    },
});

export const getComputerByFingerprint = internalQuery({
    args: { fingerprint: v.string() },
    handler: async (ctx, { fingerprint }) => {
        return await ctx.db
            .query("computers")
            .withIndex("by_fingerprint", (q) =>
                q.eq("fingerprint", fingerprint)
            )
            .first();
    },
});

export const getComputerByJkt = internalQuery({
    args: { jkt: v.string() },
    handler: async (ctx, { jkt }) => {
        return await ctx.db
            .query("computers")
            .withIndex("by_jkt", (q) => q.eq("jkt", jkt))
            .first();
    },
});

// ========================================
// Internal Mutations
// ========================================

export const decrementTokenUses = internalMutation({
    args: { tokenId: v.id("enrollment_tokens") },
    handler: async (ctx, { tokenId }) => {
        const token = await ctx.db.get(tokenId);
        if (!token) return;

        const newRemaining = Math.max(token.remaining_uses - 1, 0);
        await ctx.db.patch(tokenId, {
            remaining_uses: newRemaining,
            last_used_at: Date.now(),
        });
    },
});

export const createComputer = internalMutation({
    args: {
        name: v.string(),
        fingerprint: v.string(),
        jkt: v.string(),
    },
    handler: async (ctx, { name, fingerprint, jkt }) => {
        return await ctx.db.insert("computers", {
            name,
            fingerprint: fingerprint,
            jkt,
        });
    },
});

export const updateComputerJkt = internalMutation({
    args: {
        computerId: v.id("computers"),
        jkt: v.string(),
        name: v.string(),
    },
    handler: async (ctx, { computerId, jkt, name }) => {
        await ctx.db.patch(computerId, { jkt, name });
    },
});

export const createRefreshToken = internalMutation({
    args: {
        computerId: v.id("computers"),
        tokenHash: v.string(),
        jkt: v.string(),
        expiresAt: v.number(),
    },
    handler: async (ctx, { computerId, tokenHash, jkt, expiresAt }) => {
        await ctx.db.insert("refresh_tokens", {
            computer_id: computerId,
            token_hash: tokenHash,
            jkt,
            status: "ACTIVE",
            expires_at: expiresAt,
        });
    },
});

export const rotateRefreshToken = internalMutation({
    args: {
        tokenId: v.id("refresh_tokens"),
        graceUntil: v.number(),
    },
    handler: async (ctx, { tokenId, graceUntil }) => {
        await ctx.db.patch(tokenId, {
            status: "REVOKED",
            grace_until: graceUntil,
        });
    },
});

export const markGraceUsage = internalMutation({
    args: { tokenId: v.id("refresh_tokens") },
    handler: async (ctx, { tokenId }) => {
        await ctx.db.patch(tokenId, {
            last_used_at: Date.now(),
        });
    },
});

export const revokeAllActiveTokens = internalMutation({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
        const activeTokens = await ctx.db
            .query("refresh_tokens")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
            .filter((q) => q.eq(q.field("status"), "ACTIVE"))
            .collect();

        for (const token of activeTokens) {
            await ctx.db.patch(token._id, { status: "REVOKED" });
        }

        return { revoked: activeTokens.length };
    },
});

export const cleanupExpiredTokens = internalMutation({
    handler: async (ctx) => {
        const now = Date.now();
        let updated = 0;

        // Find active tokens that have expired
        const expired = await ctx.db
            .query("refresh_tokens")
            .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
            .filter((q) => q.lt(q.field("expires_at"), now))
            .take(100);

        for (const token of expired) {
            await ctx.db.patch(token._id, { status: "EXPIRED" });
            updated++;
        }

        console.log(`[Token Cleanup] Marked ${updated} tokens as expired`);
        return { updated };
    },
});

// ========================================
// Public Actions (called by HTTP endpoints)
// ========================================

/**
 * Enroll a new computer or re-enroll an existing one.
 */
export const enroll = action({
    args: {
        enrollmentToken: v.string(),
        name: v.string(),
        fingerprint: v.string(),
        jkt: v.string(),
    },
    handler: async (ctx, { enrollmentToken, name, fingerprint, jkt }) => {
        // 1. Validate enrollment token
        const tokenHash = await hashToken(enrollmentToken);

        const token = await ctx.runQuery(
            // @ts-expect-error - internal API
            "deviceAuth:getEnrollmentTokenByHash",
            { tokenHash }
        );

        if (!token) {
            throw new Error("Invalid enrollment token");
        }

        if (token.disabled) {
            throw new Error("Enrollment token is disabled");
        }

        if (token.remaining_uses === 0) {
            throw new Error("Enrollment token has no remaining uses");
        }

        if (token.expires_at && token.expires_at < Date.now()) {
            throw new Error("Enrollment token has expired");
        }

        // 2. Use token (decrement if not unlimited)
        if (token.remaining_uses !== -1) {
            await ctx.runMutation(
                // @ts-expect-error - internal API
                "deviceAuth:decrementTokenUses",
                { tokenId: token._id }
            );
        }

        // 3. Check if computer already exists
        let computerId: Id<"computers">;
        const existing = await ctx.runQuery(
            // @ts-expect-error - internal API
            "deviceAuth:getComputerByFingerprint",
            { fingerprint }
        );

        if (existing) {
            // Update existing computer
            await ctx.runMutation(
                // @ts-expect-error - internal API
                "deviceAuth:updateComputerJkt",
                {
                    computerId: existing._id,
                    jkt,
                    name,
                }
            );
            computerId = existing._id;
        } else {
            // Create new computer
            computerId = await ctx.runMutation(
                // @ts-expect-error - internal API
                "deviceAuth:createComputer",
                {
                    name,
                    fingerprint,
                    jkt,
                }
            );
        }

        // 4. Issue tokens
        const subject = `device:${computerId}`;
        const { token: accessToken } = await issueAccessToken(subject, jkt);
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = await hashToken(refreshToken);

        await ctx.runMutation(
            // @ts-expect-error - internal API
            "deviceAuth:createRefreshToken",
            {
                computerId,
                tokenHash: refreshTokenHash,
                jkt,
                expiresAt: getRefreshTokenExpiry(),
            }
        );

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: getAccessTokenTTL(),
        };
    },
});

/**
 * Refresh access token using a valid refresh token.
 */
export const refreshTokens = action({
    args: { refreshToken: v.string() },
    handler: async (ctx, { refreshToken }) => {
        const tokenHash = await hashToken(refreshToken);

        // 1. Find refresh token
        const rt = await ctx.runQuery(
            // @ts-expect-error - internal API
            "deviceAuth:getRefreshTokenByHash",
            { tokenHash }
        );

        if (!rt) {
            throw new Error("Invalid refresh token");
        }

        const now = Date.now();
        const graceTTL = 2 * 60 * 1000; // 2 minutes

        // 2. Validate status
        if (rt.status === "ACTIVE") {
            if (rt.expires_at < now) {
                throw new Error("Refresh token expired");
            }

            // Rotate token (revoke with grace period)
            await ctx.runMutation(
                // @ts-expect-error - internal API
                "deviceAuth:rotateRefreshToken",
                {
                    tokenId: rt._id,
                    graceUntil: now + graceTTL,
                }
            );
        } else {
            // Check grace period for replayed refresh
            if (!rt.grace_until || now > rt.grace_until) {
                throw new Error("Refresh token not in grace period");
            }

            if (rt.last_used_at) {
                throw new Error("Refresh token grace already used");
            }

            // Mark grace usage
            await ctx.runMutation(
                // @ts-expect-error - internal API
                "deviceAuth:markGraceUsage",
                { tokenId: rt._id }
            );
        }

        // 3. Issue new tokens
        const subject = `device:${rt.computer_id}`;
        const { token: accessToken } = await issueAccessToken(subject, rt.jkt);
        const newRefreshToken = generateRefreshToken();
        const newRefreshTokenHash = await hashToken(newRefreshToken);

        await ctx.runMutation(
            // @ts-expect-error - internal API
            "deviceAuth:createRefreshToken",
            {
                computerId: rt.computer_id,
                tokenHash: newRefreshTokenHash,
                jkt: rt.jkt,
                expiresAt: getRefreshTokenExpiry(),
            }
        );

        return {
            access_token: accessToken,
            refresh_token: newRefreshToken,
            expires_in: getAccessTokenTTL(),
        };
    },
});

/**
 * Recover tokens using DPoP proof (for lost refresh tokens).
 * The JKT from the DPoP proof is used to identify the device.
 */
export const recover = action({
    args: { jkt: v.string() },
    handler: async (ctx, { jkt }) => {
        // 1. Find computer by JKT
        const computer = await ctx.runQuery(
            // @ts-expect-error - internal API
            "deviceAuth:getComputerByJkt",
            { jkt }
        );

        if (!computer) {
            throw new Error("Unknown device jkt");
        }

        // 2. Revoke all active refresh tokens for this device
        await ctx.runMutation(
            // @ts-expect-error - internal API
            "deviceAuth:revokeAllActiveTokens",
            { computerId: computer._id }
        );

        // 3. Issue fresh tokens
        const subject = `device:${computer._id}`;
        const { token: accessToken } = await issueAccessToken(subject, jkt);
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = await hashToken(refreshToken);

        await ctx.runMutation(
            // @ts-expect-error - internal API
            "deviceAuth:createRefreshToken",
            {
                computerId: computer._id,
                tokenHash: refreshTokenHash,
                jkt,
                expiresAt: getRefreshTokenExpiry(),
            }
        );

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: getAccessTokenTTL(),
        };
    },
});
