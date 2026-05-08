/**
 * JTI (JWT ID) Store for DPoP anti-replay protection.
 *
 * This stays outside the Convex module tree so Convex does not try to load it
 * as a function module during deployment.
 */

const usedJtis = new Map<string, number>();

const JTI_TTL = 15 * 60 * 1000;
const CLEANUP_INTERVAL = 60_000;

let lastCleanup = 0;

function cleanupExpiredJtis() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) {
        return;
    }

    lastCleanup = now;
    for (const [jti, expiresAt] of usedJtis) {
        if (expiresAt < now) {
            usedJtis.delete(jti);
        }
    }
}

export function checkAndStoreJti(jti: string): void {
    cleanupExpiredJtis();

    if (usedJtis.has(jti)) {
        throw new Error("Replayed DPoP proof");
    }

    usedJtis.set(jti, Date.now() + JTI_TTL);
}