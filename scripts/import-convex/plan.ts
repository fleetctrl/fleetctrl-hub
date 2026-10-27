import type * as schema from "@/server/db/schema";
import { ruleExpressionSchema, type RuleExpression } from "@/features/groups/contract";
import { versionSortKey } from "@/server/version-sort-key";
import type { ConvexDoc, ConvexTable } from "./convex-docs";
import type { InvalidDocument } from "./zip";

export type Snapshot = { [Table in ConvexTable]: ConvexDoc<Table>[] };

/** A source document that is not imported, and why. */
export type DroppedDocument = { table: string; id: string; reason: string };

/** A conflict with a new unique constraint and how it is (or would be) resolved. */
export type Resolution = { kind: string; key: string; kept: string; affected: string[]; action: string };

type Insert<Table extends { $inferInsert: object }> = Table["$inferInsert"];

export type ImportRows = {
    files: Insert<typeof schema.files>[];
    user: Insert<typeof schema.user>[];
    account: Insert<typeof schema.account>[];
    computers: Insert<typeof schema.computers>[];
    enrollmentTokens: Insert<typeof schema.enrollmentTokens>[];
    refreshTokens: Insert<typeof schema.refreshTokens>[];
    tasks: Insert<typeof schema.tasks>[];
    computerGroups: Insert<typeof schema.computerGroups>[];
    computerGroupMembers: Insert<typeof schema.computerGroupMembers>[];
    dynamicComputerGroups: Insert<typeof schema.dynamicComputerGroups>[];
    apps: Insert<typeof schema.apps>[];
    releases: Insert<typeof schema.releases>[];
    win32Releases: Insert<typeof schema.win32Releases>[];
    wingetReleases: Insert<typeof schema.wingetReleases>[];
    detectionRules: Insert<typeof schema.detectionRules>[];
    releaseRequirements: Insert<typeof schema.releaseRequirements>[];
    releaseScripts: Insert<typeof schema.releaseScripts>[];
    computerGroupReleases: Insert<typeof schema.computerGroupReleases>[];
    dynamicGroupReleases: Insert<typeof schema.dynamicGroupReleases>[];
    computerAppsInstalls: Insert<typeof schema.computerAppsInstalls>[];
    clientUpdates: Insert<typeof schema.clientUpdates>[];
};

export type ImportPlan = {
    rows: ImportRows;
    dropped: DroppedDocument[];
    /** Applied automatically (plan §10: installs keep the newest, one active client version, ...). */
    resolutions: Resolution[];
    /** Need a manual decision; applied only with `--auto-resolve`, otherwise the import refuses to run. */
    blocking: Resolution[];
    skippedUnreferencedFiles: number;
};

const date = (value: number) => new Date(Math.floor(value));
const optionalDate = (value: number | null | undefined) => (value === undefined || value === null ? null : date(value));
const int = (value: number) => Math.round(value);
const optionalInt = (value: number | undefined) => (value === undefined ? null : Math.round(value));
const text = (value: string | undefined) => value ?? null;

/** Convex stores `_storage.sha256` base64-encoded; `files.sha256` is hex like every other hash in the app. */
export function storageSha256Hex(base64: string) {
    return Buffer.from(base64, "base64").toString("hex");
}

function groupBy<Item>(items: Item[], key: (item: Item) => string | undefined) {
    const groups = new Map<string, Item[]>();
    for (const item of items) {
        const value = key(item);
        if (value === undefined) continue;
        groups.set(value, [...(groups.get(value) ?? []), item]);
    }
    return [...groups].filter(([, members]) => members.length > 1);
}

const newestFirst = <Doc extends { _creationTime: number }>(rank: (doc: Doc) => number) =>
    (a: Doc, b: Doc) => rank(b) - rank(a) || b._creationTime - a._creationTime;

/**
 * Turns a parsed export into the rows to insert. Convex enforces no foreign keys, so children whose
 * parent is missing (or was dropped) are dropped too, in FK order. Pure: no I/O.
 */
