import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzleOptions, type Database } from "@/server/db/client";

export type TestDatabase = { db: Database; pglite: PGlite; close: () => Promise<void> };

const migrationsFolder = path.resolve(import.meta.dirname, "../../../drizzle");

// Migrating is the slow part, so each test worker migrates once and copies the data directory.
let template: Promise<File | Blob> | null = null;

async function migratedTemplate() {
    const pglite = await PGlite.create({ extensions: { pg_trgm } });
    await migrate(drizzle(pglite, drizzleOptions), { migrationsFolder });
    const dump = await pglite.dumpDataDir("none");
    await pglite.close();
    return dump;
}

/** Fresh in-memory Postgres with every migration applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
    template ??= migratedTemplate();
    const pglite = await PGlite.create({ extensions: { pg_trgm }, loadDataDir: await template });
    const db = drizzle(pglite, drizzleOptions);
    return { db, pglite, close: () => pglite.close() };
}
