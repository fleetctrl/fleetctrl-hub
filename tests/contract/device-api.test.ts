import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestDevice } from "@/server/testing/device";
import { createContractTarget, type ContractTarget } from "./target";

// The frozen device API contract of the deployed Windows client (fleetctrl-client).
// Responses are compared by status, shape and value types; IDs and tokens differ per run.

let target: ContractTarget;
let device: TestDevice;

beforeAll(async () => {
    target = await createContractTarget();
    device = await TestDevice.create(target.fetcher, target.apiUrl);
    const response = await device.enroll(await target.enrollmentToken(), "contract-pc");
    expect(response.status).toBe(201);
});

afterAll(async () => {
    await target.close();
});

const json = async (response: Response) => ({ status: response.status, body: await response.json() });

describe("public routes", () => {
    test("GET /health", async () => {
        expect(await json(await target.fetcher.request("/health"))).toEqual({ status: 200, body: { status: "ok" } });
    });

    test("POST /enroll without enrollment token", async () => {
        const response = await target.fetcher.request("/enroll", { method: "POST", body: "{}" });
        expect(await json(response)).toEqual({ status: 400, body: { error: "Missing enrollment-token" } });
    });

    test("POST /enroll with an unknown token", async () => {
        const other = await TestDevice.create(target.fetcher, target.apiUrl);
        const response = await other.enroll("not-a-real-token", "pc");
        const { status, body } = await json(response);
        expect(status).toBe(400);
        expect(body.error).toContain("Invalid enrollment token");
    });

    test("POST /enroll returns tokens and the device ID", async () => {
        const other = await TestDevice.create(target.fetcher, target.apiUrl);
        const { status, body } = await json(await other.enroll(await target.enrollmentToken(), "second-pc"));
        expect(status).toBe(201);
        expect(body).toEqual({
            tokens: { access_token: expect.any(String), refresh_token: expect.any(String), expires_in: 900 },
            device_id: expect.any(String),
        });
    });

    test("GET /devices/:id/is-enrolled", async () => {
        expect(await json(await target.fetcher.request(`/devices/${device.deviceId}/is-enrolled`)))
            .toEqual({ status: 200, body: { is_enrolled: true } });
        expect(await json(await target.fetcher.request("/devices/jd7unknownunknownunknownunknown00/is-enrolled")))
            .toEqual({ status: 404, body: { is_enrolled: false } });
    });
});

describe("device authentication", () => {
    test("missing DPoP header", async () => {
        const response = await target.fetcher.request("/tasks", { headers: { Authorization: `Bearer ${device.accessToken}` } });
        expect(await json(response)).toEqual({ status: 401, body: { error: "Missing DPoP header" } });
    });

    test("missing bearer token", async () => {
        const response = await device.call("GET", "/tasks", { auth: false });
        expect(await json(response)).toEqual({ status: 401, body: { error: "Missing bearer token" } });
    });

    test("replayed proof", async () => {
        const proof = await device.proof("GET", "/tasks", { accessToken: device.accessToken ?? undefined });
        expect((await device.call("GET", "/tasks", { dpop: proof })).status).toBe(200);
        expect(await json(await device.call("GET", "/tasks", { dpop: proof })))
            .toEqual({ status: 401, body: { error: "Replayed DPoP proof" } });
    });

    test("proof for another URL", async () => {
        const proof = await device.proof("GET", "/tasks", { htu: "https://elsewhere.test/api/tasks" });
        expect(await json(await device.call("GET", "/tasks", { dpop: proof })))
            .toEqual({ status: 401, body: { error: "htu mismatch" } });
    });

    test("proof bound to another access token", async () => {
        const proof = await device.proof("GET", "/tasks", { accessToken: "some-other-token" });
        expect(await json(await device.call("GET", "/tasks", { dpop: proof })))
            .toEqual({ status: 401, body: { error: "ATH mismatch" } });
    });

    test("unknown routes need authentication, then 404", async () => {
        expect((await target.fetcher.request("/does-not-exist")).status).toBe(401);
        expect((await device.call("GET", "/does-not-exist")).status).toBe(404);
    });
});

