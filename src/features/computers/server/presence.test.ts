import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestServer, signUpAdmin, TEST_SITE_URL, type TestServer } from "@/server/testing/server";
import { computers } from "./schema";
import { recordPresence } from "./service";

let server: TestServer;
let cookie: string;
let computerId: string;

beforeAll(async () => {
    server = await createTestServer();
    cookie = await signUpAdmin(server);
    [{ id: computerId }] = await server.db.insert(computers).values({ name: "pc" }).returning({ id: computers.id });
});

afterAll(async () => {
    await server.close();
});

/** Reads SSE events from a response body until `count` events arrived or the timeout passed. */
function sseReader(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // A read that lost the race against the timeout stays pending and must be reused, or its chunk is lost.
    let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
    return {
        async next(timeoutMs: number): Promise<{ event: string; data: string } | null> {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
                const boundary = buffer.indexOf("\n\n");
                if (boundary >= 0) {
                    const block = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const lines = block.split("\n").filter((line) => !line.startsWith(":"));
                    if (lines.length === 0) continue;
                    const field = (name: string) => lines.find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? "";
                    return { event: field("event"), data: field("data") };
                }
                const remaining = deadline - Date.now();
                if (remaining <= 0) return null;
                pendingRead ??= reader.read();
                const chunk = await Promise.race([
                    pendingRead,
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
                ]);
                if (chunk === null) return null;
                pendingRead = null;
                if (chunk.done) return null;
                buffer += decoder.decode(chunk.value, { stream: true });
            }
        },
        cancel: () => reader.cancel(),
    };
}

test("presence events follow committed heartbeats only", async () => {
    const response = await server.app.request("/admin/computers/presence", { headers: { Cookie: cookie, Origin: TEST_SITE_URL } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = sseReader(response);

    try {
        // Rolled back: Postgres never delivers the notification.
        await server.db.transaction(async (tx) => {
            await recordPresence(tx, computerId);
            tx.rollback();
        }).catch(() => undefined);
        expect(await events.next(1500)).toBeNull();

        const at = await server.db.transaction((tx) => recordPresence(tx, computerId));
        await server.db.transaction((tx) => recordPresence(tx, computerId));
        const event = await events.next(3000);
        expect(event?.event).toBe("presence");
        const updates = JSON.parse(event!.data);
        // Buffered: two heartbeats within one flush interval arrive as one entry with the newest time.
        expect(updates).toHaveLength(1);
        expect(updates[0].id).toBe(computerId);
        expect(updates[0].lastConnection).toBeGreaterThanOrEqual(at.getTime());

        server.pubsub.simulateReconnect();
        expect((await events.next(3000))?.event).toBe("resync");
    } finally {
        await events.cancel();
    }
});

test("the stream needs a session", async () => {
    expect((await server.app.request("/admin/computers/presence")).status).toBe(401);
});
