import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
    createComputer,
    findComputerByJkt,
    getComputer,
    updateComputerIdentity,
} from "@/features/computers/server";
import type { Database } from "@/server/db/client";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/server/db/errors";
import { arrayBufferToBase64Url } from "@/server/security/encoding";
import {
    generateRefreshToken,
    getAccessTokenTTL,
    getRefreshTokenExpiry,
    hashToken,
    issueAccessToken,
    type TokenConfig,
} from "@/server/security/jwt";
import { paginate } from "@/server/pagination";
import { enrollmentTokens, refreshTokens, type EnrollmentTokenRow } from "./schema";

const REFRESH_GRACE_MS = 2 * 60 * 1000;
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

type Deps = { db: Database; tokens: TokenConfig };

/** Whether a device ID belongs to an existing computer (404 in the route otherwise). */
export async function isEnrolled(db: Database, deviceId: string): Promise<boolean> {
    return (await getComputer(db, deviceId)) !== null;
}

/**
 * Consumes one use of the enrollment token in a single atomic UPDATE, so parallel enrollments
 * cannot overdraw a limited token. When nothing was updated, a follow-up read picks the message.
 */
async function consumeEnrollmentToken(tx: Database, tokenHash: string) {
    const now = new Date();
    const [consumed] = await tx
        .update(enrollmentTokens)
        .set({
            remainingUses: sql`case when ${enrollmentTokens.remainingUses} = -1 then -1 else ${enrollmentTokens.remainingUses} - 1 end`,
            lastUsedAt: now,
        })
        .where(and(
            eq(enrollmentTokens.tokenHash, tokenHash),
            eq(enrollmentTokens.disabled, false),
            ne(enrollmentTokens.remainingUses, 0),
            or(isNull(enrollmentTokens.expiresAt), gte(enrollmentTokens.expiresAt, now)),
        ))
        .returning({ id: enrollmentTokens.id });
    if (consumed) return;

    const [token] = await tx.select().from(enrollmentTokens).where(eq(enrollmentTokens.tokenHash, tokenHash));
    if (!token) throw new Error("Invalid enrollment token");
    if (token.disabled) throw new Error("Enrollment token is disabled");
    if (token.remainingUses === 0) throw new Error("Enrollment token has no remaining uses");
    throw new Error("Enrollment token has expired");
}

/** Enrolls a new computer, or re-enrolls an existing one (`deviceId` given), and opens a token session. */
export async function enroll(
    deps: Deps,
    args: { enrollmentToken: string; name: string; jkt: string; deviceId?: string },
) {
    const enrollmentTokenHash = await hashToken(args.enrollmentToken);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);

    let session: { computerId: string; jkt: string };
    try {
        session = await deps.db.transaction(async (tx) => {
            await consumeEnrollmentToken(tx, enrollmentTokenHash);

            const existing = args.deviceId ? await getComputer(tx, args.deviceId) : null;
            if (args.deviceId && !existing) {
                throw new Error("Unknown device ID");
            }

            let computerId: string;
            let tokenJkt = args.jkt;
            if (existing) {
                if (existing.jkt && existing.jkt !== args.jkt) {
                    throw new Error("Device proof mismatch");
                }
                tokenJkt = existing.jkt ?? args.jkt;
                await updateComputerIdentity(tx, existing.id, { jkt: tokenJkt, name: args.name });
                computerId = existing.id;
            } else {
                computerId = (await createComputer(tx, { name: args.name, jkt: args.jkt })).id;
            }

            await tx.insert(refreshTokens).values({
                computerId,
                tokenHash: refreshTokenHash,
                jkt: tokenJkt,
                status: "ACTIVE",
                expiresAt: new Date(getRefreshTokenExpiry()),
            });
            return { computerId, jkt: tokenJkt };
        });
    } catch (error) {
        // computers.jkt is unique: another computer already enrolled with this key.
        if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) throw new Error("Device key is already enrolled");
        throw error;
    }

    const { token: accessToken } = await issueAccessToken(deps.tokens, `device:${session.computerId}`, session.jkt);
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: getAccessTokenTTL(),
        device_id: session.computerId,
    };
}

/**
 * Rotates a refresh token. The old token stays usable once within a 2-minute grace window (the
 * client may lose the response). The row is locked, so two racing requests cannot both use the grace.
 */
