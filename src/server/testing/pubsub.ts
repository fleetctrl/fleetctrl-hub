import type { PGlite } from "@electric-sql/pglite";
import { PubSubListeners, type PubSub } from "@/server/pubsub";

/** PubSub on PGlite's LISTEN/NOTIFY, with the same on-commit delivery semantics as Postgres. */
export function createPglitePubSub(pglite: PGlite): PubSub & { simulateReconnect: () => void } {
    const listeners = new PubSubListeners();
    const unlisten = new Map<string, Promise<() => Promise<void>>>();
    return {
        subscribe(channel, listener) {
            if (listeners.add(channel, listener)) {
                unlisten.set(channel, pglite.listen(channel, (payload) => listeners.dispatch(channel, payload)));
            }
            return () => listeners.remove(channel, listener);
        },
        onResync(listener) {
            listeners.resyncListeners.add(listener);
            return () => listeners.resyncListeners.delete(listener);
        },
        async close() {
            for (const stop of unlisten.values()) await (await stop)();
        },
        simulateReconnect: () => listeners.resync(),
    };
}
