import { createServer } from "@/server/app";
import { EventBus } from "@/server/events";
import { createTestDatabase } from "./db";
import { createPglitePubSub } from "./pubsub";
import { createMemoryStorage } from "./storage";

export const TEST_API_URL = "https://fleet.test/api";
export const TEST_SITE_URL = "https://fleet.test";

/** The whole API in-process: PGlite, an in-memory bucket and PGlite LISTEN/NOTIFY. */
export async function createTestServer(options: { allowRegistration?: boolean } = {}) {
    const database = await createTestDatabase();
    const storage = createMemoryStorage();
    const pubsub = createPglitePubSub(database.pglite);
    const events = new EventBus();
    const tokens = { jwtSecret: "test-secret-that-is-at-least-32-characters", apiUrl: TEST_API_URL };
    const server = createServer({
        db: database.db,
        storage,
        pubsub,
        events,
        tokens,
        auth: {
            secret: "test-better-auth-secret-0123456789",
            siteUrl: TEST_SITE_URL,
            trustedOrigins: [TEST_SITE_URL],
            allowRegistration: options.allowRegistration ?? true,
        },
    });
    return {
        ...server,
        db: database.db,
        pglite: database.pglite,
        storage,
        pubsub,
        events,
        tokens,
        close: async () => {
            await pubsub.close();
            await database.close();
        },
    };
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>;

/** Signs up an admin through Better Auth and returns the session cookie header. */
export async function signUpAdmin(server: TestServer, email = "admin@fleet.test") {
    const response = await server.app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: TEST_SITE_URL },
        body: JSON.stringify({ email, password: "correct-horse-battery", name: "Admin" }),
    });
    if (!response.ok) throw new Error(`sign-up failed: ${response.status} ${await response.text()}`);
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
    return cookies.join("; ");
}

/** Admin API call with a session cookie; returns status and parsed JSON. */
export async function adminRequest(server: TestServer, cookie: string, method: string, path: string, body?: unknown) {
    const response = await server.app.request(`/admin${path}`, {
        method,
        headers: { Cookie: cookie, Origin: TEST_SITE_URL, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}
