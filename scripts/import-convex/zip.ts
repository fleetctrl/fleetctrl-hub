import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import yauzl from "yauzl";
import { convexDocSchemas, documentsPath, type ConvexDoc, type ConvexTable } from "./convex-docs";

export type InvalidDocument = { table: ConvexTable; line: number; error: string };

/**
 * Random-access reader for a Convex export zip (yauzl), so multi-GB exports with file storage are
 * never loaded into memory: table documents are read line by line, files are streamed.
 */
export class ConvexExport {
    private constructor(
        private readonly zip: yauzl.ZipFile,
        private readonly entries: Map<string, yauzl.Entry>,
    ) {}

    static async open(path: string): Promise<ConvexExport> {
        const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
            yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, file) => (error ? reject(error) : resolve(file))));
        const entries = new Map<string, yauzl.Entry>();
        await new Promise<void>((resolve, reject) => {
            zip.on("entry", (entry: yauzl.Entry) => {
                entries.set(entry.fileName, entry);
                zip.readEntry();
            });
            zip.on("end", () => resolve());
            zip.on("error", reject);
            zip.readEntry();
        });
        return new ConvexExport(zip, entries);
    }

    private stream(entry: yauzl.Entry): Promise<Readable> {
        return new Promise((resolve, reject) =>
            this.zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream))));
    }

    /** Parsed documents of a table (empty when the export has no such table); invalid lines are returned separately. */
    async readTable<Table extends ConvexTable>(table: Table): Promise<{ docs: ConvexDoc<Table>[]; invalid: InvalidDocument[] }> {
        const entry = this.entries.get(documentsPath(table));
        if (!entry) return { docs: [], invalid: [] };
        const schema = convexDocSchemas[table];
        const docs: ConvexDoc<Table>[] = [];
        const invalid: InvalidDocument[] = [];
        let line = 0;
        for await (const text of createInterface({ input: await this.stream(entry), crlfDelay: Infinity })) {
            line++;
            if (!text.trim()) continue;
            try {
                const parsed = schema.safeParse(JSON.parse(text));
                if (parsed.success) {
                    // SAFETY: parsed with this table's own schema.
                    docs.push(parsed.data as ConvexDoc<Table>);
                } else {
                    invalid.push({ table, line, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
                }
            } catch (error) {
                invalid.push({ table, line, error: error instanceof Error ? error.message : String(error) });
            }
        }
        return { docs, invalid };
    }

    /** Number of documents in a table, without parsing them (for tables that are skipped). */
    async countDocuments(path: string): Promise<number> {
        const entry = this.entries.get(path);
        if (!entry) return 0;
        let count = 0;
        for await (const text of createInterface({ input: await this.stream(entry), crlfDelay: Infinity })) {
            if (text.trim()) count++;
        }
        return count;
    }

    /** Zip entry holding a stored file (`_storage/<id>`, sometimes with an extension). */
    private storageEntry(storageId: string): yauzl.Entry | undefined {
        const exact = this.entries.get(`_storage/${storageId}`);
        if (exact) return exact;
        for (const [name, entry] of this.entries) {
            if (name.startsWith(`_storage/${storageId}.`)) return entry;
        }
        return undefined;
    }

    hasFile(storageId: string): boolean {
        return this.storageEntry(storageId) !== undefined;
    }

    async openFile(storageId: string): Promise<Readable> {
        const entry = this.storageEntry(storageId);
        if (!entry) throw new Error(`File ${storageId} is not in the export`);
        return this.stream(entry);
    }

    close() {
        this.zip.close();
    }
}
