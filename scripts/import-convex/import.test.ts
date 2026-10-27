import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import yazl from "yazl";
import * as schema from "@/server/db/schema";
import { createTestDatabase, type TestDatabase } from "@/server/testing/db";
import { createMemoryStorage } from "@/server/testing/storage";
import { ImportBlockedError, runImport } from "./run";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const migrationsFolder = path.resolve(import.meta.dirname, "../../drizzle");

const files = { f1: "installer bytes", f3: "client 1", f4: "client 2", f5: "never referenced" };
const base64Sha = (content: string) => createHash("sha256").update(content).digest("base64");
const hexSha = (content: string) => createHash("sha256").update(content).digest("hex");

const tables = {
    "computers/documents.jsonl": [
        { _id: "c1", _creationTime: NOW - 10 * DAY + 0.25, name: "PC-1", jkt: "jkt-a", os: "Windows 11", last_connection: NOW - 1000, rustdesk_id: 400043058.0, hardware: { cpu_name: "CPU", cpu_cores: 4.0, cpu_logical_processors: 8.0, ram_bytes: 17174917120.0, system_drive: "C:", system_drive_total_bytes: 136345284608.0, system_drive_free_bytes: 68773646336.0 }, search_text: "pc-1" },
        { _id: "c2", _creationTime: NOW - 20 * DAY, name: "PC-2", jkt: "jkt-a", last_connection: NOW - 5 * DAY },
    ],
    "enrollment_tokens/documents.jsonl": [{ _id: "e1", _creationTime: NOW - DAY, token_hash: "h-e1", remaining_uses: 5.0, disabled: false }],
    "refresh_tokens/documents.jsonl": [
        { _id: "r1", _creationTime: NOW - DAY, computer_id: "c1", token_hash: "h1", jkt: "jkt-a", status: "ACTIVE", expires_at: NOW + DAY },
        { _id: "r2", _creationTime: NOW - 40 * DAY, computer_id: "c1", token_hash: "h2", jkt: "jkt-a", status: "ACTIVE", expires_at: NOW - DAY },
        { _id: "r3", _creationTime: NOW - DAY, computer_id: "c1", token_hash: "h3", jkt: "jkt-a", status: "REVOKED", expires_at: NOW + DAY, grace_until: NOW + 60_000 },
        { _id: "r4", _creationTime: NOW - DAY, computer_id: "c1", token_hash: "h4", jkt: "jkt-a", status: "ROTATED", expires_at: NOW + DAY },
        { _id: "r5", _creationTime: NOW - DAY, computer_id: "gone", token_hash: "h5", jkt: "x", status: "ACTIVE", expires_at: NOW + DAY },
    ],
    "tasks/documents.jsonl": [
        { _id: "t1", _creationTime: NOW - DAY, computer_id: "c1", task_type: "SET_PASSWD", status: "PENDING", task_data: { password: "x" } },
        { _id: "t2", _creationTime: NOW - DAY, computer_id: "gone", task_type: "SET_PASSWD", status: "PENDING" },
    ],
    "computer_groups/documents.jsonl": [{ _id: "g1", _creationTime: NOW - DAY, display_name: "Office" }],
    "computer_group_members/documents.jsonl": [
        { _id: "m1", _creationTime: NOW - DAY, group_id: "g1", computer_id: "c1" },
        { _id: "m2", _creationTime: NOW - DAY + 1, group_id: "g1", computer_id: "c1" },
        { _id: "m3", _creationTime: NOW - DAY, group_id: "g1", computer_id: "gone" },
    ],
    "dynamic_computer_groups/documents.jsonl": [
        { _id: "d1", _creationTime: NOW - DAY, display_name: "Win11", rule_expression: { property: "os", operator: "contains", value: "Windows 11" } },
        { _id: "d2", _creationTime: NOW - DAY, display_name: "Broken", rule_expression: { property: "colour", operator: "is", value: "" } },
    ],
    "dynamic_group_members/documents.jsonl": [{ _id: "dm1", _creationTime: NOW, group_id: "d1", computer_id: "c2", added_at: NOW }],
    "apps/documents.jsonl": [{ _id: "a1", _creationTime: NOW - DAY, display_name: "Editor", publisher: "ACME", auto_update: true, allow_multiple_versions: false }],
    "releases/documents.jsonl": [
        { _id: "rel1", _creationTime: NOW - DAY, app_id: "a1", version: "1.2.10", installer_type: "win32", uninstall_previous: false },
        { _id: "rel2", _creationTime: NOW - DAY, app_id: "a1", version: "latest", installer_type: "winget", uninstall_previous: false },
        { _id: "rel3", _creationTime: NOW - DAY, app_id: "deleted-app", version: "1", installer_type: "winget", uninstall_previous: false },
    ],
    "win32_releases/documents.jsonl": [
        { _id: "w1", _creationTime: NOW - DAY, release_id: "rel1", installer_name: "setup.msi", install_binary_storage_id: "f1", hash: hexSha(files.f1), install_script: "i", uninstall_script: "u", install_binary_size: 15.0 },
        { _id: "w2", _creationTime: NOW - DAY, release_id: "rel3", installer_name: "x", install_binary_storage_id: "f1", hash: "x", install_script: "", uninstall_script: "" },
    ],
    "winget_releases/documents.jsonl": [{ _id: "wg1", _creationTime: NOW - DAY, release_id: "rel2", winget_id: "ACME.Editor" }],
    "detection_rules/documents.jsonl": [{ _id: "dr1", _creationTime: NOW - DAY, release_id: "rel1", type: "file", config: { version: "1", operator: "exists", path: "C:\\x" } }],
    "release_requirements/documents.jsonl": [{ _id: "rq1", _creationTime: NOW - DAY, release_id: "rel1", timeout_seconds: 60.0, run_as_system: false, script_name: "req.ps1", storage_id: "f2", hash: "x" }],
    "release_scripts/documents.jsonl": [{ _id: "s1", _creationTime: NOW - DAY, release_id: "rel1", phase: "pre", engine: "powershell", timeout_seconds: 30.0, run_as_system: true, script_name: "pre.ps1", hash: "x" }],
    "computer_group_releases/documents.jsonl": [
        { _id: "cgr1", _creationTime: NOW - DAY, release_id: "rel1", group_id: "g1", assign_type: "include", action: "install" },
        { _id: "cgr2", _creationTime: NOW - DAY + 5, release_id: "rel1", group_id: "g1", assign_type: "exclude", action: "install" },
    ],
    "dynamic_group_releases/documents.jsonl": [{ _id: "dgr1", _creationTime: NOW - DAY, release_id: "rel2", group_id: "d1", assign_type: "include", action: "install" }],
    "computer_apps_installs/documents.jsonl": [
        { _id: "i1", _creationTime: NOW - 3 * DAY, computer_id: "c1", app_id: "a1", status: "INSTALLING", release_id: "rel1", status_updated_at: NOW - 3 * DAY },
        { _id: "i2", _creationTime: NOW - 2 * DAY, computer_id: "c1", app_id: "a1", status: "INSTALLED", release_id: "rel1", status_updated_at: NOW - DAY, reinstall_requested_at: NOW - 1234.0 },
        { _id: "i3", _creationTime: NOW - DAY, computer_id: "c1", app_id: "deleted-app", status: "INSTALLED" },
    ],
    "client_updates/documents.jsonl": [
        { _id: "cu1", _creationTime: NOW - 2 * DAY, version: "2.3.0", storage_id: "f3", hash: hexSha(files.f3), byte_size: 8.0, file_name: "a.msi", is_active: true, version_sort_key: "stale" },
        { _id: "cu2", _creationTime: NOW - DAY, version: "2.3.1", storage_id: "f4", hash: hexSha(files.f4), byte_size: 8.0, is_active: true },
    ],
    "_storage/documents.jsonl": [
        ...(["f1", "f3", "f4", "f5"] as const).map((id) => ({ _id: id, _creationTime: NOW - DAY, sha256: base64Sha(files[id]), size: files[id].length, contentType: "application/octet-stream" })),
        { _id: "f2", _creationTime: NOW - DAY, sha256: base64Sha("missing"), size: 7 },
    ],
    "_components/betterAuth/user/documents.jsonl": [{ _id: "u1", _creationTime: NOW, name: "Admin", email: "admin@example.test", emailVerified: false, createdAt: NOW, updatedAt: NOW }],
    "_components/betterAuth/account/documents.jsonl": [
        { _id: "acc1", _creationTime: NOW, accountId: "u1", providerId: "credential", userId: "u1", password: "salt:hash", createdAt: NOW, updatedAt: NOW },
        { _id: "acc2", _creationTime: NOW, accountId: "ux", providerId: "credential", userId: "ux", createdAt: NOW, updatedAt: NOW },
    ],
    "_components/betterAuth/session/documents.jsonl": [{ _id: "sess", _creationTime: NOW, token: "t", userId: "u1", expiresAt: NOW, createdAt: NOW, updatedAt: NOW }],
};

