/**
 * Authentication Module
 *
 * Handles device enrollment, token refresh, and recovery.
 * Replaces Go auth package functionality.
 */

import {
    internalAction,
    internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
    issueAccessToken,
    generateRefreshToken,
    hashToken,
    getRefreshTokenExpiry,
    getAccessTokenTTL,
} from "./lib/jwt";
import { internalMutation } from "./functions";
import { maybeNormalizeTableId } from "./lib/idNormalization";

// ========================================
// Public Queries
// ========================================

/**
 * Check if a computer is enrolled by device ID.
 */
export const isEnrolled = internalQuery({
    args: { deviceId: v.string() },
    handler: async (ctx, { deviceId }) => {
        return maybeNormalizeTableId(ctx.db, "computers", deviceId) !== null;
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

export const getComputerByDeviceId = internalQuery({
    args: { deviceId: v.string() },
    handler: async (ctx, { deviceId }) => {
        const computerId = maybeNormalizeTableId(ctx.db, "computers", deviceId);
        if (!computerId) {
            return null;
        }

        return await ctx.db.get("computers", computerId);
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

export const createComputer = internalMutation({
    args: {
        name: v.string(),
        jkt: v.string(),
    },
    handler: async (ctx, { name, jkt }) => {
        const computerId = await ctx.db.insert("computers", {
            name,
            jkt,
        });
        return computerId;
    },
});

export const updateComputerJkt = internalMutation({
    args: {
        computerId: v.id("computers"),
        jkt: v.string(),
        name: v.string(),
    },
    handler: async (ctx, { computerId, jkt, name }) => {
        await ctx.db.patch("computers", computerId, {
            jkt,
            name,
        });
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

export const consumeEnrollmentAndCreateSession = internalMutation({
    args: {
        enrollmentTokenHash: v.string(),
        name: v.string(),
        jkt: v.string(),
        deviceId: v.optional(v.string()),
        refreshTokenHash: v.string(),
        refreshTokenExpiresAt: v.number(),
    },
    handler: async (
        ctx,
        {
            enrollmentTokenHash,
            name,
            jkt,
            deviceId,
            refreshTokenHash,
            refreshTokenExpiresAt,
        }
    ) => {
        const token = await ctx.db
            .query("enrollment_tokens")
            .withIndex("by_token_hash", (q) => q.eq("token_hash", enrollmentTokenHash))
            .first();

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

        if (token.remaining_uses !== -1) {
            await ctx.db.patch("enrollment_tokens", token._id, {
                remaining_uses: token.remaining_uses - 1,
                last_used_at: Date.now(),
            });
        } else {
            await ctx.db.patch("enrollment_tokens", token._id, { last_used_at: Date.now() });
        }

        const existingId = deviceId
            ? maybeNormalizeTableId(ctx.db, "computers", deviceId)
            : null;
        const existing = existingId ? await ctx.db.get("computers", existingId) : null;

        if (deviceId && !existing) {
            throw new Error("Unknown device ID");
        }

        let computerId;
        let tokenJkt = jkt;
        if (existing) {
            if (existing.jkt && existing.jkt !== jkt) {
                throw new Error("Device proof mismatch");
            }

            tokenJkt = existing.jkt ?? jkt;
            await ctx.db.patch("computers", existing._id, {
                jkt: tokenJkt,
                name,
            });
            computerId = existing._id;
        } else {
            computerId = await ctx.db.insert("computers", {
                name,
                jkt,
            });
        }

        await ctx.db.insert("refresh_tokens", {
            computer_id: computerId,
            token_hash: refreshTokenHash,
            jkt: tokenJkt,
            status: "ACTIVE",
            expires_at: refreshTokenExpiresAt,
        });

        return { computerId, jkt: tokenJkt };
    },
});

export const rotateRefreshToken = internalMutation({
    args: {
        tokenId: v.id("refresh_tokens"),
        graceUntil: v.number(),
    },
    handler: async (ctx, { tokenId, graceUntil }) => {
        await ctx.db.patch("refresh_tokens", tokenId, {
            status: "REVOKED",
            grace_until: graceUntil,
        });
    },
});

export const markGraceUsage = internalMutation({
    args: { tokenId: v.id("refresh_tokens") },
    handler: async (ctx, { tokenId }) => {
        await ctx.db.patch("refresh_tokens", tokenId, {
            last_used_at: Date.now(),
        });
    },
});

export const rotateRefreshTokenAndCreateSession = internalMutation({
    args: {
        refreshTokenHash: v.string(),
        dpopJkt: v.string(),
        newRefreshTokenHash: v.string(),
        newRefreshTokenExpiresAt: v.number(),
    },
    handler: async (
        ctx,
        { refreshTokenHash, dpopJkt, newRefreshTokenHash, newRefreshTokenExpiresAt }
    ) => {
        const rt = await ctx.db
            .query("refresh_tokens")
            .withIndex("by_token_hash", (q) => q.eq("token_hash", refreshTokenHash))
            .first();

        if (!rt) {
            throw new Error("Invalid refresh token");
        }

        if (rt.jkt !== dpopJkt) {
            throw new Error("Device proof mismatch");
        }

        const now = Date.now();
        const graceTTL = 2 * 60 * 1000; // 2 minutes

        if (rt.status === "ACTIVE") {
            if (rt.expires_at < now) {
                throw new Error("Refresh token expired");
            }

            await ctx.db.patch("refresh_tokens", rt._id, {
                status: "REVOKED",
                grace_until: now + graceTTL,
            });
        } else {
            if (!rt.grace_until || now > rt.grace_until) {
                throw new Error("Refresh token not in grace period");
            }

            if (rt.last_used_at) {
                throw new Error("Refresh token grace already used");
            }

            await ctx.db.patch("refresh_tokens", rt._id, {
                last_used_at: now,
            });
        }

        await ctx.db.insert("refresh_tokens", {
            computer_id: rt.computer_id,
            token_hash: newRefreshTokenHash,
            jkt: rt.jkt,
            status: "ACTIVE",
            expires_at: newRefreshTokenExpiresAt,
        });

        return { computerId: rt.computer_id, jkt: rt.jkt };
    },
});

export const revokeAllActiveTokens = internalMutation({
    args: { computerId: v.id("computers") },
    handler: async (ctx, { computerId }) => {
        const activeTokens = await ctx.db
            .query("refresh_tokens")
            .withIndex("by_computer_status", (q) =>
                q.eq("computer_id", computerId).eq("status", "ACTIVE")
            )
            .collect();

        for (const token of activeTokens) {
            await ctx.db.patch("refresh_tokens", token._id, { status: "REVOKED" });
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
            .withIndex("by_status_expires_at", (q) =>
                q.eq("status", "ACTIVE").lt("expires_at", now)
            )
            .take(100);

        for (const token of expired) {
            await ctx.db.patch("refresh_tokens", token._id, { status: "EXPIRED" });
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
export const enroll = internalAction({
    args: {
        enrollmentToken: v.string(),
        name: v.string(),
        jkt: v.string(),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, { enrollmentToken, name, jkt, deviceId }): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        device_id: string;
    }> => {
        const enrollmentTokenHash = await hashToken(enrollmentToken);
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = await hashToken(refreshToken);

        const session: { computerId: Id<"computers">; jkt: string } = await ctx.runMutation(
            internal.deviceAuth.consumeEnrollmentAndCreateSession,
            {
                enrollmentTokenHash,
                name,
                jkt,
                deviceId,
                refreshTokenHash,
                refreshTokenExpiresAt: getRefreshTokenExpiry(),
            }
        );

        const subject = `device:${session.computerId}`;
        const { token: accessToken } = await issueAccessToken(subject, session.jkt);

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: getAccessTokenTTL(),
            device_id: session.computerId.toString(),
        };
    },
});

/**
 * Refresh access token using a valid refresh token.
 */
export const refreshTokens = internalAction({
    args: {
        refreshToken: v.string(),
        dpopJkt: v.string(),
    },
    handler: async (ctx, { refreshToken, dpopJkt }): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }> => {
        const refreshTokenHash = await hashToken(refreshToken);
        const newRefreshToken = generateRefreshToken();
        const newRefreshTokenHash = await hashToken(newRefreshToken);

        const session: { computerId: Id<"computers">; jkt: string } = await ctx.runMutation(
            internal.deviceAuth.rotateRefreshTokenAndCreateSession,
            {
                refreshTokenHash,
                dpopJkt,
                newRefreshTokenHash,
                newRefreshTokenExpiresAt: getRefreshTokenExpiry(),
            }
        );

        const subject = `device:${session.computerId}`;
        const { token: accessToken } = await issueAccessToken(subject, session.jkt);

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
export const recover = internalAction({
    args: { jkt: v.string() },
    handler: async (ctx, { jkt }) => {
        // 1. Find computer by JKT
        const computer = await ctx.runQuery(internal.deviceAuth.getComputerByJkt, {
            jkt,
        });

        if (!computer) {
            throw new Error("Unknown device jkt");
        }

        // 2. Revoke all active refresh tokens for this device
        await ctx.runMutation(internal.deviceAuth.revokeAllActiveTokens, {
            computerId: computer._id,
        });

        // 3. Issue fresh tokens
        const subject = `device:${computer._id}`;
        const { token: accessToken } = await issueAccessToken(subject, jkt);
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = await hashToken(refreshToken);

        await ctx.runMutation(internal.deviceAuth.createRefreshToken, {
            computerId: computer._id,
            tokenHash: refreshTokenHash,
            jkt,
            expiresAt: getRefreshTokenExpiry(),
        });

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: getAccessTokenTTL(),
        };
    },
});
