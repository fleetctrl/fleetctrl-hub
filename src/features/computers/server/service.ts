import { and, asc, count, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import type { EventEmitter } from "@/server/events";
import { paginate } from "@/server/pagination";
import { PRESENCE_CHANNEL, type Inventory, type PresenceUpdate } from "../contract";
import { computers, type ComputerRow } from "./schema";

export async function getComputer(db: Database, computerId: string): Promise<ComputerRow | null> {
    const [row] = await db.select().from(computers).where(eq(computers.id, computerId));
    return row ?? null;
}

export async function findComputerByJkt(db: Database, jkt: string): Promise<ComputerRow | null> {
    const [row] = await db.select().from(computers).where(eq(computers.jkt, jkt)).limit(1);
    return row ?? null;
}

export async function createComputer(tx: Database, values: { name: string; jkt: string }): Promise<ComputerRow> {
    const [row] = await tx.insert(computers).values(values).returning();
    return row;
}

/** Re-enrollment of an existing device: binds its key and takes the new name. */
export async function updateComputerIdentity(tx: Database, computerId: string, values: { name: string; jkt: string }) {
    await tx.update(computers).set(values).where(eq(computers.id, computerId));
}

/**
 * The only writer of `last_connection`. Notifies `computer_presence` in the same transaction;
 * Postgres delivers notifications on commit only, so a rolled-back write never broadcasts.
 */
export async function recordPresence(tx: Database, computerId: string): Promise<Date> {
    const now = new Date();
    const [row] = await tx
        .update(computers)
        .set({ lastConnection: now })
        .where(eq(computers.id, computerId))
        .returning({ lastConnection: computers.lastConnection });
    if (!row) throw new Error("Computer not found");
    const update: PresenceUpdate = { id: computerId, lastConnection: now.getTime() };
    await tx.execute(sql`select pg_notify(${PRESENCE_CHANNEL}, ${JSON.stringify(update)})`);
    return now;
}

type RuleField = "name" | "ip" | "os" | "osVersion" | "loginUser" | "clientVersion" | "intuneId";

const ruleFields: [keyof Inventory, RuleField][] = [
    ["name", "name"],
    ["ip", "ip"],
    ["os", "os"],
    ["os_version", "osVersion"],
    ["login_user", "loginUser"],
    ["client_version", "clientVersion"],
    ["intune_id", "intuneId"],
];

/**
 * Applies an inventory report (port of `computers.rustdeskSync`). Inventory and presence have
 * independent timestamps; only the legacy `/computer/rustdesk-sync` route also counts as presence.
 */
export async function updateInventory(
    tx: Database,
    events: EventEmitter,
    computerId: string,
    data: Inventory,
    options: { legacyPresence: boolean },
) {
    const [computer] = await tx.select().from(computers).where(eq(computers.id, computerId)).for("update");
    if (!computer) {
        throw new Error("Computer not found");
    }

    if (options.legacyPresence) {
        await recordPresence(tx, computerId);
    }

    const updates: Partial<typeof computers.$inferInsert> = {
        lastInventoryAt: new Date(),
    };
    if (data.hardware !== undefined) updates.hardware = data.hardware;

    if (data.rustdesk_id !== undefined) {
        // Handle RustDesk ID being sent as string
        const rid = Number(data.rustdesk_id);
        if (Number.isSafeInteger(rid) && computer.rustdeskId !== rid) {
            updates.rustdeskId = rid;
        }
    }

    let ruleFieldsChanged = false;
    for (const [inputKey, column] of ruleFields) {
        const value = data[inputKey];
        if (typeof value === "string" && computer[column] !== value) {
            updates[column] = value;
            ruleFieldsChanged = true;
        }
    }

    await tx.update(computers).set(updates).where(eq(computers.id, computerId));

    // Only re-evaluate dynamic group memberships when a field the rules read changed.
    if (ruleFieldsChanged) {
        await events.emit(tx, "computer.ruleFieldsChanged", { computerId });
    }
}

export async function listComputers(db: Database): Promise<ComputerRow[]> {
    return db.select().from(computers).orderBy(asc(computers.createdAt), asc(computers.id));
}

export async function countComputers(db: Database): Promise<number> {
    const [row] = await db.select({ value: count() }).from(computers);
    return row.value;
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Every word must occur in the column (replaces the Convex full-text search index). */
export function containsAllWords(column: SQL | typeof computers.searchText, search: string): SQL | undefined {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return undefined;
    return and(...words.map((word) => ilike(column, `%${escapeLike(word)}%`)));
}

export async function listComputersPaginated(
    db: Database,
    args: { filter?: string; sortField?: string; sortDesc: boolean; cursor?: string; numItems: number },
) {
    const search = args.filter?.trim().toLowerCase();
    const searchCondition = search ? containsAllWords(computers.searchText, search) : undefined;

    // Search results are ordered by name (Convex ordered them by relevance).
    const sort = searchCondition
        ? { key: computers.name, value: (row: ComputerRow) => row.name, desc: false }
        : args.sortField === "name"
            ? { key: computers.name, value: (row: ComputerRow) => row.name, desc: args.sortDesc }
            : args.sortField === "os"
                ? { key: sql`coalesce(${computers.os}, '')`, value: (row: ComputerRow) => row.os ?? "", desc: args.sortDesc }
                : { key: computers.createdAt, value: (row: ComputerRow) => row.createdAt.toISOString(), desc: args.sortDesc };

    return paginate({
        cursor: args.cursor,
        numItems: args.numItems,
        desc: sort.desc,
        sortKey: sort.key,
        idKey: computers.id,
        sortValue: sort.value,
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) =>
            db.select().from(computers).where(and(searchCondition, where)).orderBy(...orderBy).limit(limit),
    });
}

/** Computer picker for static group membership: name search, otherwise enrollment order. */
export async function pickComputers(db: Database, args: { search?: string; cursor?: string; numItems: number }) {
    const searchCondition = args.search ? containsAllWords(sql`lower(${computers.name})`, args.search) : undefined;
    const sort = searchCondition
        ? { key: computers.name, value: (row: ComputerRow) => row.name }
        : { key: computers.createdAt, value: (row: ComputerRow) => row.createdAt.toISOString() };
    return paginate({
        cursor: args.cursor,
        numItems: args.numItems,
        desc: false,
        sortKey: sort.key,
        idKey: computers.id,
        sortValue: sort.value,
        idValue: (row) => row.id,
        query: ({ where, orderBy, limit }) =>
            db.select().from(computers).where(and(searchCondition, where)).orderBy(...orderBy).limit(limit),
    });
}

/** Deleting a computer removes its tokens, tasks, memberships and install states through FK cascades. */
export async function removeComputer(db: Database, computerId: string) {
    await db.delete(computers).where(eq(computers.id, computerId));
}
