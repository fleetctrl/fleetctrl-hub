import { Cron } from "croner";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { queryRows } from "@/server/db/raw";

export type Job = {
    name: string;
    /** Cron pattern, evaluated in UTC. */
    schedule: string;
    /** Runs inside a transaction that holds the job's advisory lock; the result is logged. */
    run: (tx: Database) => Promise<object | void>;
};

/**
 * Runs a job unless another replica is already running it (`pg_try_advisory_xact_lock`).
 * Returns false when the lock was taken elsewhere.
 */
export async function runExclusive(db: Database, job: Job): Promise<boolean> {
    return db.transaction(async (tx) => {
        const [lock] = await queryRows<{ locked: boolean }>(
            tx,
            sql`select pg_try_advisory_xact_lock(hashtext(${`fleetctrl:job:${job.name}`})) as locked`,
        );
        if (!lock?.locked) return false;
        const started = Date.now();
        const outcome = await job.run(tx);
        console.log(`[cron] ${job.name} finished in ${Date.now() - started} ms`, outcome ?? "");
        return true;
    });
}

export function startJobs(db: Database, jobs: Job[]) {
    const scheduled = jobs.map((job) => new Cron(job.schedule, { timezone: "UTC", protect: true, name: job.name }, async () => {
        try {
            await runExclusive(db, job);
        } catch (error) {
            console.error(`[cron] ${job.name} failed:`, error);
        }
    }));
    return { stop: () => scheduled.forEach((cron) => cron.stop()) };
}
