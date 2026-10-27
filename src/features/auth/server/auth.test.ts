import { hashPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestServer, signUpAdmin, TEST_SITE_URL, type TestServer } from "@/server/testing/server";
import { account, user } from "./schema";

let server: TestServer;

beforeEach(async () => {
    server = await createTestServer();
});

afterEach(async () => {
    await server.close();
});

const post = (path: string, body: object, cookie?: string) =>
    server.app.request(`/auth${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: TEST_SITE_URL, ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body),
    });

const cookieOf = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");

const isSignedIn = async (cookie: string) =>
    (await server.app.request("/admin/computers/all", { headers: { Cookie: cookie } })).status === 200;

describe("dashboard authentication", () => {
    test("sign-up, sign-out, sign-in and password change", async () => {
        const cookie = await signUpAdmin(server, "jane@fleet.test");
        expect(await isSignedIn(cookie)).toBe(true);

        expect((await post("/sign-out", {}, cookie)).status).toBe(200);
        expect(await isSignedIn(cookie)).toBe(false);

        const signIn = await post("/sign-in/email", { email: "jane@fleet.test", password: "correct-horse-battery" });
        expect(signIn.status).toBe(200);
        const session = cookieOf(signIn);
        expect(await isSignedIn(session)).toBe(true);

        const change = await post("/change-password", { currentPassword: "correct-horse-battery", newPassword: "another-long-password" }, session);
        expect(change.status).toBe(200);
        expect((await post("/sign-in/email", { email: "jane@fleet.test", password: "correct-horse-battery" })).status).toBe(401);
        expect((await post("/sign-in/email", { email: "jane@fleet.test", password: "another-long-password" })).status).toBe(200);
    });

    test("registration can be disabled", async () => {
        const closed = await createTestServer({ allowRegistration: false });
        try {
            const response = await closed.app.request("/auth/sign-up/email", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: TEST_SITE_URL },
                body: JSON.stringify({ email: "x@fleet.test", password: "correct-horse-battery", name: "X" }),
            });
            expect(response.status).toBe(400);
            expect((await response.json()).message).toBe("Registration is disabled");
        } finally {
            await closed.close();
        }
    });

    test("credential rows imported from Convex sign in unchanged", async () => {
        // The importer copies user and account rows as they are; the hash format is Better Auth's own.
        const now = new Date();
        await server.db.insert(user).values({ id: "jd70by5svbyw1r7ntz54szcres8cj517", name: "admin3", email: "admin3@fleet.test", createdAt: now, updatedAt: now });
        await server.db.insert(account).values({
            id: "j572menm8xwq11xvxyvrbe79gh8ckmqp",
            accountId: "jd70by5svbyw1r7ntz54szcres8cj517",
            providerId: "credential",
            userId: "jd70by5svbyw1r7ntz54szcres8cj517",
            password: await hashPassword("imported-password-123"),
            createdAt: now,
            updatedAt: now,
        });
        const response = await post("/sign-in/email", { email: "admin3@fleet.test", password: "imported-password-123" });
        expect(response.status).toBe(200);
        expect((await response.json()).user.id).toBe("jd70by5svbyw1r7ntz54szcres8cj517");
    });
});