let dir: string;
let zipPath: string;
let t: TestDatabase;
let storage: ReturnType<typeof createMemoryStorage>;

async function writeFixture() {
    const zip = new yazl.ZipFile();
    for (const [name, docs] of Object.entries(tables)) {
        zip.addBuffer(Buffer.from(docs.map((doc) => JSON.stringify(doc)).join("\n") + "\n"), name);
    }
    zip.addBuffer(Buffer.from(files.f1), "_storage/f1");
    zip.addBuffer(Buffer.from(files.f3), "_storage/f3.msi");
    zip.addBuffer(Buffer.from(files.f4), "_storage/f4");
    zip.addBuffer(Buffer.from(files.f5), "_storage/f5");
    zip.addBuffer(Buffer.from("not json\n"), "tasks/garbage.jsonl");
    await new Promise<void>((resolve, reject) => {
        zip.outputStream.pipe(createWriteStream(zipPath)).on("close", () => resolve()).on("error", reject);
        zip.end();
    });
}

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fleetctrl-import-"));
    zipPath = path.join(dir, "export.zip");
    await writeFixture();
    t = await createTestDatabase();
    storage = createMemoryStorage();
});

afterEach(async () => {
    await t.close();
    await rm(dir, { recursive: true, force: true });
});

const deps = () => ({ db: t.db, storage, migrationsFolder });

