import type { Job } from "@/server/cron";
import { cleanupRefreshTokens } from "./service";

export const deviceAuthJobs: Job[] = [
    // Daily at 03:00 UTC, as in v2.
    { name: "refresh-token-cleanup", schedule: "0 3 * * *", run: (tx) => cleanupRefreshTokens(tx) },
];
