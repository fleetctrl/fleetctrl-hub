import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { Pool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;

/** A Drizzle database or transaction; services accept either, so callers decide the transaction scope. */
export type Database = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Transaction = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export const drizzleOptions = { schema, casing: "snake_case" } as const;

export function createDatabase(pool: Pool): Database {
    return drizzle(pool, drizzleOptions);
}
