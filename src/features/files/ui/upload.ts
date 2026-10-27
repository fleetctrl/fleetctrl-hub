"use client";

import { hc } from "hono/client";
import { call } from "@/lib/api/call";
import { FILE_NAME_HEADER } from "../contract";
import type { FilesAdminRoutes } from "../server/admin.routes";

const client = hc<FilesAdminRoutes>("/api/admin/files");

/** A file stored by the API; `storageId` is the file ID that app and client-update mutations reference. */
export interface StoredFile {
    storageId: string;
    name: string;
    size: number;
    type: string;
    hash: string;
}

/**
 * Streams a file to `PUT /api/admin/files`. The server computes the SHA-256 and normalizes the
 * content type (MSI installers become `application/x-msi`), so the browser no longer hashes it.
 */
export async function uploadFile(file: File): Promise<StoredFile> {
    const uploaded = await call(client.index.$put(undefined, {
        headers: {
            "Content-Type": file.type || "application/octet-stream",
            [FILE_NAME_HEADER]: encodeURIComponent(file.name),
        },
        init: { body: file },
    }));
    return {
        storageId: uploaded.fileId,
        name: uploaded.name,
        size: uploaded.size,
        type: uploaded.contentType,
        hash: uploaded.sha256,
    };
}