describe("Convex importer", () => {
    test("dry run reports orphans, filtered tokens and conflicts without writing anything", async () => {
        const report = await runImport(deps(), { zipPath, mode: "dry-run", autoResolve: false, now: NOW });

        expect(report.preflight).toEqual({ migrationsApplied: true, targetEmpty: true, nonEmptyTables: [] });
        expect(report.blocking.map((item) => item.kind).sort()).toEqual(["computer jkt", "invalid dynamic group rule", "static group assignment"]);
        expect(report.resolutions.map((item) => item.kind).sort()).toEqual(["active client update", "install state per computer and app", "static group membership"]);
        const reasons = Object.fromEntries(report.dropped.map((doc) => [`${doc.table}/${doc.id}`, doc.reason]));
        expect(reasons).toEqual(expect.objectContaining({
            "refresh_tokens/r2": "active token no longer usable",
            "refresh_tokens/r4": "rotated token no longer usable",
            "refresh_tokens/r5": "computer gone missing",
            "tasks/t2": "computer gone missing",
            "computer_group_members/m3": "computer gone missing",
            "releases/rel3": "app deleted-app missing",
            "win32_releases/w2": "release rel3 missing",
            "release_requirements/rq1": "file f2 missing from the export",
            "computer_apps_installs/i3": "app deleted-app missing",
            "account/acc2": "user ux missing",
        }));
        expect(report.skipped).toEqual({ session: 1, verification: 0, jwks: 0, dynamic_group_members: 1 });
        expect(report.files).toEqual(expect.objectContaining({ referenced: 3, skippedUnreferenced: 2 }));
        expect(storage.objects.size).toBe(0);
        expect(await t.db.select().from(schema.computers)).toEqual([]);
    });

    test("refuses to import while conflicts need a decision", async () => {
        await expect(runImport(deps(), { zipPath, mode: "import", autoResolve: false, now: NOW })).rejects.toThrow(ImportBlockedError);
        expect(await t.db.select().from(schema.computers)).toEqual([]);
    });

    test("imports with resolutions, keeps IDs and timestamps, recomputes memberships and verifies counts", async () => {
        const report = await runImport(deps(), { zipPath, mode: "import", autoResolve: true, now: NOW });
        expect(report.verified).toBe(true);
        expect(report.files).toEqual(expect.objectContaining({ copied: 3, alreadyPresent: 0 }));

        const computers = await t.db.select().from(schema.computers).orderBy(schema.computers.id);
        expect(computers.map((c) => [c.id, c.jkt])).toEqual([["c1", "jkt-a"], ["c2", null]]);
        expect(computers[0]).toEqual(expect.objectContaining({ rustdeskId: 400043058, createdAt: new Date(NOW - 10 * DAY), searchText: "pc-1 " }));

        expect((await t.db.select().from(schema.refreshTokens)).map((r) => r.id).sort()).toEqual(["r1", "r3"]);
        const installs = await t.db.select().from(schema.computerAppsInstalls);
        expect(installs.map((i) => [i.id, i.reinstallRequestedAt?.getTime()])).toEqual([["i2", NOW - 1234]]);
        const assignments = await t.db.select().from(schema.computerGroupReleases);
        expect(assignments.map((a) => [a.id, a.assignType])).toEqual([["cgr2", "exclude"]]);
        expect((await t.db.select().from(schema.dynamicComputerGroups)).map((g) => g.id)).toEqual(["d1"]);
        expect((await t.db.select().from(schema.dynamicGroupMembers)).map((m) => m.computerId)).toEqual(["c1"]);
        const updates = await t.db.select().from(schema.clientUpdates).orderBy(schema.clientUpdates.id);
        expect(updates.map((u) => [u.id, u.isActive, u.versionSortKey])).toEqual([
            ["cu1", false, "1|000001:2|000001:3|000001:0|1|"],
            ["cu2", true, "1|000001:2|000001:3|000001:1|1|"],
        ]);
        expect((await t.db.select().from(schema.releases).where(eq(schema.releases.id, "rel1")))[0].versionSortKey)
            .toBe("1|000001:1|000001:2|000002:10|1|");

        const fileRows = await t.db.select().from(schema.files).orderBy(schema.files.id);
        expect(fileRows.map((f) => [f.id, f.sha256, f.originalName])).toEqual([
            ["f1", hexSha(files.f1), "setup.msi"],
            ["f3", hexSha(files.f3), "a.msi"],
            ["f4", hexSha(files.f4), null],
        ]);
        expect(storage.objects.get("files/f3")?.data.toString()).toBe(files.f3);

        const [user] = await t.db.select().from(schema.user);
        expect(user.id).toBe("u1");
        expect((await t.db.select().from(schema.account)).map((a) => [a.id, a.password])).toEqual([["acc1", "salt:hash"]]);
        expect(await t.db.select().from(schema.session)).toEqual([]);
    });

    test("never merges into a non-empty database", async () => {
        await runImport(deps(), { zipPath, mode: "import", autoResolve: true, now: NOW });
        await expect(runImport(deps(), { zipPath, mode: "import", autoResolve: true, now: NOW })).rejects.toThrow("not empty");
    });

    test("pre-copied files are not copied again at cutover", async () => {
        const precopy = await runImport(deps(), { zipPath, mode: "files-only", autoResolve: false, now: NOW });
        expect(precopy.files.copied).toBe(3);
        const report = await runImport(deps(), { zipPath, mode: "import", autoResolve: true, now: NOW });
        expect(report.files).toEqual(expect.objectContaining({ copied: 0, alreadyPresent: 3 }));
        expect(report.verified).toBe(true);
    });
});
