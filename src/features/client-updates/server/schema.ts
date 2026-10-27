import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/server/db/columns";
import { files } from "@/features/files/server";

export const clientUpdates = pgTable("client_updates", {
    id: primaryId(),
    createdAt: createdAt(),
    version: text().notNull(),
    fileId: text().notNull().references(() => files.id, { onDelete: "restrict" }),
    hash: text().notNull(),
    byteSize: bigint({ mode: "number" }).notNull(),
    fileName: text(),
    mimeType: text(),
    isActive: boolean().notNull().default(false),
    notes: text(),
    versionSortKey: text().notNull(),
}, (t) => [
    index("client_updates_version_idx").on(t.version),
    index("client_updates_version_sort_idx").on(t.versionSortKey, t.id),
    index("client_updates_file_idx").on(t.fileId),
    // Backstop for setActive: at most one version is advertised to clients.
    uniqueIndex("client_updates_single_active").on(t.isActive).where(sql`is_active`),
]);

export type ClientUpdateRow = typeof clientUpdates.$inferSelect;
