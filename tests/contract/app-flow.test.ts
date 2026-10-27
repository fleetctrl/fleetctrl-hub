import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TestDevice } from "@/server/testing/device";
import { adminRequest, createTestServer, signUpAdmin, TEST_API_URL, TEST_SITE_URL, type TestServer } from "@/server/testing/server";

// In-process end to end: the admin API seeds data, the device API serves it in the v2 shapes.

let server: TestServer;
let cookie: string;
let device: TestDevice;
const admin = (method: string, path: string, body?: unknown) => adminRequest(server, cookie, method, path, body);

async function upload(name: string, content: string, contentType = "application/octet-stream") {
    const response = await server.app.request("/admin/files", {
        method: "PUT",
        headers: { Cookie: cookie, Origin: TEST_SITE_URL, "Content-Type": contentType, "X-File-Name": encodeURIComponent(name) },
        body: content,
    });
    expect(response.status).toBe(201);
    const file = await response.json();
    return { storageId: file.fileId, name: file.name, size: file.size, hash: file.sha256, type: file.contentType };
}

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");

beforeAll(async () => {
    server = await createTestServer();
    cookie = await signUpAdmin(server);
    const token = (await admin("POST", "/enrollment-tokens", { name: "flow", remainingUses: 2 })).body.token;
    device = await TestDevice.create({ request: async (path, init) => server.app.request(path, init) }, TEST_API_URL);
    expect((await device.enroll(token, "flow-pc")).status).toBe(201);
});

afterAll(async () => {
    await server.close();
});

describe("admin API", () => {
    test("requires a session", async () => {
        const response = await server.app.request("/admin/computers/all");
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "You must be logged in to perform this action" });
    });

    test("lists the enrolled computer", async () => {
        const { status, body } = await admin("GET", "/computers?numItems=10");
        expect(status).toBe(200);
        expect(body).toEqual({ page: [expect.objectContaining({ id: device.deviceId, deviceId: device.deviceId, name: "flow-pc" })], continueCursor: expect.any(String), isDone: true });
        expect((await admin("GET", `/computers/${device.deviceId}`)).body).toEqual(expect.objectContaining({ id: device.deviceId, createdAt: expect.any(Number) }));
        expect((await admin("GET", "/computers/nope")).body).toBeNull();
    });

    test("domain errors keep their message", async () => {
        await admin("POST", "/groups/static", { displayName: "dup" });
        expect(await admin("POST", "/groups/static", { displayName: "dup" })).toEqual(expect.objectContaining({
            status: 400,
            body: { error: "A group with this name already exists" },
        }));
        expect((await admin("POST", "/groups/static", { description: 1 })).status).toBe(400);
    });
});

