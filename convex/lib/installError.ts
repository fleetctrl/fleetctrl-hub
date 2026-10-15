const MAX_INSTALL_ERROR_LENGTH = 2000;

/**
 * Trims a client-reported install error and caps its length; empty messages become undefined.
 * Applied before the value reaches a mutation, because Convex rejects oversized string arguments.
 */
export function normalizeInstallError(error: string | undefined) {
    const trimmed = error?.trim();
    return trimmed ? trimmed.slice(0, MAX_INSTALL_ERROR_LENGTH) : undefined;
}
