import { lt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { dpopJti } from "./schema";

// A proof stays acceptable for 15 minutes after `iat`, and `iat` may be up to 2 minutes in the
// future, so a JTI has to be remembered for 17 minutes to reject every replay.
const JTI_TTL_MS = 17 * 60 * 1000;

/**
 * Records a DPoP proof ID. Returns false when the ID was already used (a replay).
 * Shared by all API replicas and survives restarts, unlike the old in-memory store.
 */
export async function storeJti(db: Database, jti: string): Promise<boolean> {
    const now = new Date();
    const stored = await db
        .insert(dpopJti)
        .values({ jti, expiresAt: new Date(now.getTime() + JTI_TTL_MS) })
        // An expired entry no longer protects anything, so it may be reused.
        .onConflictDoUpdate({
            target: dpopJti.jti,
            set: { expiresAt: sql`excluded.expires_at` },
            setWhere: lt(dpopJti.expiresAt, now),
        })
        .returning({ jti: dpopJti.jti });
    return stored.length > 0;
}

export async function purgeExpiredJtis(db: Database): Promise<number> {
    const deleted = await db.delete(dpopJti).where(lt(dpopJti.expiresAt, new Date())).returning({ jti: dpopJti.jti });
    return deleted.length;
}