describe("win32 app delivery", () => {
    const installer = "MZ fake installer bytes";
    const requirementScript = "exit 0";
    const preScript = "Write-Host pre";
    let appId: string;
    let releaseId: string;
    let installerFileId: string;

    test("an assigned win32 release appears in /apps/assigned", async () => {
        const group = await admin("POST", "/groups/static", { displayName: "Office", memberIds: [device.deviceId] });
        const binary = await upload("setup.msi", installer);
        installerFileId = binary.storageId;
        expect(binary.type).toBe("application/x-msi");
        expect(binary.hash).toBe(sha256(installer));

        const created = await admin("POST", "/apps", {
            appInfo: { name: "Editor", publisher: "ACME" },
            release: {
                type: "win32", installBinary: { ...binary, hash: "browser-hash-is-ignored" }, installScript: "msiexec /i setup.msi",
                uninstallScript: "msiexec /x setup.msi", autoUpdate: true, version: "1.2.3",
                uninstallPreviousVersion: false, allowMultipleVersions: false,
            },
            requirement: { requirementScriptBinary: await upload("req.ps1", requirementScript), timeout: 30, runAsSystem: true },
            detection: { detections: [{ type: "file", path: "C:\\Editor\\editor.exe", fileType: "exists" }] },
            preScript: { scriptBinary: await upload("pre.ps1", preScript), engine: "powershell" },
            postScript: null,
            assignment: { installGroups: [{ groupId: group.body.id, groupType: "static", mode: "include" }], uninstallGroups: [] },
        });
        expect(created.status).toBe(200);
        appId = created.body;

        const response = await device.call("GET", "/apps/assigned");
        const { apps } = await response.json();
        releaseId = apps[0].releases[0].id;
        expect(apps).toEqual([{
            id: appId,
            display_name: "Editor",
            publisher: "ACME",
            auto_update: true,
            releases: [{
                id: releaseId,
                version: "1.2.3",
                assign_type: "include",
                action: "install",
                installer_type: "win32",
                uninstall_previous: false,
                win32: {
                    install_binary_path: installerFileId,
                    installer_name: "setup.msi",
                    hash: sha256(installer),
                    install_script: "msiexec /i setup.msi",
                    uninstall_script: "msiexec /x setup.msi",
                    install_binary_size: installer.length,
                },
                winget: null,
                detection_rules: [{ type: "file", config: { version: "1", operator: "exists", path: "C:\\Editor\\editor.exe" } }],
                requirements: [{ id: expect.any(String), script_name: "req.ps1", timeout_seconds: 30, run_as_system: true, hash: sha256(requirementScript) }],
                scripts: [{
                    _id: expect.any(String), _creationTime: expect.any(Number), release_id: releaseId, phase: "pre",
                    engine: "powershell", timeout_seconds: 60, run_as_system: false, script_name: "pre.ps1",
                    storage_id: expect.any(String), hash: sha256(preScript), byte_size: preScript.length,
                }],
            }],
        }]);
    });

    test("binaries are streamed with Content-Type and Content-Length", async () => {
        const download = await device.call("GET", `/apps/download/${releaseId}`);
        expect(download.status).toBe(200);
        expect(download.headers.get("content-type")).toBe("application/x-msi");
        expect(download.headers.get("content-length")).toBe(String(installer.length));
        expect(await download.text()).toBe(installer);

        const { apps } = await (await device.call("GET", "/apps/assigned")).json();
        const [requirement] = apps[0].releases[0].requirements;
        const [script] = apps[0].releases[0].scripts;
        expect(await (await device.call("GET", `/apps/requirement/download/${requirement.id}`)).text()).toBe(requirementScript);
        expect(await (await device.call("GET", `/apps/script/download/${script._id}`)).text()).toBe(preScript);
    });

    test("other devices cannot download it", async () => {
        const token = (await admin("POST", "/enrollment-tokens", { remainingUses: 1 })).body.token;
        const outsider = await TestDevice.create({ request: async (path, init) => server.app.request(path, init) }, TEST_API_URL);
        await outsider.enroll(token, "outsider");
        expect((await outsider.call("GET", `/apps/download/${releaseId}`)).status).toBe(404);
    });

    test("install state reports show up in the admin install status", async () => {
        const installedAt = Date.now() - 5000;
        const report = await device.call("PATCH", `/apps/release/${releaseId}/state`, { body: { status: "INSTALLED", installed_at: installedAt } });
        expect(await report.json()).toEqual({ status: "ok" });

        const summary = await admin("GET", `/apps/${appId}/installs/summary`);
        expect(summary.body).toEqual({ total: 1, byStatus: { PENDING: 0, INSTALLING: 0, INSTALLED: 1, ERROR: 0, UNINSTALLED: 0 } });
        const page = await admin("GET", `/apps/${appId}/installs?numItems=10`);
        expect(page.body.page).toEqual([expect.objectContaining({
            computerId: device.deviceId, computerName: "flow-pc", releaseVersion: "1.2.3", status: "INSTALLED", installedAt,
        })]);
        const table = await admin("GET", "/apps/table?numItems=10");
        expect(table.body.page[0]).toEqual(expect.objectContaining({ id: appId, installedCount: 1, groupsCount: 1, groups: [{ id: expect.any(String), name: "Office" }] }));
    });

    test("editing a release keeps the stored installer metadata", async () => {
        const releasesPage = await admin("GET", `/apps/${appId}/releases?numItems=10`);
        const release = releasesPage.body.page[0];
        expect(release.win32_releases[0]).toEqual(expect.objectContaining({ install_binary_storage_id: installerFileId, installer_name: "setup.msi" }));
        expect(release.computer_group_releases[0].computer_groups).toEqual(expect.objectContaining({ _id: expect.any(String), display_name: "Office" }));

        // The release sheet re-sends unchanged files with placeholder names.
        const updated = await admin("PATCH", `/apps/releases/${releaseId}`, {
            type: "win32", version: "1.2.4", uninstall_previous: true,
            installBinary: { storageId: installerFileId, name: "installer.zip", size: 0, hash: "x", type: "application/zip" },
            detections: [], assignments: {
                installGroups: release.computer_group_releases.map((row: { group_id: string }) => ({ groupId: row.group_id, groupType: "static", mode: "include" })),
                uninstallGroups: [],
            },
        });
        expect(updated.body).toEqual({ success: true });
        const { apps } = await (await device.call("GET", "/apps/assigned")).json();
        expect(apps[0].releases[0]).toEqual(expect.objectContaining({ version: "1.2.4", uninstall_previous: true, requirements: [], scripts: [] }));
        expect(apps[0].releases[0].win32).toEqual(expect.objectContaining({ installer_name: "setup.msi", hash: sha256(installer) }));
    });

    test("deleting the app removes it from the device", async () => {
        expect((await admin("DELETE", `/apps/${appId}`)).body).toEqual({ success: true });
        expect(await (await device.call("GET", "/apps/assigned")).json()).toEqual({ apps: [] });
    });
});

