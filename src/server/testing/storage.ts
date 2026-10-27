import { Readable } from "node:stream";
import type { ListedObject, ObjectStorage } from "@/server/storage/s3";

type MemoryObject = { data: Buffer; contentType: string | undefined; lastModified: Date };

/** In-memory bucket for tests. */
export function createMemoryStorage(): ObjectStorage & { objects: Map<string, MemoryObject> } {
    const objects = new Map<string, MemoryObject>();
    return {
        objects,
        async put(key, body, contentType) {
            const chunks: Buffer[] = [];
            if (body instanceof Uint8Array) {
                chunks.push(Buffer.from(body));
            } else {
                for await (const chunk of body) chunks.push(Buffer.from(chunk));
            }
            objects.set(key, { data: Buffer.concat(chunks), contentType, lastModified: new Date() });
        },
        async get(key) {
            const object = objects.get(key);
            if (!object) return null;
            return { body: Readable.from([object.data]), contentLength: object.data.length, contentType: object.contentType };
        },
        async head(key) {
            const object = objects.get(key);
            return object ? { size: object.data.length } : null;
        },
        async delete(key) {
            objects.delete(key);
        },
        async *list(prefix): AsyncIterable<ListedObject> {
            for (const [key, object] of objects) {
                if (key.startsWith(prefix)) yield { key, lastModified: object.lastModified };
            }
        },
        async ensureBucket() {},
    };
}
