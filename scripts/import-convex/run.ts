import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { count, sql, sum } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { refreshAllDynamicGroups } from "@/features/groups/server";
import type { Database } from "@/server/db/client";
import { queryRows } from "@/server/db/raw";
import * as schema from "@/server/db/schema";
import type { ObjectStorage } from "@/server/storage/s3";
import { CONVEX_TABLES, type ConvexTable } from "./convex-docs";
import { planImport, type DroppedDocument, type ImportPlan, type ImportRows, type Resolution, type Snapshot } from "./plan";
import { ConvexExport, type InvalidDocument } from "./zip";

const BATCH_SIZE = 1000;

/** Insert order: parents before children. */
const TABLES: { key: keyof ImportRows; table: PgTable; source: ConvexTable[] }[] = [
    { key: "files", table: schema.files, source: ["_storage"] },
    { key: "user", table: schema.user, source: ["user"] },
    { key: "account", table: schema.account, source: ["account"] },
    { key: "computers", table: schema.computers, source: ["computers"] },
    { key: "enrollmentTokens", table: schema.enrollmentTokens, source: ["enrollment_tokens"] },
    { key: "refreshTokens", table: schema.refreshTokens, source: ["refresh_tokens"] },
    { key: "tasks", table: schema.tasks, source: ["tasks"] },
    { key: "computerGroups", table: schema.computerGroups, source: ["computer_groups"] },
    { key: "computerGroupMembers", table: schema.computerGroupMembers, source: ["computer_group_members"] },
    { key: "dynamicComputerGroups", table: schema.dynamicComputerGroups, source: ["dynamic_computer_groups"] },
    { key: "apps", table: schema.apps, source: ["apps"] },
    { key: "releases", table: schema.releases, source: ["releases"] },
    { key: "win32Releases", table: schema.win32Releases, source: ["win32_releases"] },
    { key: "wingetReleases", table: schema.wingetReleases, source: ["winget_releases"] },
    { key: "detectionRules", table: schema.detectionRules, source: ["detection_rules"] },
    { key: "releaseRequirements", table: schema.releaseRequirements, source: ["release_requirements"] },
    { key: "releaseScripts", table: schema.releaseScripts, source: ["release_scripts"] },
    { key: "computerGroupReleases", table: schema.computerGroupReleases, source: ["computer_group_releases"] },
    { key: "dynamicGroupReleases", table: schema.dynamicGroupReleases, source: ["dynamic_group_releases"] },
    { key: "computerAppsInstalls", table: schema.computerAppsInstalls, source: ["computer_apps_installs"] },
    { key: "clientUpdates", table: schema.clientUpdates, source: ["client_updates"] },
];

/** Tables that are deliberately not imported (plan §10). */
const SKIPPED_TABLES = {
    session: "_components/betterAuth/session/documents.jsonl",
    verification: "_components/betterAuth/verification/documents.jsonl",
    jwks: "_components/betterAuth/jwks/documents.jsonl",
    dynamic_group_members: "dynamic_group_members/documents.jsonl",
};

export type ImportMode = "dry-run" | "files-only" | "import";

export type ImportReport = {
    zip: string;
    mode: ImportMode;
    startedAt: string;
    finishedAt?: string;
    preflight: { migrationsApplied: boolean; targetEmpty: boolean; nonEmptyTables: string[] };
    tables: { [table: string]: { source: number; imported: number; dropped: number } };
    skipped: { [table: string]: number };
    files: { referenced: number; bytes: number; copied: number; alreadyPresent: number; skippedUnreferenced: number };
    dropped: DroppedDocument[];
    resolutions: Resolution[];
    blocking: Resolution[];
    membershipRefresh?: { groups: number; added: number; removed: number };
    verified?: boolean;
};

export class ImportBlockedError extends Error {}

