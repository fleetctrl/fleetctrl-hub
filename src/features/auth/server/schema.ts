import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "@/server/db/columns";

// Better Auth core tables (matches `@better-auth/cli generate` for the pg drizzle adapter), plus the
// `role` additional field carried over from the Convex component. Ids are text so imported users keep theirs.

export const user = pgTable("user", {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: text(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
});

export const session = pgTable("session", {
    id: text().primaryKey(),
    expiresAt: timestamptz().notNull(),
    token: text().notNull().unique(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [
    index("session_user_id_idx").on(t.userId),
]);

export const account = pgTable("account", {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
}, (t) => [
    index("account_user_id_idx").on(t.userId),
]);

export const verification = pgTable("verification", {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
}, (t) => [
    index("verification_identifier_idx").on(t.identifier),
]);