export function planImport(
    snapshot: Snapshot,
    options: { now: number; autoResolve: boolean; hasFile: (storageId: string) => boolean; invalid?: InvalidDocument[] },
): ImportPlan {
    const dropped: DroppedDocument[] = (options.invalid ?? []).map((doc) => ({
        table: doc.table,
        id: `line ${doc.line}`,
        reason: `invalid document: ${doc.error}`,
    }));
    const resolutions: Resolution[] = [];
    const blocking: Resolution[] = [];
    const apply = (resolution: Resolution, needsDecision: boolean) => {
        (needsDecision ? blocking : resolutions).push(resolution);
        return !needsDecision || options.autoResolve;
    };
    const drop = (table: string, id: string, reason: string) => dropped.push({ table, id, reason });

    function filter<Doc extends { _id: string }>(table: string, docs: Doc[], problem: (doc: Doc) => string | null): Doc[] {
        return docs.filter((doc) => {
            const reason = problem(doc);
            if (reason) drop(table, doc._id, reason);
            return reason === null;
        });
    }

    /** Drops all but one document per key: `pick` sorts the preferred one first. */
    function dedupe<Doc extends { _id: string }>(
        table: string,
        docs: Doc[],
        key: (doc: Doc) => string | undefined,
        pick: (a: Doc, b: Doc) => number,
        kind: string,
        needsDecision: boolean,
    ): Doc[] {
        const removed = new Set<string>();
        for (const [value, members] of groupBy(docs, key)) {
            const [kept, ...others] = [...members].sort(pick);
            if (apply({ kind, key: value, kept: kept._id, affected: others.map((doc) => doc._id), action: "dropped" }, needsDecision)) {
                for (const other of others) {
                    removed.add(other._id);
                    drop(table, other._id, `duplicate ${kind} ${value}, kept ${kept._id}`);
                }
            }
        }
        return docs.filter((doc) => !removed.has(doc._id));
    }

    // Auth: user emails are unique.
    const users = dedupe("user", snapshot.user, (u) => u.email.toLowerCase(), (a, b) => a._creationTime - b._creationTime, "user email", true);
    const userIds = new Set(users.map((u) => u._id));
    const accounts = filter("account", snapshot.account, (a) => (userIds.has(a.userId) ? null : `user ${a.userId} missing`));

    // Computers: jkt becomes unique. The most recently connected computer keeps it, the others lose it
    // (they can re-enroll); dropping them would also drop their tokens and install history.
    const clearedJkt = new Set<string>();
    for (const [jkt, members] of groupBy(snapshot.computers, (c) => c.jkt || undefined)) {
        const [kept, ...others] = [...members].sort(newestFirst((c) => c.last_connection ?? 0));
        if (apply({ kind: "computer jkt", key: jkt, kept: kept._id, affected: others.map((c) => c._id), action: "jkt cleared" }, true)) {
            for (const other of others) clearedJkt.add(other._id);
        }
    }
    const computers = snapshot.computers;
    const computerIds = new Set(computers.map((c) => c._id));
    const missingComputer = (id: string) => (computerIds.has(id) ? null : `computer ${id} missing`);

    const enrollmentTokens = dedupe("enrollment_tokens", snapshot.enrollment_tokens, (t) => t.token_hash, newestFirst(() => 0), "enrollment token hash", true);

    // Refresh tokens: only those that can still be used (ACTIVE and unexpired, or REVOKED inside the grace window).
    const usableTokens = filter("refresh_tokens", snapshot.refresh_tokens, (t) => {
        const orphan = missingComputer(t.computer_id);
        if (orphan) return orphan;
        if (t.status === "ACTIVE" && t.expires_at > options.now) return null;
        if (t.status === "REVOKED" && t.grace_until !== undefined && t.grace_until > options.now) return null;
        return `${t.status.toLowerCase()} token no longer usable`;
    });
    const refreshTokens = dedupe("refresh_tokens", usableTokens, (t) => t.token_hash, newestFirst(() => 0), "refresh token hash", true);

    const tasks = filter("tasks", snapshot.tasks, (t) => missingComputer(t.computer_id));

    const staticGroupIds = new Set(snapshot.computer_groups.map((g) => g._id));
    const members = dedupe(
        "computer_group_members",
        filter("computer_group_members", snapshot.computer_group_members, (m) =>
            !staticGroupIds.has(m.group_id) ? `group ${m.group_id} missing` : missingComputer(m.computer_id)),
        (m) => `${m.group_id}/${m.computer_id}`,
        (a, b) => a._creationTime - b._creationTime,
        "static group membership",
        false,
    );

    // Dynamic groups: a rule that does not parse would break every membership refresh.
    const dynamicGroups: { group: ConvexDoc<"dynamic_computer_groups">; rule: RuleExpression }[] = [];
    for (const group of snapshot.dynamic_computer_groups) {
        const parsed = ruleExpressionSchema.safeParse(group.rule_expression);
        if (parsed.success) {
            dynamicGroups.push({ group, rule: parsed.data });
        } else if (apply({ kind: "invalid dynamic group rule", key: group.display_name, kept: "", affected: [group._id], action: "group dropped" }, true)) {
            drop("dynamic_computer_groups", group._id, "invalid rule expression");
        }
    }
    const dynamicGroupIds = new Set(dynamicGroups.map(({ group }) => group._id));

    const appIds = new Set(snapshot.apps.map((a) => a._id));
    const releases = filter("releases", snapshot.releases, (r) => (appIds.has(r.app_id) ? null : `app ${r.app_id} missing`));
    const releaseIds = new Set(releases.map((r) => r._id));
    const missingRelease = (id: string) => (releaseIds.has(id) ? null : `release ${id} missing`);
    // A file is usable when the export has both its `_storage` metadata and its content.
    const availableFiles = new Set(snapshot._storage.filter((file) => options.hasFile(file._id)).map((file) => file._id));
    const missingFile = (storageId: string) => (availableFiles.has(storageId) ? null : `file ${storageId} missing from the export`);

    // v2 read the per-type row with `.first()`, i.e. the oldest one; release_id is unique now.
    const win32 = dedupe(
        "win32_releases",
        filter("win32_releases", snapshot.win32_releases, (r) => missingRelease(r.release_id) ?? missingFile(r.install_binary_storage_id)),
        (r) => r.release_id,
        (a, b) => a._creationTime - b._creationTime,
        "win32 row per release",
        false,
    );
    const winget = dedupe(
        "winget_releases",
        filter("winget_releases", snapshot.winget_releases, (r) => missingRelease(r.release_id)),
        (r) => r.release_id,
        (a, b) => a._creationTime - b._creationTime,
        "winget row per release",
        false,
    );
    const detections = filter("detection_rules", snapshot.detection_rules, (r) => missingRelease(r.release_id));
    const requirements = filter("release_requirements", snapshot.release_requirements, (r) => missingRelease(r.release_id) ?? missingFile(r.storage_id));
    const scripts = filter("release_scripts", snapshot.release_scripts, (s) =>
        missingRelease(s.release_id) ?? (s.storage_id ? missingFile(s.storage_id) : null));

    // Group assignments: (release, group) is unique now. Exclude wins over include (as in assignment resolution), then the oldest.
    const assignmentOrder = (a: { assign_type: string; _creationTime: number }, b: { assign_type: string; _creationTime: number }) =>
        Number(b.assign_type === "exclude") - Number(a.assign_type === "exclude") || a._creationTime - b._creationTime;
    const staticAssignments = dedupe(
        "computer_group_releases",
        filter("computer_group_releases", snapshot.computer_group_releases, (a) =>
            missingRelease(a.release_id) ?? (staticGroupIds.has(a.group_id) ? null : `group ${a.group_id} missing`)),
        (a) => `${a.release_id}/${a.group_id}`,
        assignmentOrder,
        "static group assignment",
        true,
    );
    const dynamicAssignments = dedupe(
        "dynamic_group_releases",
        filter("dynamic_group_releases", snapshot.dynamic_group_releases, (a) =>
            missingRelease(a.release_id) ?? (dynamicGroupIds.has(a.group_id) ? null : `group ${a.group_id} missing`)),
        (a) => `${a.release_id}/${a.group_id}`,
        assignmentOrder,
        "dynamic group assignment",
        true,
    );

    // Install state: one row per (computer, app); the newest report wins.
    const installs = dedupe(
        "computer_apps_installs",
        filter("computer_apps_installs", snapshot.computer_apps_installs, (i) =>
            missingComputer(i.computer_id)
            ?? (appIds.has(i.app_id) ? null : `app ${i.app_id} missing`)
            ?? (i.release_id !== undefined ? missingRelease(i.release_id) : null)),
        (i) => `${i.computer_id}/${i.app_id}`,
        newestFirst((i) => i.status_updated_at ?? 0),
        "install state per computer and app",
        false,
    );

    // Client updates: at most one active version, the newest.
    const clientUpdates = filter("client_updates", snapshot.client_updates, (u) => missingFile(u.storage_id));
    const active = clientUpdates.filter((u) => u.is_active).sort(newestFirst(() => 0));
    const deactivated = new Set(active.slice(1).map((u) => u._id));
    if (active.length > 1) {
        resolutions.push({ kind: "active client update", key: "is_active", kept: active[0]._id, affected: [...deactivated], action: "deactivated" });
    }

    // Files: only the ones a surviving row references.
    const fileNames = new Map<string, string | undefined>();
    for (const r of win32) fileNames.set(r.install_binary_storage_id, r.installer_name);
    for (const r of requirements) if (!fileNames.has(r.storage_id)) fileNames.set(r.storage_id, r.script_name);
    for (const s of scripts) if (s.storage_id && !fileNames.has(s.storage_id)) fileNames.set(s.storage_id, s.script_name);
    for (const u of clientUpdates) if (!fileNames.has(u.storage_id)) fileNames.set(u.storage_id, u.file_name);
    const storage = snapshot._storage.filter((file) => fileNames.has(file._id) && availableFiles.has(file._id));

    const rows: ImportRows = {
        files: storage.map((file) => ({
            id: file._id,
            createdAt: date(file._creationTime),
            objectKey: `files/${file._id}`,
            size: int(file.size),
            sha256: storageSha256Hex(file.sha256),
            contentType: text(file.contentType),
            originalName: fileNames.get(file._id) ?? null,
        })),
        user: users.map((u) => ({
            id: u._id,
            name: u.name,
            email: u.email,
            emailVerified: u.emailVerified,
            image: u.image ?? null,
            role: u.role ?? null,
            createdAt: date(u.createdAt),
            updatedAt: date(u.updatedAt),
        })),
        account: accounts.map((a) => ({
            id: a._id,
            accountId: a.accountId,
            providerId: a.providerId,
            userId: a.userId,
            accessToken: a.accessToken ?? null,
            refreshToken: a.refreshToken ?? null,
            idToken: a.idToken ?? null,
            accessTokenExpiresAt: optionalDate(a.accessTokenExpiresAt),
            refreshTokenExpiresAt: optionalDate(a.refreshTokenExpiresAt),
            scope: a.scope ?? null,
            password: a.password ?? null,
            createdAt: date(a.createdAt),
            updatedAt: date(a.updatedAt),
        })),
        computers: computers.map((c) => {
            const rustdeskId = c.rustdesk_id !== undefined ? Math.round(c.rustdesk_id) : null;
            return {
                id: c._id,
                createdAt: date(c._creationTime),
                name: c.name,
                jkt: clearedJkt.has(c._id) ? null : c.jkt || null,
                rustdeskId: rustdeskId !== null && Number.isSafeInteger(rustdeskId) ? rustdeskId : null,
                ip: text(c.ip),
                os: text(c.os),
                osVersion: text(c.os_version),
                loginUser: text(c.login_user),
                clientVersion: text(c.client_version),
                intuneId: text(c.intune_id),
                lastConnection: optionalDate(c.last_connection),
                lastInventoryAt: optionalDate(c.last_inventory_at),
                hardware: c.hardware ?? null,
            };
        }),
        enrollmentTokens: enrollmentTokens.map((t) => ({
            id: t._id,
            createdAt: date(t._creationTime),
            tokenHash: t.token_hash,
            name: text(t.name),
            tokenFragment: text(t.token_fragment),
            remainingUses: int(t.remaining_uses),
            disabled: t.disabled,
            expiresAt: optionalDate(t.expires_at),
            lastUsedAt: optionalDate(t.last_used_at),
        })),
        refreshTokens: refreshTokens.map((t) => ({
            id: t._id,
            createdAt: date(t._creationTime),
            computerId: t.computer_id,
            tokenHash: t.token_hash,
            jkt: t.jkt,
            status: t.status,
            expiresAt: date(t.expires_at),
            graceUntil: optionalDate(t.grace_until),
            lastUsedAt: optionalDate(t.last_used_at),
        })),
        tasks: tasks.map((t) => ({
            id: t._id,
            createdAt: date(t._creationTime),
            computerId: t.computer_id,
            taskType: t.task_type,
            status: t.status,
            taskData: t.task_data ?? null,
            error: text(t.error),
            startedAt: optionalDate(t.started_at),
            finishAt: optionalDate(t.finish_at),
        })),
        computerGroups: snapshot.computer_groups.map((g) => ({
            id: g._id,
            createdAt: date(g._creationTime),
            displayName: g.display_name,
            description: text(g.description),
        })),
        computerGroupMembers: members.map((m) => ({ groupId: m.group_id, computerId: m.computer_id, createdAt: date(m._creationTime) })),
        dynamicComputerGroups: dynamicGroups.map(({ group, rule }) => ({
            id: group._id,
            createdAt: date(group._creationTime),
            displayName: group.display_name,
            description: text(group.description),
            ruleExpression: rule,
            lastEvaluatedAt: optionalDate(group.last_evaluated_at),
        })),
        apps: snapshot.apps.map((a) => ({
            id: a._id,
            createdAt: date(a._creationTime),
            displayName: a.display_name,
            description: text(a.description),
            publisher: a.publisher,
            autoUpdate: a.auto_update,
        })),
        releases: releases.map((r) => ({
            id: r._id,
            createdAt: date(r._creationTime),
            appId: r.app_id,
            version: r.version,
            installerType: r.installer_type,
            disabledAt: optionalDate(r.disabled_at),
            uninstallPrevious: r.uninstall_previous,
            versionSortKey: versionSortKey(r.version),
        })),
        win32Releases: win32.map((r) => ({
            id: r._id,
            createdAt: date(r._creationTime),
            releaseId: r.release_id,
            installerName: r.installer_name,
            installBinaryFileId: r.install_binary_storage_id,
            hash: r.hash,
            installScript: r.install_script,
            uninstallScript: r.uninstall_script,
            installBinarySize: optionalInt(r.install_binary_size),
        })),
        wingetReleases: winget.map((r) => ({ id: r._id, createdAt: date(r._creationTime), releaseId: r.release_id, wingetId: r.winget_id })),
        detectionRules: detections.map((r) => ({
            id: r._id,
            createdAt: date(r._creationTime),
            releaseId: r.release_id,
            type: r.type,
            config: r.config,
        })),
        releaseRequirements: requirements.map((r) => ({
            id: r._id,
            createdAt: date(r._creationTime),
            releaseId: r.release_id,
            timeoutSeconds: int(r.timeout_seconds),
            runAsSystem: r.run_as_system,
            scriptName: r.script_name,
            fileId: r.storage_id,
            hash: r.hash,
            byteSize: optionalInt(r.byte_size),
        })),
        releaseScripts: scripts.map((s) => ({
            id: s._id,
            createdAt: date(s._creationTime),
            releaseId: s.release_id,
            phase: s.phase,
            engine: s.engine,
            timeoutSeconds: int(s.timeout_seconds),
            runAsSystem: s.run_as_system,
            scriptName: s.script_name,
            fileId: s.storage_id ?? null,
            hash: s.hash,
            byteSize: optionalInt(s.byte_size),
        })),
        computerGroupReleases: staticAssignments.map((a) => ({
            id: a._id,
            createdAt: date(a._creationTime),
            releaseId: a.release_id,
            groupId: a.group_id,
            assignType: a.assign_type,
            action: a.action,
        })),
        dynamicGroupReleases: dynamicAssignments.map((a) => ({
            id: a._id,
            createdAt: date(a._creationTime),
            releaseId: a.release_id,
            groupId: a.group_id,
            assignType: a.assign_type,
            action: a.action,
        })),
        computerAppsInstalls: installs.map((i) => ({
            id: i._id,
            createdAt: date(i._creationTime),
            computerId: i.computer_id,
            appId: i.app_id,
            status: i.status,
            releaseId: i.release_id ?? null,
            error: text(i.error),
            installedAt: optionalDate(i.installed_at),
            lastSeenAt: optionalDate(i.last_seen_at),
            statusUpdatedAt: optionalDate(i.status_updated_at),
            reinstallRequestedAt: optionalDate(i.reinstall_requested_at),
        })),
        clientUpdates: clientUpdates.map((u) => ({
            id: u._id,
            createdAt: date(u._creationTime),
            version: u.version,
            fileId: u.storage_id,
            hash: u.hash,
            byteSize: int(u.byte_size),
            fileName: text(u.file_name),
            mimeType: text(u.mime_type),
            isActive: u.is_active && !deactivated.has(u._id),
            notes: text(u.notes),
            versionSortKey: versionSortKey(u.version),
        })),
    };

    return {
        rows,
        dropped,
        resolutions,
        blocking,
        skippedUnreferencedFiles: snapshot._storage.length - storage.length,
    };
}
