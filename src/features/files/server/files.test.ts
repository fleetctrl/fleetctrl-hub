import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vitest";
import { clientUpdates } from "@/features/client-updates/server/schema";
import { createTestDatabase, type TestDatabase } from "@/server/testing/db";
import { createMemoryStorage } from "@/server/testing/storage";
import { files } from "./schema";
import { collectGarbage, normalizeContentType, uploadFile } from "./service";

let t: TestDatabase;
let storage: ReturnType<typeof createMemoryStorage>;

beforeEach(async () => {
    t = await createTestDatabase();
    storage = createMemoryStorage();
});

afterEach(async () => {
    await t.close();
});

const upload = (content: string, name = "a.bin") =>
    uploadFile({ db: t.db, storage }, Readable.from([Buffer.from(content)]), { originalName: name, contentType: "application/octet-stream" });

test("uploads record size and a server-computed SHA-256", async () => {
    const file = await upload("hello");
    expect(file).toEqual(expect.objectContaining({
        size: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        objectKey: `files/${file.id}`,
    }));
    expect(storage.objects.get(file.objectKey)?.data.toString()).toBe("hello");
});

test("content types are sanitized and MSI installers are labeled for msiexec", () => {
    expect(normalizeContentType("application/octet-stream", "Setup.MSI")).toBe("application/x-msi");
    expect(normalizeContentType("text/plain, charset=ü", "a.ps1")).toBe("text/plain");
    expect(normalizeContentType(undefined, "a.exe")).toBe("application/octet-stream");
});

test("GC removes old unreferenced files and orphaned objects, and keeps referenced ones", async () => {
    const referenced = await upload("in use");
    const unreferenced = await upload("abandoned");
    const fresh = await upload("just uploaded");
    await t.db.insert(clientUpdates).values({
        version: "1.0.0", versionSortKey: "1", fileId: referenced.id, hash: referenced.sha256, byteSize: referenced.size,
    });
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await t.db.update(files).set({ createdAt: old }).where(eq(files.id, referenced.id));
    await t.db.update(files).set({ createdAt: old }).where(eq(files.id, unreferenced.id));
    for (const key of [referenced.objectKey, unreferenced.objectKey]) storage.objects.get(key)!.lastModified = old;
    await storage.put("files/orphan", Buffer.from("no row"), undefined);
    storage.objects.get("files/orphan")!.lastModified = old;
    await storage.put("files/orphan-new", Buffer.from("upload in flight"), undefined);

    const result = await t.db.transaction((tx) => collectGarbage(tx, storage));
    expect(result).toEqual({ deletedRows: 1, deletedObjects: 2 });
    expect((await t.db.select({ id: files.id }).from(files)).map((row) => row.id).sort()).toEqual([referenced.id, fresh.id].sort());
    expect([...storage.objects.keys()].sort()).toEqual([referenced.objectKey, fresh.objectKey, "files/orphan-new"].sort());
});
