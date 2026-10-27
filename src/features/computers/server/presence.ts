import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { PubSub } from "@/server/pubsub";
import { PRESENCE_CHANNEL, presenceUpdateSchema, type PresenceUpdate } from "../contract";

const FLUSH_INTERVAL_MS = 1000;
const KEEP_ALIVE_MS = 25_000;

/**
 * `GET /admin/computers/presence`: realtime online status for the dashboard.
 * Buffers NOTIFY payloads and flushes at most once per second as one `presence` event
 * (`[{ id, lastConnection }]`); a 1000-device fleet produces ~17 heartbeats per second.
 * Sends `resync` when the LISTEN connection was re-established, so the UI refetches.
 * Holds no database connection.
 */
export function presenceStream(c: Context, pubsub: PubSub) {
    const response = streamSSE(c, async (stream) => {
        const pending = new Map<string, number>();
        let needsResync = false;

        const unsubscribe = pubsub.subscribe(PRESENCE_CHANNEL, (payload) => {
            let update: PresenceUpdate;
            try {
                const parsed = presenceUpdateSchema.safeParse(JSON.parse(payload));
                if (!parsed.success) return;
                update = parsed.data;
            } catch {
                return;
            }
            const previous = pending.get(update.id);
            if (previous === undefined || previous < update.lastConnection) {
                pending.set(update.id, update.lastConnection);
            }
        });
        const unsubscribeResync = pubsub.onResync(() => {
            needsResync = true;
        });
        stream.onAbort(() => {
            unsubscribe();
            unsubscribeResync();
        });

        await stream.write(": connected\n\n");
        let lastWrite = Date.now();
        try {
            while (!stream.aborted && !stream.closed) {
                await stream.sleep(FLUSH_INTERVAL_MS);
                if (needsResync) {
                    needsResync = false;
                    await stream.writeSSE({ event: "resync", data: "{}" });
                    lastWrite = Date.now();
                }
                if (pending.size > 0) {
                    const batch: PresenceUpdate[] = [...pending].map(([id, lastConnection]) => ({ id, lastConnection }));
                    pending.clear();
                    await stream.writeSSE({ event: "presence", data: JSON.stringify(batch) });
                    lastWrite = Date.now();
                } else if (Date.now() - lastWrite >= KEEP_ALIVE_MS) {
                    await stream.write(": keep-alive\n\n");
                    lastWrite = Date.now();
                }
            }
        } finally {
            unsubscribe();
            unsubscribeResync();
        }
    });
    // Proxies must pass events through as they come: `no-transform` stops compression (which
    // buffers; Next's dev proxy gzips by default), X-Accel-Buffering stops nginx-style buffering.
    response.headers.set("Cache-Control", "no-cache, no-transform");
    response.headers.set("X-Accel-Buffering", "no");
    return response;
}
