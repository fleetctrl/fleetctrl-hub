import type { ComputerGroupRow, DynamicComputerGroupRow } from "@/features/groups/server";
import type {
    computerGroupReleases,
    detectionRules,
    dynamicGroupReleases,
    releaseRequirements,
    releaseScripts,
    win32Releases,
    wingetReleases,
} from "./schema";

type Win32Row = typeof win32Releases.$inferSelect;
type WingetRow = typeof wingetReleases.$inferSelect;
type DetectionRow = typeof detectionRules.$inferSelect;
type RequirementRow = typeof releaseRequirements.$inferSelect;
type ScriptRow = typeof releaseScripts.$inferSelect;
type StaticAssignmentRow = typeof computerGroupReleases.$inferSelect;
type DynamicAssignmentRow = typeof dynamicGroupReleases.$inferSelect;

// Several responses expose raw Convex documents; these mappers keep that shape
// (`_id`, `_creationTime`, snake_case fields, absent optionals, `storage_id` for file references).

const doc = (row: { id: string; createdAt: Date }) => ({ _id: row.id, _creationTime: row.createdAt.getTime() });
const opt = <T>(value: T | null) => value ?? undefined;

export function scriptDoc(row: ScriptRow) {
    return {
        ...doc(row),
        release_id: row.releaseId,
        phase: row.phase,
        engine: row.engine,
        timeout_seconds: row.timeoutSeconds,
        run_as_system: row.runAsSystem,
        script_name: row.scriptName,
        storage_id: opt(row.fileId),
        hash: row.hash,
        byte_size: opt(row.byteSize),
    };
}

export function requirementDoc(row: RequirementRow) {
    return {
        ...doc(row),
        release_id: row.releaseId,
        timeout_seconds: row.timeoutSeconds,
        run_as_system: row.runAsSystem,
        script_name: row.scriptName,
        storage_id: row.fileId,
        hash: row.hash,
        byte_size: opt(row.byteSize),
    };
}

export function win32Doc(row: Win32Row) {
    return {
        ...doc(row),
        release_id: row.releaseId,
        installer_name: row.installerName,
        install_binary_storage_id: row.installBinaryFileId,
        hash: row.hash,
        install_script: row.installScript,
        uninstall_script: row.uninstallScript,
        install_binary_size: opt(row.installBinarySize),
    };
}

export function wingetDoc(row: WingetRow) {
    return { ...doc(row), release_id: row.releaseId, winget_id: row.wingetId };
}

export function detectionDoc(row: DetectionRow) {
    return { ...doc(row), release_id: row.releaseId, type: row.type, config: row.config };
}

function staticGroupDoc(group: ComputerGroupRow) {
    return { ...doc(group), display_name: group.displayName, description: opt(group.description) };
}

function dynamicGroupDoc(group: DynamicComputerGroupRow) {
    return {
        ...doc(group),
        display_name: group.displayName,
        description: opt(group.description),
        rule_expression: group.ruleExpression,
        last_evaluated_at: group.lastEvaluatedAt?.getTime(),
    };
}

export function staticAssignmentDoc(row: StaticAssignmentRow, group: ComputerGroupRow | undefined) {
    return {
        ...doc(row),
        release_id: row.releaseId,
        group_id: row.groupId,
        assign_type: row.assignType,
        action: row.action,
        computer_groups: group ? staticGroupDoc(group) : null,
    };
}

export function dynamicAssignmentDoc(row: DynamicAssignmentRow, group: DynamicComputerGroupRow | undefined) {
    return {
        ...doc(row),
        release_id: row.releaseId,
        group_id: row.groupId,
        assign_type: row.assignType,
        action: row.action,
        dynamic_computer_groups: group ? dynamicGroupDoc(group) : null,
    };
}
