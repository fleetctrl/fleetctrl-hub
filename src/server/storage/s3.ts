import { Readable } from "node:stream";
import {
    CreateBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    NotFound,
    ListObjectsV2Command,
    NoSuchKey,
    S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export type StoredObject = {
    body: Readable;
    contentLength: number | undefined;
    contentType: string | undefined;
};

export type ListedObject = { key: string; lastModified: Date | undefined };

/** The only access path to the bucket; feature code goes through the `files` feature instead. */
export interface ObjectStorage {
    put(key: string, body: Readable | Uint8Array, contentType: string | undefined): Promise<void>;
    get(key: string): Promise<StoredObject | null>;
    head(key: string): Promise<{ size: number | undefined } | null>;
    delete(key: string): Promise<void>;
    list(prefix: string): AsyncIterable<ListedObject>;
    ensureBucket(): Promise<void>;
}

export type S3Config = {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
};

export function createS3Storage(config: S3Config): ObjectStorage {
    const client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        forcePathStyle: true,
        // RustFS rejects the default CRC checksums the SDK adds (same reason the compose file sets these for aws-cli).
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
    const Bucket = config.bucket;

    return {
        async put(key, body, contentType) {
            // lib-storage streams bodies of unknown length as a multipart upload.
            await new Upload({
                client,
                params: { Bucket, Key: key, Body: body, ContentType: contentType },
                queueSize: 4,
                partSize: 8 * 1024 * 1024,
            }).done();
        },
        async get(key) {
            try {
                const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
                if (!result.Body) return null;
                // SAFETY: in Node the SDK returns the body as an http.IncomingMessage, which is a Readable.
                const body = result.Body as Readable;
                return { body, contentLength: result.ContentLength, contentType: result.ContentType };
            } catch (error) {
                if (error instanceof NoSuchKey) return null;
                throw error;
            }
        },
        async head(key) {
            try {
                const result = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
                return { size: result.ContentLength };
            } catch (error) {
                if (error instanceof NotFound || error instanceof NoSuchKey) return null;
                throw error;
            }
        },
        async delete(key) {
            await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
        },
        async *list(prefix) {
            let ContinuationToken: string | undefined;
            do {
                const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
                for (const object of page.Contents ?? []) {
                    if (object.Key) yield { key: object.Key, lastModified: object.LastModified };
                }
                ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
            } while (ContinuationToken);
        },
        async ensureBucket() {
            try {
                await client.send(new HeadBucketCommand({ Bucket }));
            } catch {
                await client.send(new CreateBucketCommand({ Bucket }));
            }
        },
    };
}
