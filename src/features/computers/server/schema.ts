import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamptz } from "@/server/db/columns";
import type { Hardware } from "../contract";

export const computers = pgTable("computers", {
    id: primaryId(),
    createdAt: createdAt(),
    name: text().notNull(),
    jkt: text(),
    // 10-digit RustDesk IDs exceed int4.
    rustdeskId: bigint({ mode: "number" }),
    ip: text(),
    os: text(),
    osVersion: text(),
    loginUser: text(),
    clientVersion: text(),
    intuneId: text(),
    lastConnection: timestamptz(),
    lastInventoryAt: timestamptz(),
    hardware: jsonb().$type<Hardware>(),
    searchText: text().generatedAlwaysAs(sql`lower(name || ' ' || coalesce(login_user, ''))`),
}, (t) => [
    uniqueIndex("computers_jkt_unique").on(t.jkt).where(sql`jkt is not null`),
    index("computers_created_at_idx").on(t.createdAt, t.id),
    index("computers_name_idx").on(t.name, t.id),
    index("computers_os_idx").on(t.os),
    index("computers_search_trgm").using("gin", sql`search_text gin_trgm_ops`),
    index("computers_name_trgm").using("gin", sql`lower(name) gin_trgm_ops`),
]);

export type ComputerRow = typeof computers.$inferSelect;
