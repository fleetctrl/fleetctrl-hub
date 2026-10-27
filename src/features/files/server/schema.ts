import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/server/db/columns";

/**
 * Metadata for every object in the `fleetctrl-files` bucket (replaces Convex `_storage`).
 * Features reference rows with `on delete restrict`, which is what lets the GC job find unreferenced files.
 */
export const files = pgTable("files", {
    id: primaryId(),
    createdAt: createdAt(),
    objectKey: text().notNull().unique(),
    size: bigint({ mode: "number" }).notNull(),
    // Hex-encoded SHA-256 of the content, computed by the server while uploading.
    sha256: text().notNull(),
    contentType: text(),
    originalName: text(),
}, (t) => [
    index("files_created_at_idx").on(t.createdAt),
]);

export type FileRow = typeof files.$inferSelect;
