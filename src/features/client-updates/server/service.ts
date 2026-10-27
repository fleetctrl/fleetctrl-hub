import { and, asc, eq, ne } from "drizzle-orm";
import { assertExists } from "@/features/files/server";
import type { Database } from "@/server/db/client";
import { DomainError } from "@/server/http/errors";
import { paginate } from "@/server/pagination";
import { versionSortKey } from "@/server/version-sort-key";
import { clientUpdates, type ClientUpdateRow } from "./schema";

/** Convex document shape the dashboard was built against (`_id`, `_creationTime`, snake_case). */
export function toClientUpdateDoc(row: ClientUpdateRow) {
    return {
        _id: row.id,
        _creationTime: row.createdAt.getTime(),
        version: row.version,
        storage_id: row.fileId,
        hash: row.hash,
        byte_size: row.byteSize,
        file_name: row.fileName ?? undefined,
        mime_type: row.mimeType ?? undefined,
        is_active: row.isActive,
        notes: row.notes ?? undefined,
        version_sort_key: row.versionSortKey,
    };
}

async function findActive(db: Database) {
    const [row] = await db.select().from(clientUpdates).where(eq(clientUpdates.isActive, true)).limit(1);
    return row ?? null;
}

/**
 * The version advertised to devices. Existing clients choose msiexec when the download ID ends in
 * `.msi`, so MSI packages are advertised with that suffix (the download route strips it again).
 */
export async function getActiveVersion(db: Database) {
    const active = await findActive(db);
    if (!active) return null;
    const isMsi = active.fileName?.trim().toLowerCase().endsWith(".msi")
        || active.mimeType?.toLowerCase().includes("msi");
    return {
        id: isMsi ? `${active.id}.msi` : active.id,
        version: active.version,
        hash: active.hash,
    };
}

export async function getVersionForDownload(db: Database, versionId: string) {
    // Accept the alias advertised to MSI clients as well as the plain ID.
    const id = versionId.replace(/\.msi$/i, "");
    const [row] = await db.select().from(clientUpdates).where(eq(clientUpdates.id, id));
    return row ?? null;
}

export async function listClientUpdates(db: Database) {
    return db.select().from(clientUpdates).orderBy(asc(clientUpdates.createdAt), asc(clientUpdates.id));
}

export async function listClientUpdatesPaginated(db: Database, args: { cursor?: string; numItems: number }) {
    return paginate({
        ...args,
        desc: true,
        sortKey: clientUpdates.versionSortKey,
        idKey: clientUpdates.id,
        sortValue: (row: ClientUpdateRow) => row.versionSortKey,
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) => db.select().from(clientUpdates).where(where).orderBy(...orderBy).limit(limit),
    });
}

export async function getActiveClientUpdate(db: Database) {
    return findActive(db);
}

/** New versions start inactive. Hash and size come from the uploaded file, not from the browser. */
export async function createClientUpdate(
    db: Database,
    args: { version: string; storageId: string; file_name?: string; mime_type?: string; notes?: string },
) {
    return db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: clientUpdates.id }).from(clientUpdates).where(eq(clientUpdates.version, args.version)).limit(1);
        if (existing) {
            throw new DomainError(`Version ${args.version} already exists`);
        }
        const file = await assertExists(tx, args.storageId);
        const [row] = await tx
            .insert(clientUpdates)
            .values({
                version: args.version,
                versionSortKey: versionSortKey(args.version),
                fileId: file.id,
                hash: file.sha256,
                byteSize: file.size,
                fileName: args.file_name ?? file.originalName,
                mimeType: args.mime_type ?? file.contentType,
                notes: args.notes,
                isActive: false,
            })
            .returning({ id: clientUpdates.id });
        return row.id;
    });
}

/** Unsets the previous active version and sets this one in one transaction (unique index as backstop). */
export async function setActiveClientUpdate(db: Database, id: string) {
    await db.transaction(async (tx) => {
        const [update] = await tx.select({ id: clientUpdates.id }).from(clientUpdates).where(eq(clientUpdates.id, id)).for("update");
        if (!update) throw new DomainError("Update not found");
        await tx
            .update(clientUpdates)
            .set({ isActive: false })
            .where(and(eq(clientUpdates.isActive, true), ne(clientUpdates.id, id)));
        await tx.update(clientUpdates).set({ isActive: true }).where(eq(clientUpdates.id, id));
    });
    return null;
}

export async function deactivateClientUpdate(db: Database, id: string) {
    await db.update(clientUpdates).set({ isActive: false }).where(eq(clientUpdates.id, id));
    return null;
}

/** The binary is removed by the files GC once nothing references it. */
export async function removeClientUpdate(db: Database, id: string) {
    const deleted = await db.delete(clientUpdates).where(eq(clientUpdates.id, id)).returning({ id: clientUpdates.id });
    if (deleted.length === 0) throw new DomainError("Update not found");
    return null;
}
