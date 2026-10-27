import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Hono } from "hono";
import type { AppDeps } from "@/server/deps";
import { DomainError } from "@/server/http/errors";
import { FILE_NAME_HEADER, type UploadedFile } from "../contract";
import { normalizeContentType, uploadFile } from "./service";

function decodeFileName(header: string | undefined): string {
    if (!header) return "file";
    try {
        return decodeURIComponent(header) || "file";
    } catch {
        return header;
    }
}

export function filesAdminRoutes(deps: AppDeps) {
    return new Hono().put("/", async (c) => {
        const body = c.req.raw.body;
        if (!body) throw new DomainError("Missing file content");
        const name = decodeFileName(c.req.header(FILE_NAME_HEADER));
        const contentType = normalizeContentType(c.req.header("Content-Type"), name);
        // SAFETY: the request body is a WHATWG stream; the DOM and node:stream/web typings describe the same object.
        const stream = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
        const file = await uploadFile(deps, stream, { originalName: name, contentType });
        const response: UploadedFile = { fileId: file.id, sha256: file.sha256, size: file.size, contentType, name };
        return c.json(response, 201);
    });
}

export type FilesAdminRoutes = ReturnType<typeof filesAdminRoutes>;
