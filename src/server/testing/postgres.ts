import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createDatabase, drizzleOptions, type Database } from "@/server/db/client";

const migrationsFolder = path.resolve(import.meta.dirname, "../../../drizzle");

/** Real Postgres for tests that need concurrent connections; set TEST_DATABASE_URL to enable. */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** Creates a throwaway database on the TEST_DATABASE_URL server, migrated, and drops it on close. */
export async function createPostgresTestDatabase(): Promise<{ db: Database; pool: Pool; close: () => Promise<void> }> {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set");
    const name = `fleetctrl_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    await admin.query(`create database "${name}"`);
    const url = new URL(testDatabaseUrl);
    url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString(), max: 20 });
    await migrate(drizzle(pool, drizzleOptions), { migrationsFolder });
    const db = createDatabase(pool);
    return {
        db,
        pool,
        close: async () => {
            await pool.end();
            await admin.query(`drop database "${name}" with (force)`);
            await admin.end();
        },
    };
}
