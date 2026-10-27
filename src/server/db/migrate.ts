import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

/** Entry point of the one-shot `db-migrate` service and `pnpm db:migrate`. */
async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
    const pool = new Pool({ connectionString, max: 1 });
    try {
        await migrate(drizzle(pool), { migrationsFolder });
        console.log(`Migrations from ${migrationsFolder} applied.`);
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
