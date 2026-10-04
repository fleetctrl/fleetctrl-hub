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

// ========================================
// DPoP JTI Cleanup
// ========================================

/**
 * Forget DPoP proof IDs once the proofs would be rejected as stale anyway.
 */
crons.interval(
    "cleanup expired dpop jtis",
    { minutes: 10 },
    internal.dpopJtis.cleanupExpired,
    {}
);

// ========================================
// Refresh Token Cleanup
// ========================================

/**
 * Delete expired and long-rotated refresh tokens every hour.
 * The job reschedules itself in batches when there is a backlog.
 */
crons.interval(
    "cleanup expired refresh tokens",
    { hours: 1 },
    internal.deviceAuth.cleanupExpiredTokens,
    {}
);

// ========================================
// Dynamic Group Refresh
// ========================================

/**
 * Refresh all dynamic group memberships every hour.
 * This handles time-based rules (olderThanDays, newerThanDays, etc.)
 * that can't be evaluated via triggers alone.
 */
crons.interval(
    "refresh dynamic groups",
    { minutes: 60 },
    internal.groups.refreshAllDynamicGroups
);

export default crons;
