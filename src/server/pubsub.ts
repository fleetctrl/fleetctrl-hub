import { Client } from "pg";

/** Fan-out of Postgres NOTIFY messages to in-process subscribers. */
export interface PubSub {
    subscribe(channel: string, listener: (payload: string) => void): () => void;
    /** Called after the LISTEN connection was re-established; notifications sent meanwhile were lost. */
    onResync(listener: () => void): () => void;
    close(): Promise<void>;
}

const CHANNEL_NAME = /^[a-z_][a-z0-9_]*$/;

export function assertChannelName(channel: string) {
    if (!CHANNEL_NAME.test(channel)) throw new Error(`Invalid channel name: ${channel}`);
}

/** Listener registry shared by the pg and PGlite implementations. */
export class PubSubListeners {
    readonly channels = new Map<string, Set<(payload: string) => void>>();
    readonly resyncListeners = new Set<() => void>();

    add(channel: string, listener: (payload: string) => void): boolean {
        assertChannelName(channel);
        const listeners = this.channels.get(channel) ?? new Set();
        const isNew = listeners.size === 0;
        listeners.add(listener);
        this.channels.set(channel, listeners);
        return isNew;
    }

    remove(channel: string, listener: (payload: string) => void) {
        this.channels.get(channel)?.delete(listener);
    }

    dispatch(channel: string, payload: string) {
        for (const listener of this.channels.get(channel) ?? []) {
            try {
                listener(payload);
            } catch (error) {
                console.error(`[pubsub] listener for ${channel} failed:`, error);
            }
        }
    }

    resync() {
        for (const listener of this.resyncListeners) listener();
    }
}

/**
 * One dedicated connection per API process runs LISTEN. Every replica gets every notification,
 * so presence works with several replicas. Reconnects with backoff and tells subscribers to resync.
 */
export function createPgPubSub(connectionString: string): PubSub {
    const listeners = new PubSubListeners();
    let client: Client | null = null;
    let closed = false;
    let backoffMs = 1000;
    let connecting: Promise<void> | null = null;

    async function connect(isReconnect: boolean) {
        while (!closed) {
            const next = new Client({ connectionString });
            try {
                await next.connect();
                next.on("notification", (message) => listeners.dispatch(message.channel, message.payload ?? ""));
                next.on("error", (error) => {
                    console.error("[pubsub] connection error:", error.message);
                    scheduleReconnect(next);
                });
                next.on("end", () => scheduleReconnect(next));
                for (const channel of listeners.channels.keys()) {
                    await next.query(`LISTEN "${channel}"`);
                }
                client = next;
                backoffMs = 1000;
                if (isReconnect) listeners.resync();
                return;
            } catch (error) {
                console.error(`[pubsub] connect failed, retrying in ${backoffMs} ms:`, error);
                await next.end().catch(() => undefined);
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                backoffMs = Math.min(backoffMs * 2, 30_000);
            }
        }
    }

    function scheduleReconnect(failed: Client) {
        if (closed || client !== failed) return;
        client = null;
        failed.removeAllListeners();
        failed.end().catch(() => undefined);
        connecting = connect(true).finally(() => {
            connecting = null;
        });
    }

    connecting = connect(false).finally(() => {
        connecting = null;
    });

    return {
        subscribe(channel, listener) {
            if (listeners.add(channel, listener) && client) {
                client.query(`LISTEN "${channel}"`).catch((error) => console.error("[pubsub] LISTEN failed:", error));
            }
            return () => listeners.remove(channel, listener);
        },
        onResync(listener) {
            listeners.resyncListeners.add(listener);
            return () => listeners.resyncListeners.delete(listener);
        },
        async close() {
            closed = true;
            await connecting;
            const current = client;
            client = null;
            if (current) {
                current.removeAllListeners();
                await current.end().catch(() => undefined);
            }
        },
    };
}