export async function refreshTokensFor(deps: Deps, args: { refreshToken: string; dpopJkt: string }) {
    const refreshTokenHash = await hashToken(args.refreshToken);
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = await hashToken(newRefreshToken);

    const session = await deps.db.transaction(async (tx) => {
        const [rt] = await tx
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, refreshTokenHash))
            .for("update");

        if (!rt) {
            throw new Error("Invalid refresh token");
        }

        if (rt.jkt !== args.dpopJkt) {
            throw new Error("Device proof mismatch");
        }

        const now = new Date();
        if (rt.status === "ACTIVE") {
            if (rt.expiresAt < now) {
                throw new Error("Refresh token expired");
            }
            await tx
                .update(refreshTokens)
                .set({ status: "REVOKED", graceUntil: new Date(now.getTime() + REFRESH_GRACE_MS) })
                .where(eq(refreshTokens.id, rt.id));
        } else {
            if (!rt.graceUntil || now > rt.graceUntil) {
                throw new Error("Refresh token not in grace period");
            }
            if (rt.lastUsedAt) {
                throw new Error("Refresh token grace already used");
            }
            await tx.update(refreshTokens).set({ lastUsedAt: now }).where(eq(refreshTokens.id, rt.id));
        }

        await tx.insert(refreshTokens).values({
            computerId: rt.computerId,
            tokenHash: newRefreshTokenHash,
            jkt: rt.jkt,
            status: "ACTIVE",
            expiresAt: new Date(getRefreshTokenExpiry()),
        });
        return { computerId: rt.computerId, jkt: rt.jkt };
    });

    const { token: accessToken } = await issueAccessToken(deps.tokens, `device:${session.computerId}`, session.jkt);
    return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: getAccessTokenTTL(),
    };
}

/** Issues fresh tokens to the device that owns the DPoP key (for lost refresh tokens). */
export async function recover(deps: Deps, jkt: string) {
    const computer = await findComputerByJkt(deps.db, jkt);
    if (!computer) {
        throw new Error("Unknown device jkt");
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
    await deps.db.transaction(async (tx) => {
        await tx
            .update(refreshTokens)
            .set({ status: "REVOKED" })
            .where(and(eq(refreshTokens.computerId, computer.id), eq(refreshTokens.status, "ACTIVE")));
        await tx.insert(refreshTokens).values({
            computerId: computer.id,
            tokenHash: refreshTokenHash,
            jkt,
            status: "ACTIVE",
            expiresAt: new Date(getRefreshTokenExpiry()),
        });
    });

    const { token: accessToken } = await issueAccessToken(deps.tokens, `device:${computer.id}`, jkt);
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: getAccessTokenTTL(),
    };
}

/** Daily: mark expired ACTIVE tokens EXPIRED, and delete non-active tokens 30 days past expiry. */
export async function cleanupRefreshTokens(tx: Database, now = new Date()) {
    const expired = await tx
        .update(refreshTokens)
        .set({ status: "EXPIRED" })
        .where(and(eq(refreshTokens.status, "ACTIVE"), lt(refreshTokens.expiresAt, now)))
        .returning({ id: refreshTokens.id });
    const purged = await tx
        .delete(refreshTokens)
        .where(and(
            inArray(refreshTokens.status, ["ROTATED", "REVOKED", "EXPIRED"]),
            lt(refreshTokens.expiresAt, new Date(now.getTime() - PURGE_AFTER_MS)),
        ))
        .returning({ id: refreshTokens.id });
    return { expired: expired.length, purged: purged.length };
}

// ========================================
// Enrollment token administration
// ========================================

export function toEnrollmentTokenItem(t: EnrollmentTokenRow) {
    return {
        id: t.id,
        name: t.name ?? undefined,
        tokenFragment: t.tokenFragment ?? undefined,
        remainingUses: t.remainingUses,
        disabled: t.disabled,
        expiresAt: t.expiresAt?.getTime(),
        lastUsedAt: t.lastUsedAt?.getTime(),
        createdAt: t.createdAt.getTime(),
    };
}

export async function listEnrollmentTokens(db: Database) {
    return db.select().from(enrollmentTokens).orderBy(enrollmentTokens.createdAt, enrollmentTokens.id);
}

export async function listEnrollmentTokensPaginated(db: Database, args: { cursor?: string; numItems: number }) {
    return paginate({
        ...args,
        desc: true,
        sortKey: enrollmentTokens.createdAt,
        idKey: enrollmentTokens.id,
        sortValue: (row: EnrollmentTokenRow) => row.createdAt.toISOString(),
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) =>
            db.select().from(enrollmentTokens).where(where).orderBy(...orderBy).limit(limit),
    });
}

/** Creates a token; the raw value is returned only here and stored as a SHA-256 hash. */
export async function createEnrollmentToken(
    db: Database,
    args: { name?: string; remainingUses: number; expiresAt?: number },
) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = arrayBufferToBase64Url(bytes);
    const tokenHash = await hashToken(token);
    // First 8 characters, for display
    const tokenFragment = token.slice(0, 8);

    const [row] = await db
        .insert(enrollmentTokens)
        .values({
            tokenHash,
            name: args.name,
            tokenFragment,
            remainingUses: args.remainingUses,
            disabled: false,
            expiresAt: args.expiresAt !== undefined ? new Date(args.expiresAt) : null,
        })
        .returning({ id: enrollmentTokens.id });
    return { id: row.id, token, tokenFragment };
}

export async function removeEnrollmentToken(db: Database, id: string) {
    await db.delete(enrollmentTokens).where(eq(enrollmentTokens.id, id));
}