async function preflight(db: Database, migrationsFolder: string) {
    const journal = JSON.parse(await readFile(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
    let applied = 0;
    try {
        const [row] = await queryRows<{ applied: number }>(db, sql`select count(*)::int as applied from drizzle.__drizzle_migrations`);
        applied = row?.applied ?? 0;
    } catch {
        applied = 0;
    }
    const migrationsApplied = applied === journal.entries.length;
    const nonEmptyTables: string[] = [];
    if (migrationsApplied) {
        for (const { key, table } of TABLES) {
            const rows = await db.select({ one: sql`1` }).from(table).limit(1);
            if (rows.length > 0) nonEmptyTables.push(key);
        }
    }
    return { migrationsApplied, targetEmpty: migrationsApplied && nonEmptyTables.length === 0, nonEmptyTables };
}

async function copyFiles(exported: ConvexExport, storage: ObjectStorage, plan: ImportPlan, report: ImportReport) {
    await storage.ensureBucket();
    for (const file of plan.rows.files) {
        // Files are immutable: an object that is already there with the right size was pre-copied.
        const existing = await storage.head(file.objectKey);
        if (existing?.size === file.size) {
            report.files.alreadyPresent++;
            continue;
        }
        const hash = createHash("sha256");
        let size = 0;
        const counter = new PassThrough();
        counter.on("data", (chunk: Buffer) => {
            hash.update(chunk);
            size += chunk.length;
        });
        const source = await exported.openFile(file.id ?? "");
        source.on("error", (error) => counter.destroy(error));
        source.pipe(counter);
        await storage.put(file.objectKey, counter, file.contentType ?? undefined);
        const sha256 = hash.digest("hex");
        if (size !== file.size || sha256 !== file.sha256) {
            throw new Error(`File ${file.id} does not match its _storage metadata (size ${size}/${file.size}, sha256 ${sha256}/${file.sha256})`);
        }
        report.files.copied++;
    }
}

async function insertRows(tx: Database, plan: ImportPlan) {
    for (const { key, table } of TABLES) {
        const rows = plan.rows[key];
        for (let index = 0; index < rows.length; index += BATCH_SIZE) {
            await tx.insert(table).values(rows.slice(index, index + BATCH_SIZE));
        }
    }
}

async function verifyCounts(db: Database, plan: ImportPlan, report: ImportReport) {
    let verified = true;
    for (const { key, table } of TABLES) {
        const [row] = await db.select({ value: count() }).from(table);
        if (row.value !== plan.rows[key].length) {
            verified = false;
            console.error(`Count mismatch for ${key}: expected ${plan.rows[key].length}, found ${row.value}`);
        }
    }
    const [bytes] = await db.select({ value: sum(schema.files.size) }).from(schema.files);
    if (Number(bytes.value ?? 0) !== report.files.bytes) {
        verified = false;
        console.error(`File bytes mismatch: expected ${report.files.bytes}, found ${bytes.value}`);
    }
    return verified;
}

/**
 * The importer (plan §10): the one tool allowed to write every feature's tables. Convex data is
 * only read; re-running means dropping the database and starting again (it never merges).
 */
export async function runImport(
    deps: { db: Database; storage: ObjectStorage; migrationsFolder: string },
    options: { zipPath: string; mode: ImportMode; autoResolve: boolean; now?: number },
): Promise<ImportReport> {
    const exported = await ConvexExport.open(options.zipPath);
    try {
        const startedAt = new Date().toISOString();
        const invalid: InvalidDocument[] = [];
        const snapshot = Object.fromEntries(await Promise.all(CONVEX_TABLES.map(async (table) => {
            const result = await exported.readTable(table);
            invalid.push(...result.invalid);
            return [table, result.docs] as const;
        }))) as Snapshot;

        const plan = planImport(snapshot, {
            now: options.now ?? Date.now(),
            autoResolve: options.autoResolve,
            hasFile: (storageId) => exported.hasFile(storageId),
            invalid,
        });

        const droppedBy = (tables: ConvexTable[]) => plan.dropped.filter((doc) => tables.includes(doc.table as ConvexTable)).length;
        const report: ImportReport = {
            zip: options.zipPath,
            mode: options.mode,
            startedAt,
            preflight: { migrationsApplied: false, targetEmpty: false, nonEmptyTables: [] },
            tables: Object.fromEntries(TABLES.map(({ key, source }) => [key, {
                source: source.reduce((total, table) => total + snapshot[table].length + invalid.filter((doc) => doc.table === table).length, 0),
                imported: plan.rows[key].length,
                dropped: key === "files" ? 0 : droppedBy(source),
            }])),
            skipped: Object.fromEntries(await Promise.all(Object.entries(SKIPPED_TABLES).map(async ([table, file]) =>
                [table, await exported.countDocuments(file)] as const))),
            files: {
                referenced: plan.rows.files.length,
                bytes: plan.rows.files.reduce((total, file) => total + file.size, 0),
                copied: 0,
                alreadyPresent: 0,
                skippedUnreferenced: plan.skippedUnreferencedFiles,
            },
            dropped: plan.dropped,
            resolutions: plan.resolutions,
            blocking: plan.blocking,
        };

        if (options.mode === "files-only") {
            await copyFiles(exported, deps.storage, plan, report);
            return { ...report, finishedAt: new Date().toISOString() };
        }

        report.preflight = await preflight(deps.db, deps.migrationsFolder);
        if (options.mode === "dry-run") {
            return { ...report, finishedAt: new Date().toISOString() };
        }

        if (!report.preflight.migrationsApplied) throw new Error("Migrations are not applied to the target database (run db-migrate first)");
        if (!report.preflight.targetEmpty) {
            throw new Error(`The target database is not empty (${report.preflight.nonEmptyTables.join(", ")}); the importer never merges`);
        }
        if (plan.blocking.length > 0 && !options.autoResolve) {
            throw new ImportBlockedError(`${plan.blocking.length} conflicts need a decision; review the dry-run report or pass --auto-resolve`);
        }

        await copyFiles(exported, deps.storage, plan, report);
        report.membershipRefresh = await deps.db.transaction(async (tx) => {
            await insertRows(tx, plan);
            // Dynamic membership is not imported; the groups feature recomputes it (authoritative).
            return refreshAllDynamicGroups(tx);
        });
        report.verified = await verifyCounts(deps.db, plan, report);
        return { ...report, finishedAt: new Date().toISOString() };
    } finally {
        exported.close();
    }
}
