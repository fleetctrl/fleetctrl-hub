import { adminRequest, createTestServer, signUpAdmin, TEST_API_URL, type TestServer } from "@/server/testing/server";

/**
 * Where the device contract suite runs.
 *  - Default: the v3 API in-process (PGlite), with an admin session to seed data.
 *  - Remote: set CONTRACT_BASE_URL (public API base, e.g. https://localhost/api) and
 *    CONTRACT_ENROLLMENT_TOKEN to run the device-only checks against a live v2 or v3 stack.
 *    CONTRACT_API_URL overrides the DPoP `htu` base (defaults to CONTRACT_BASE_URL).
 */
export type ContractTarget = {
    fetcher: { request: (path: string, init?: RequestInit) => Promise<Response> };
    apiUrl: string;
    enrollmentToken: () => Promise<string>;
    /** Present in-process only. */
    admin: { server: TestServer; request: (method: string, path: string, body?: unknown) => ReturnType<typeof adminRequest> } | null;
    close: () => Promise<void>;
};

export async function createContractTarget(): Promise<ContractTarget> {
    const baseUrl = process.env.CONTRACT_BASE_URL?.replace(/\/$/, "");
    if (baseUrl) {
        const token = process.env.CONTRACT_ENROLLMENT_TOKEN;
        if (!token) throw new Error("CONTRACT_ENROLLMENT_TOKEN is required with CONTRACT_BASE_URL");
        return {
            fetcher: { request: (path, init) => fetch(`${baseUrl}${path}`, { ...init, redirect: "manual" }) },
            apiUrl: process.env.CONTRACT_API_URL ?? baseUrl,
            enrollmentToken: async () => token,
            admin: null,
            close: async () => {},
        };
    }

    const server = await createTestServer();
    const cookie = await signUpAdmin(server);
    const request = (method: string, path: string, body?: unknown) => adminRequest(server, cookie, method, path, body);
    return {
        fetcher: { request: async (path, init) => server.app.request(path, init) },
        apiUrl: TEST_API_URL,
        enrollmentToken: async () => {
            const created = await request("POST", "/enrollment-tokens", { name: "contract", remainingUses: -1 });
            return created.body.token;
        },
        admin: { server, request },
        close: () => server.close(),
    };
}
