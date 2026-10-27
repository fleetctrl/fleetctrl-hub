import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamptz } from "@/server/db/columns";

// Used DPoP proof IDs (anti-replay). Created UNLOGGED by the migration: losing it in a crash only
// re-opens replay for proofs that are at most 15 minutes old.
export const dpopJti = pgTable("dpop_jti", {
    jti: text().primaryKey(),
    expiresAt: timestamptz().notNull(),
});