describe("client self-update", () => {
    test("outdated clients get X-Client-Update and can download the MSI", async () => {
        const msi = "fake msi";
        const file = await upload("FleetCtrl.msi", msi, "application/octet-stream");
        const id = (await admin("POST", "/client-updates", { version: "9.9.9", storageId: file.storageId, file_name: "FleetCtrl.msi" })).body;
        expect((await device.call("GET", "/tasks", { headers: { "X-Client-Version": "1.0.0" } })).headers.get("x-client-update")).toBeNull();
        await admin("POST", `/client-updates/${id}/activate`);

        const response = await device.call("GET", "/tasks", { headers: { "X-Client-Version": "1.0.0" } });
        const header = JSON.parse(response.headers.get("x-client-update") ?? "null");
        expect(header).toEqual({ version: "9.9.9", id: `${id}.msi`, hash: sha256(msi) });
        expect((await device.call("GET", "/tasks", { headers: { "X-Client-Version": "9.9.9" } })).headers.get("x-client-update")).toBeNull();

        expect(await (await server.app.request("/client/version")).json()).toEqual(header);
        const download = await device.call("GET", `/client/download/${header.id}`);
        expect(download.status).toBe(200);
        expect(await download.text()).toBe(msi);
        expect((await device.call("GET", "/client/download/unknown")).status).toBe(404);

        const second = await upload("FleetCtrl2.msi", "v2");
        const secondId = (await admin("POST", "/client-updates", { version: "10.0.0", storageId: second.storageId })).body;
        await admin("POST", `/client-updates/${secondId}/activate`);
        const versions = await admin("GET", "/client-updates?numItems=10");
        expect(versions.body.page.map((row: { version: string; is_active: boolean }) => [row.version, row.is_active]))
            .toEqual([["10.0.0", true], ["9.9.9", false]]);
    });
});

describe("tasks", () => {
    test("admin-created tasks reach the device and report back", async () => {
        const { body } = await admin("POST", "/tasks", { computerId: device.deviceId, taskType: "SET_PASSWD", taskData: { password: "x" } });
        const { tasks } = await (await device.call("GET", "/tasks")).json();
        expect(tasks).toEqual([{ id: body.id, created_at: expect.any(Number), status: "PENDING", task: "SET_PASSWD", task_data: { password: "x" } }]);
        expect(await (await device.call("PATCH", `/task/${body.id}`, { body: { status: "SUCCESS" } })).json()).toEqual({ status: "ok" });
        expect((await admin("GET", `/tasks/computer/${device.deviceId}`)).body).toEqual([expect.objectContaining({ id: body.id, status: "SUCCESS", finishAt: expect.any(Number) })]);
        expect((await device.call("PATCH", "/task/unknown", { body: { status: "SUCCESS" } })).status).toBe(500);
    });
});

describe("dynamic groups", () => {
    test("inventory changes move the computer between dynamic groups", async () => {
        const created = await admin("POST", "/groups/dynamic", {
            displayName: "Windows 11",
            ruleExpression: { property: "os", operator: "contains", value: "Windows 11" },
        });
        const members = async () => (await admin("GET", `/groups/dynamic/${created.body.id}/members?numItems=10`)).body.page;
        expect(await members()).toEqual([]);

        await device.call("PATCH", "/computer/hardware-sync", { body: { os: "Microsoft Windows 11 Pro" } });
        expect(await members()).toEqual([expect.objectContaining({ computerId: device.deviceId, computer: expect.objectContaining({ name: "flow-pc" }) })]);
        expect((await admin("GET", "/groups/dynamic")).body[0]).toEqual(expect.objectContaining({ memberCount: 1, createdAt: expect.any(String) }));

        await device.call("PATCH", "/computer/hardware-sync", { body: { os: "Windows 10" } });
        expect(await members()).toEqual([]);
        expect((await admin("POST", "/groups/dynamic/refresh-all")).body).toEqual({ groups: 1, added: 0, removed: 0 });
    });
});

describe("computer deletion", () => {
    test("cascades and revokes the device", async () => {
        expect((await admin("DELETE", `/computers/${device.deviceId}`)).body).toEqual({ success: true });
        expect((await server.app.request(`/devices/${device.deviceId}/is-enrolled`)).status).toBe(404);
        expect((await device.refresh()).status).toBe(401);
    });
});