describe("protected routes", () => {
    test("POST /computer/heartbeat", async () => {
        expect(await json(await device.call("POST", "/computer/heartbeat"))).toEqual({ status: 200, body: { status: "ok" } });
    });

    test("PATCH /computer/hardware-sync", async () => {
        const body = {
            name: "contract-pc", ip: "10.0.0.5", os: "Windows 11", os_version: "24H2", login_user: "jane",
            rustdesk_id: "123456789",
            hardware: {
                cpu_name: "CPU", cpu_cores: 4, cpu_logical_processors: 8, ram_bytes: 17179869184,
                system_drive: "C:", system_drive_total_bytes: 512000000000, system_drive_free_bytes: 1000,
            },
        };
        expect(await json(await device.call("PATCH", "/computer/hardware-sync", { body }))).toEqual({ status: 200, body: { status: "ok" } });
        expect(await json(await device.call("PATCH", "/computer/rustdesk-sync", { body: { name: "contract-pc" } })))
            .toEqual({ status: 200, body: { status: "ok" } });
        expect(await json(await device.call("PATCH", "/computer/hardware-sync", { body: { hardware: { cpu_name: "x" } } })))
            .toEqual({ status: 400, body: { error: "Invalid inventory payload" } });
    });

    test("GET /tasks", async () => {
        const { status, body } = await json(await device.call("GET", "/tasks"));
        expect(status).toBe(200);
        expect(body).toEqual({ tasks: expect.any(Array) });
    });

    test("PATCH /task/:id without status", async () => {
        expect(await json(await device.call("PATCH", "/task/whatever", { body: {} })))
            .toEqual({ status: 400, body: { error: "Missing status" } });
    });

    test("GET /apps/assigned", async () => {
        const { status, body } = await json(await device.call("GET", "/apps/assigned"));
        expect(status).toBe(200);
        expect(body).toEqual({ apps: expect.any(Array) });
    });

    test("PATCH /apps/release/:id/state validation", async () => {
        expect(await json(await device.call("PATCH", "/apps/release/x/state", { body: { installed_at: "nope" } })))
            .toEqual({ status: 400, body: { error: "Invalid install state payload" } });
        expect(await json(await device.call("PATCH", "/apps/release/x/state", { body: {} })))
            .toEqual({ status: 400, body: { error: "Missing status" } });
        expect(await json(await device.call("PATCH", "/apps/release/x/state", { body: { status: "DONE" } })))
            .toEqual({ status: 400, body: { error: "Invalid status" } });
    });

    test("download of an unknown release", async () => {
        expect(await json(await device.call("GET", "/apps/download/jd7unknownunknownunknownunknown00")))
            .toEqual({ status: 404, body: { error: "Release not found or access denied" } });
    });
});

describe("token lifecycle", () => {
    test("refresh rotates, the old token works once within the grace window", async () => {
        const original = device.refreshToken;
        const first = await json(await device.refresh());
        expect(first).toEqual({
            status: 200,
            body: { tokens: { access_token: expect.any(String), refresh_token: expect.any(String), expires_in: 900 } },
        });

        const replay = async () => device.call("POST", "/token/refresh", { body: { refresh_token: original }, auth: false });
        expect((await replay()).status).toBe(200);
        expect(await json(await replay())).toEqual({ status: 401, body: { error: expect.stringContaining("Refresh token grace already used") } });
    });

    test("refresh with another device key", async () => {
        const other = await TestDevice.create(target.fetcher, target.apiUrl);
        const response = await other.call("POST", "/token/refresh", { body: { refresh_token: device.refreshToken }, auth: false });
        expect(await json(response)).toEqual({ status: 401, body: { error: expect.stringContaining("Device proof mismatch") } });
    });

    test("recover issues fresh tokens for the key", async () => {
        const { status, body } = await json(await device.call("POST", "/token/recover", { auth: false }));
        expect(status).toBe(200);
        expect(body).toEqual({ tokens: { access_token: expect.any(String), refresh_token: expect.any(String), expires_in: 900 } });
        device.accessToken = body.tokens.access_token;
        device.refreshToken = body.tokens.refresh_token;
        expect((await device.call("GET", "/tasks")).status).toBe(200);
    });

    test("recover with an unknown key", async () => {
        const other = await TestDevice.create(target.fetcher, target.apiUrl);
        expect(await json(await other.call("POST", "/token/recover", { auth: false })))
            .toEqual({ status: 401, body: { error: expect.stringContaining("Unknown device jkt") } });
    });

    test("re-enrollment keeps the device ID", async () => {
        const id = device.deviceId;
        const { status, body } = await json(await device.enroll(await target.enrollmentToken(), "renamed-pc", { deviceId: id ?? undefined }));
        expect(status).toBe(201);
        expect(body.device_id).toBe(id);
    });
});
