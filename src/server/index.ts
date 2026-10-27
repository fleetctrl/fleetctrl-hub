import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createServer } from "./app";
import { startJobs } from "./cron";
import { createDatabase } from "./db/client";
import { readEnv } from "./env";
import { EventBus } from "./events";
import { createPgPubSub } from "./pubsub";
import { createS3Storage } from "./storage/s3";

async function main() {
    const env = readEnv();
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    const db = createDatabase(pool);
    const storage = createS3Storage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    });
    await storage.ensureBucket();
    const pubsub = createPgPubSub(env.DATABASE_URL);

    const { app, jobs } = createServer({
        db,
        storage,
        pubsub,
        events: new EventBus(),
        tokens: { jwtSecret: env.JWT_SECRET, apiUrl: env.API_URL },
        auth: {
            secret: env.BETTER_AUTH_SECRET,
            siteUrl: env.SITE_URL,
            trustedOrigins: [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL].filter((origin) => origin !== undefined),
            allowRegistration: env.ALLOW_REGISTRATION !== "false",
        },
    });

    const server = serve({
        fetch: app.fetch,
        hostname: "0.0.0.0",
        port: env.PORT,
        // Installer uploads stream through this process and can take a while.
        serverOptions: { requestTimeout: 60 * 60 * 1000 },
    });
    const cron = startJobs(db, jobs);
    console.log(`FleetCtrl API listening on :${env.PORT}`);

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) return;
        stopping = true;
        console.log(`${signal} received, shutting down`);
        cron.stop();
        server.close();
        await pubsub.close();
        await pool.end();
        process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
