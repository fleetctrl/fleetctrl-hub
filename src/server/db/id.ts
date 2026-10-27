import { randomBytes } from "node:crypto";

let lastTimestamp = 0;
let sequence = 0;

/**
 * RFC 9562 UUIDv7: 48-bit millisecond timestamp, a 12-bit sequence, then random bits.
 * IDs from one process are strictly increasing (the sequence counts up within a millisecond), so
 * rows inserted in one transaction, which share `created_at = now()`, still sort in insert order.
 * Postgres 17 has no built-in generator, and imported rows keep their Convex IDs, so IDs are made in the app.
 */
export function uuidv7(now = Date.now()): string {
    let timestamp = Math.max(now, lastTimestamp);
    if (timestamp === lastTimestamp) {
        sequence += 1;
        if (sequence > 0xfff) {
            timestamp += 1;
            sequence = 0;
        }
    } else {
        sequence = 0;
    }
    lastTimestamp = timestamp;

    const bytes = randomBytes(16);
    let remaining = timestamp;
    for (let index = 5; index >= 0; index--) {
        bytes[index] = remaining % 256;
        remaining = Math.floor(remaining / 256);
    }
    bytes[6] = 0x70 | (sequence >> 8);
    bytes[7] = sequence & 0xff;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
