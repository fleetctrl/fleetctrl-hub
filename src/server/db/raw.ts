import type { SQL } from "drizzle-orm";
import type { Database } from "./client";

/** Rows of a raw SQL statement. node-postgres and PGlite results both expose `rows`. */
export async function queryRows<Row>(db: Database, query: SQL): Promise<Row[]> {
    const result: unknown = await db.execute(query);
    if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
        // SAFETY: the caller states the row shape of its own SELECT.
        return result.rows as Row[];
    }
    throw new Error("Unexpected raw query result");
}
