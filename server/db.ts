import postgres from "postgres";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as {
    conn: postgres.Sql | undefined;
};

export const db = globalForDb.conn ?? postgres(env.POSTGRES_URL, {
    prepare: false,
});

if (env.NODE_ENV !== "production") globalForDb.conn = db;
