import { createHash } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { eq, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { PG_FOREIGN_KEY_VIOLATION, PG_RESTRICT_VIOLATION, pgErrorCode } from "@/server/db/errors";
import { uuidv7 } from "@/server/db/id";
import { DomainError } from "@/server/http/errors";
import type { ObjectStorage } from "@/server/storage/s3";
import { files, type FileRow } from "./schema";

const GC_GRACE_MS = 24 * 60 * 60 * 1000;

export function objectKeyFor(fileId: string) {
    return `files/${fileId}`;
}

/**
 * Normalizes a browser-supplied content type. OS defaults can contain commas or non-ASCII
 * characters, and browsers label MSI installers as generic binary data; existing clients
 * need `application/x-msi` to launch them with msiexec.
 */
export function normalizeContentType(contentType: string | undefined, fileName: string): string {
    if (fileName.toLowerCase().endsWith(".msi")) return "application/x-msi";
    const sanitized = contentType ? contentType.split(",")[0].replace(/[^\x20-\x7E]/g, "").trim() : "";
    return sanitized || "application/octet-stream";
}

/** Streams an upload into the bucket, hashing it on the way, then records the `files` row. */
export async function uploadFile(
    deps: { db: Database; storage: ObjectStorage },
    body: Readable,
    meta: { originalName: string; contentType: string },
): Promise<FileRow> {
    const id = uuidv7();
    const objectKey = objectKeyFor(id);
    const hash = createHash("sha256");
    let size = 0;
    const counter = new PassThrough();
    counter.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        size += chunk.length;
    });
    body.on("error", (error) => counter.destroy(error));
    body.pipe(counter);

    await deps.storage.put(objectKey, counter, meta.contentType);

    const [row] = await deps.db
        .insert(files)
        .values({
            id,
            objectKey,
            size,
            sha256: hash.digest("hex"),
            contentType: meta.contentType,
            originalName: meta.originalName,
        })
        .returning();
    return row;
}

/** Loads a file a feature row is about to reference; the FK would reject a missing one anyway. */
export async function assertExists(tx: Database, fileId: string): Promise<FileRow> {
    const [row] = await tx.select().from(files).where(eq(files.id, fileId));
    if (!row) throw new DomainError("Uploaded file not found");
    return row;
}

/**
 * Response streaming a file's content (replaces the 307 redirect to Convex storage, see §8 of
 * the migration plan: the client sends Authorization + DPoP on redirects, which S3 rejects).
 * Returns null when the file or its object is missing.
 */
export async function streamFile(
    deps: { db: Database; storage: ObjectStorage },
    fileId: string,
): Promise<Response | null> {
    const [row] = await deps.db.select().from(files).where(eq(files.id, fileId));
    if (!row) return null;
    const object = await deps.storage.get(row.objectKey);
    if (!object) return null;
    const headers = new Headers({
        "Content-Type": row.contentType ?? object.contentType ?? "application/octet-stream",
    });
    const length = object.contentLength ?? row.size;
    if (length !== undefined) headers.set("Content-Length", String(length));
    // SAFETY: Readable.toWeb returns a web ReadableStream of Uint8Array chunks, which Response accepts.
    return new Response(Readable.toWeb(object.body) as ReadableStream<Uint8Array>, { status: 200, headers });
}

/**
 * Daily GC. `files` never needs to know who references a row: every referencing FK is
 * `on delete restrict`, so deleting a referenced file fails and is skipped.
 *  1. Delete unreferenced rows older than 24 h (each attempt in its own savepoint).
 *  2. Delete objects older than 24 h that have no row (abandoned uploads, rows removed in step 1).
 */
export async function collectGarbage(tx: Database, storage: ObjectStorage, now = new Date()) {
    const cutoff = new Date(now.getTime() - GC_GRACE_MS);
    const candidates = await tx.select({ id: files.id }).from(files).where(lt(files.createdAt, cutoff));
    let deletedRows = 0;
    for (const candidate of candidates) {
        try {
            await tx.transaction(async (savepoint) => {
                await savepoint.delete(files).where(eq(files.id, candidate.id));
            });
            deletedRows++;
        } catch (error) {
            const code = pgErrorCode(error);
            if (code !== PG_RESTRICT_VIOLATION && code !== PG_FOREIGN_KEY_VIOLATION) throw error;
        }
    }

    const knownKeys = new Set((await tx.select({ objectKey: files.objectKey }).from(files)).map((row) => row.objectKey));
    let deletedObjects = 0;
    for await (const object of storage.list("files/")) {
        if (knownKeys.has(object.key)) continue;
        if (object.lastModified && object.lastModified > cutoff) continue;
        await storage.delete(object.key);
        deletedObjects++;
    }
    return { deletedRows, deletedObjects };
}
