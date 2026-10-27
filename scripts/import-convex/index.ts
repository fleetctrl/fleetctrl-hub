import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { z } from "zod";
import { createDatabase } from "@/server/db/client";
import { createS3Storage } from "@/server/storage/s3";
import { ImportBlockedError, runImport, type ImportMode, type ImportReport } from "./run";

const USAGE = `Usage: import-convex --zip <export.zip> [--dry-run | --files-only] [--auto-resolve] [--report <path>]

  --dry-run       Parse and audit the export, check the target, write the report; changes nothing.
  --files-only    Pre-copy files to the bucket while v2 is still running (files are immutable).
  --auto-resolve  Apply the default resolution to conflicts that otherwise need a decision.
  --report        Where to write the JSON report (default: next to the zip).

Environment: DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, [S3_REGION], [MIGRATIONS_DIR]`;

const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("fleetctrl-files"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    MIGRATIONS_DIR: z.string().optional(),
});

function summarize(report: ImportReport) {
    const lines = [`Convex import (${report.mode}) of ${report.zip}`, ""];
    lines.push("Table                      source  imported  dropped");
    for (const [table, counts] of Object.entries(report.tables)) {
        lines.push(`${table.padEnd(26)} ${String(counts.source).padStart(6)}  ${String(counts.imported).padStart(8)}  ${String(counts.dropped).padStart(7)}`);
    }
    lines.push("", `Not imported: ${Object.entries(report.skipped).map(([table, total]) => `${table} ${total}`).join(", ")}`);
    lines.push(`Files: ${report.files.referenced} referenced (${(report.files.bytes / 1024 / 1024).toFixed(1)} MiB), ${report.files.copied} copied, ${report.files.alreadyPresent} already present, ${report.files.skippedUnreferenced} unreferenced skipped`);
    if (report.mode !== "files-only") {
        lines.push(`Target: migrations ${report.preflight.migrationsApplied ? "applied" : "MISSING"}, ${report.preflight.targetEmpty ? "empty" : `NOT EMPTY (${report.preflight.nonEmptyTables.join(", ")})`}`);
    }
    if (report.dropped.length > 0) {
        const byReason = new Map<string, number>();
        for (const doc of report.dropped) {
            const key = `${doc.table}: ${doc.reason}`;
            byReason.set(key, (byReason.get(key) ?? 0) + 1);
        }
        lines.push("", `Dropped documents (${report.dropped.length}; every ID is in the report):`);
        const groups = [...byReason].sort((x, y) => y[1] - x[1]);
        for (const [reason, total] of groups.slice(0, 30)) lines.push(`  ${String(total).padStart(5)} × ${reason}`);
        if (groups.length > 30) lines.push(`  ... ${groups.length - 30} more reasons in the report`);
    }
    for (const [title, items] of [["Resolved automatically", report.resolutions], ["NEEDS A DECISION", report.blocking]] as const) {
        if (items.length === 0) continue;
        lines.push("", `${title} (${items.length}):`);
        for (const item of items) lines.push(`  ${item.kind} "${item.key}": keep ${item.kept || "-"}, ${item.action}: ${item.affected.join(", ")}`);
    }
    if (report.membershipRefresh) lines.push("", `Dynamic memberships recomputed: ${report.membershipRefresh.added} across ${report.membershipRefresh.groups} groups`);
    if (report.verified !== undefined) lines.push(`Verification: ${report.verified ? "counts and bytes match" : "MISMATCH"}`);
    return lines.join("\n");
}

async function main() {
    const { values } = parseArgs({
        options: {
            zip: { type: "string" },
            "dry-run": { type: "boolean", default: false },
            "files-only": { type: "boolean", default: false },
            "auto-resolve": { type: "boolean", default: false },
            report: { type: "string" },
            help: { type: "boolean", default: false },
        },
    });
    if (values.help || !values.zip) {
        console.log(USAGE);
        process.exit(values.help ? 0 : 1);
    }
    const mode: ImportMode = values["files-only"] ? "files-only" : values["dry-run"] ? "dry-run" : "import";
    const env = envSchema.parse(process.env);
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
    const storage = createS3Storage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    });
    const zipPath = path.resolve(values.zip);
    const reportPath = values.report ?? `${zipPath.replace(/\.zip$/i, "")}.import-report.json`;
    try {
        const report = await runImport(
            { db: createDatabase(pool), storage, migrationsFolder: env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle") },
            { zipPath, mode, autoResolve: values["auto-resolve"] },
        );
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
        console.log(summarize(report));
        console.log(`\nReport: ${reportPath}`);
        if (report.verified === false) process.exit(1);
        if (mode === "dry-run" && (report.blocking.length > 0 || !report.preflight.targetEmpty)) process.exit(2);
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof ImportBlockedError ? 2 : 1);
});
