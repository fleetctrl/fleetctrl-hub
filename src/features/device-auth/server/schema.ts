import { index, integer, pgEnum, pgTable, text, boolean } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamptz } from "@/server/db/columns";
import { computers } from "@/features/computers/server";

export const enrollmentTokens = pgTable("enrollment_tokens", {
    id: primaryId(),
    createdAt: createdAt(),
    tokenHash: text().notNull().unique(),
    name: text(),
    tokenFragment: text(),
    // -1 means unlimited.
    remainingUses: integer().notNull(),
    disabled: boolean().notNull().default(false),
    expiresAt: timestamptz(),
    lastUsedAt: timestamptz(),
}, (t) => [
    index("enrollment_tokens_created_at_idx").on(t.createdAt, t.id),
]);

export const refreshTokenStatus = pgEnum("refresh_token_status", ["ACTIVE", "ROTATED", "REVOKED", "EXPIRED"]);

export const refreshTokens = pgTable("refresh_tokens", {
    id: primaryId(),
    createdAt: createdAt(),
    computerId: text().notNull().references(() => computers.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    jkt: text().notNull(),
    status: refreshTokenStatus().notNull(),
    expiresAt: timestamptz().notNull(),
    graceUntil: timestamptz(),
    lastUsedAt: timestamptz(),
}, (t) => [
    index("refresh_tokens_status_expires_at_idx").on(t.status, t.expiresAt),
    index("refresh_tokens_computer_status_idx").on(t.computerId, t.status),
]);

export type EnrollmentTokenRow = typeof enrollmentTokens.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
