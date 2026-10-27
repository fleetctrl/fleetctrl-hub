import { eq } from "drizzle-orm";
import { assertExists } from "@/features/files/server";
import type { Database } from "@/server/db/client";
import { DomainError } from "@/server/http/errors";
import type { ReleaseInput, StoredFileInput } from "../contract";
import {
    computerGroupReleases,
    detectionRules,
    dynamicGroupReleases,
    releaseRequirements,
    releaseScripts,
    win32Releases,
    wingetReleases,
} from "./schema";

const DEFAULT_TIMEOUT_SECONDS = 60;

type ChildInput = Omit<ReleaseInput, "type" | "disabled" | "version" | "uninstall_previous">;

type ExistingChildren = {
    win32?: typeof win32Releases.$inferSelect;
    winget?: typeof wingetReleases.$inferSelect;
    requirements: (typeof releaseRequirements.$inferSelect)[];
    scripts: (typeof releaseScripts.$inferSelect)[];
};

type FileMetadata = { name: string; hash: string; size: number | null };

/**
 * Name, hash and size for a referenced upload. Hash and size come from the `files` row (computed by
 * the server while uploading) instead of the browser. When the release already used this file, its
 * stored metadata is kept: the release form re-sends unchanged files with placeholder names.
 */
async function fileMetadata(tx: Database, input: StoredFileInput, previous?: FileMetadata & { fileId: string | null }) {
    if (previous && previous.fileId === input.storageId) {
        return { fileId: input.storageId, name: previous.name, hash: previous.hash, size: previous.size };
    }
    const file = await assertExists(tx, input.storageId);
    return { fileId: file.id, name: input.name, hash: file.sha256, size: file.size };
}

function detectionConfig(detection: ChildInput["detections"][number]) {
    const isFile = detection.type === "file";
    return {
        version: "1",
        operator: isFile ? detection.fileType : detection.registryType,
        path: isFile ? detection.path : detection.registryKey,
        value: isFile ? detection.fileTypeValue : detection.registryTypeValue,
    };
}

/** Writes the per-type row, requirement, detections, scripts and group assignments of a release. */
export async function writeReleaseChildren(
    tx: Database,
    releaseId: string,
    type: ReleaseInput["type"],
    input: ChildInput,
    existing: ExistingChildren = { requirements: [], scripts: [] },
) {
    if (type === "win32") {
        const old = existing.win32;
        if (!input.installBinary && !old) throw new DomainError("Install binary required for win32");
        const binary = input.installBinary
            ? await fileMetadata(tx, input.installBinary, old && {
                fileId: old.installBinaryFileId,
                name: old.installerName,
                hash: old.hash,
                size: old.installBinarySize,
            })
            : old && { fileId: old.installBinaryFileId, name: old.installerName, hash: old.hash, size: old.installBinarySize };
        if (!binary) throw new DomainError("Install binary required for win32");
        await tx.insert(win32Releases).values({
            releaseId,
            installerName: binary.name,
            installBinaryFileId: binary.fileId,
            hash: binary.hash,
            installScript: input.installScript !== undefined ? input.installScript : (old?.installScript || ""),
            uninstallScript: input.uninstallScript !== undefined ? input.uninstallScript : (old?.uninstallScript || ""),
            installBinarySize: binary.size,
        });
    } else {
        const wingetId = input.wingetId || existing.winget?.wingetId;
        if (!wingetId) throw new DomainError("Winget ID required");
        await tx.insert(wingetReleases).values({ releaseId, wingetId });
    }

    const requirement = input.requirements;
    if (requirement?.requirementScriptBinary) {
        const old = existing.requirements.find((row) => row.fileId === requirement.requirementScriptBinary?.storageId);
        const file = await fileMetadata(tx, requirement.requirementScriptBinary, old && {
            fileId: old.fileId,
            name: old.scriptName,
            hash: old.hash,
            size: old.byteSize,
        });
        await tx.insert(releaseRequirements).values({
            releaseId,
            scriptName: file.name,
            timeoutSeconds: requirement.timeout || DEFAULT_TIMEOUT_SECONDS,
            runAsSystem: requirement.runAsSystem || false,
            fileId: file.fileId,
            hash: file.hash,
            byteSize: file.size,
        });
    }

    for (const detection of input.detections) {
        await tx.insert(detectionRules).values({ releaseId, type: detection.type, config: detectionConfig(detection) });
    }

    for (const [phase, script] of [["pre", input.preScript], ["post", input.postScript]] as const) {
        if (!script?.scriptBinary) continue;
        const old = existing.scripts.find((row) => row.phase === phase && row.fileId === script.scriptBinary?.storageId);
        const file = await fileMetadata(tx, script.scriptBinary, old && {
            fileId: old.fileId,
            name: old.scriptName,
            hash: old.hash,
            size: old.byteSize,
        });
        await tx.insert(releaseScripts).values({
            releaseId,
            phase,
            engine: script.engine || "powershell",
            timeoutSeconds: script.timeout || DEFAULT_TIMEOUT_SECONDS,
            runAsSystem: script.runAsSystem || false,
            scriptName: file.name,
            fileId: file.fileId,
            hash: file.hash,
            byteSize: file.size,
        });
    }

    for (const [groups, action] of [
        [input.assignments.installGroups, "install"],
        [input.assignments.uninstallGroups, "uninstall"],
    ] as const) {
        for (const group of groups) {
            const values = { releaseId, groupId: group.groupId, assignType: group.mode, action };
            if (group.groupType === "static") {
                await tx.insert(computerGroupReleases).values(values);
            } else {
                await tx.insert(dynamicGroupReleases).values(values);
            }
        }
    }
}

/** Deletes and returns a release's children so they can be recreated (simplified update strategy, as in v2). */
export async function takeReleaseChildren(tx: Database, releaseId: string): Promise<ExistingChildren> {
    const [win32] = await tx.delete(win32Releases).where(eq(win32Releases.releaseId, releaseId)).returning();
    const [winget] = await tx.delete(wingetReleases).where(eq(wingetReleases.releaseId, releaseId)).returning();
    const requirements = await tx.delete(releaseRequirements).where(eq(releaseRequirements.releaseId, releaseId)).returning();
    const scripts = await tx.delete(releaseScripts).where(eq(releaseScripts.releaseId, releaseId)).returning();
    await tx.delete(detectionRules).where(eq(detectionRules.releaseId, releaseId));
    await tx.delete(computerGroupReleases).where(eq(computerGroupReleases.releaseId, releaseId));
    await tx.delete(dynamicGroupReleases).where(eq(dynamicGroupReleases.releaseId, releaseId));
    return { win32, winget, requirements, scripts };
}
