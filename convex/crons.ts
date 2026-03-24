/**
 * Scheduled Jobs (Cron)
 *
 * Handles periodic maintenance tasks:
 * - JTI cleanup (anti-replay store)
 * - Expired refresh token cleanup
 * - Dynamic group membership refresh
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// JTI Anti-Replay is handled in-memory (see lib/jtiStore.ts)

// ========================================
// Refresh Token Cleanup
// ========================================

/**
 * Cleanup expired refresh tokens daily at 3:00 UTC.
 * Marks ACTIVE tokens as EXPIRED if past their expiry date.
 */
crons.daily(
    "cleanup expired refresh tokens",
    { hourUTC: 3, minuteUTC: 0 },
    internal.deviceAuth.cleanupExpiredTokens
);

// ========================================
// Dynamic Group Refresh
// ========================================

/**
 * Refresh all dynamic group memberships every 15 minutes.
 * This handles time-based rules (olderThanDays, newerThanDays, etc.)
 * that can't be evaluated via triggers alone.
 */
crons.interval(
    "refresh dynamic groups",
    { minutes: 60 },
    internal.groups.refreshAllDynamicGroups
);

export default crons;
