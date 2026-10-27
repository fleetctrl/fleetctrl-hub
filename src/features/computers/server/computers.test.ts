import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { EventBus } from "@/server/events";
import { createTestDatabase, type TestDatabase } from "@/server/testing/db";
import { inventorySchema } from "../contract";
import { computers } from "./schema";
import { listComputersPaginated, recordPresence, updateInventory } from "./service";

// Port of tests/computers.test.ts (convex-test) to Postgres.

const hardware = {
    cpu_name: "Test CPU", cpu_cores: 4, cpu_logical_processors: 8,
    ram_bytes: 16 * 1024 ** 3, system_drive: "D:",
    system_drive_total_bytes: 512 * 1024 ** 3, system_drive_free_bytes: 0,
};

let t: TestDatabase;
const events = new EventBus();

beforeEach(async () => {
    t = await createTestDatabase();
});

afterEach(async () => {
    await t.close();
});

async function insert(values: Partial<typeof computers.$inferInsert>) {
    const [row] = await t.db.insert(computers).values({ name: "pc", ...values }).returning();
    return row.id;
}

async function get(id: string) {
    const [row] = await t.db.select().from(computers).where(eq(computers.id, id));
    return row;
}

describe("device presence and inventory", () => {
    test("heartbeat only updates presence for its device", async () => {
        const id = await insert({ hardware, lastConnection: new Date(1), lastInventoryAt: new Date(2) });
        const other = await insert({ name: "other", lastConnection: new Date(3) });
        await t.db.transaction((tx) => recordPresence(tx, id));
        const computer = await get(id);
        expect(computer.lastConnection!.getTime()).toBeGreaterThan(1);
        expect(computer.lastInventoryAt!.getTime()).toBe(2);
        expect(computer.hardware).toEqual(hardware);
        expect((await get(other)).lastConnection!.getTime()).toBe(3);
    });

    test("inventory leaves presence unchanged and preserves omitted hardware", async () => {
        const id = await insert({ lastConnection: new Date(1) });
        await t.db.transaction((tx) => updateInventory(tx, events, id, { hardware }, { legacyPresence: false }));
        let computer = await get(id);
        expect(computer.lastConnection!.getTime()).toBe(1);
        expect(computer.lastInventoryAt!.getTime()).toBeGreaterThan(1);
        expect(computer.hardware).toEqual(hardware);
        await t.db.transaction((tx) => updateInventory(tx, events, id, {}, { legacyPresence: false }));
        computer = await get(id);
        expect(computer.hardware).toEqual(hardware);
    });

    test("legacy sync still refreshes presence", async () => {
        const id = await insert({ lastConnection: new Date(1) });
        await t.db.transaction((tx) => updateInventory(tx, events, id, {}, { legacyPresence: true }));
        expect((await get(id)).lastConnection!.getTime()).toBeGreaterThan(1);
    });

    test("heartbeat cannot recreate a deleted computer", async () => {
        const id = await insert({ name: "deleted" });
        await t.db.delete(computers).where(eq(computers.id, id));
        await expect(t.db.transaction((tx) => recordPresence(tx, id))).rejects.toThrow("Computer not found");
    });

    test("rule fields emit an event, other fields do not", async () => {
        const bus = new EventBus();
        const changed: string[] = [];
        bus.on("computer.ruleFieldsChanged", async (_tx, { computerId }) => {
            changed.push(computerId);
        });
        const id = await insert({ os: "Windows 10" });
        await t.db.transaction((tx) => updateInventory(tx, bus, id, { os: "Windows 10", hardware, rustdesk_id: "1234567890" }, { legacyPresence: false }));
        expect(changed).toEqual([]);
        expect((await get(id)).rustdeskId).toBe(1234567890);
        await t.db.transaction((tx) => updateInventory(tx, bus, id, { os: "Windows 11" }, { legacyPresence: false }));
        expect(changed).toEqual([id]);
    });

    test("validates disk sizes and accepts full disks and legacy payloads", () => {
        expect(inventorySchema.safeParse({ hardware }).success).toBe(true);
        expect(inventorySchema.safeParse({ name: "pc", last_connection: "ignored" }).success).toBe(true);
        for (const free of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, hardware.system_drive_total_bytes + 1]) {
            expect(inventorySchema.safeParse({ hardware: { ...hardware, system_drive_free_bytes: free } }).success).toBe(false);
        }
        expect(inventorySchema.safeParse({ hardware: { cpu_name: "partial" } }).success).toBe(false);
        expect(inventorySchema.safeParse(null).success).toBe(false);
    });
});

describe("computer list", () => {
    test("keyset pagination walks every row once, in every sort order", async () => {
        for (let i = 0; i < 7; i++) {
            await insert({ name: `pc-${i}`, os: i % 3 ? "Windows" : null, loginUser: i % 2 ? "John" : null, createdAt: new Date(1_700_000_000_000 + i) });
        }
        for (const args of [
            { sortDesc: true },
            { sortDesc: false, sortField: "name" },
            { sortDesc: true, sortField: "os" },
        ]) {
            const names: string[] = [];
            let cursor: string | undefined;
            for (;;) {
                const page = await listComputersPaginated(t.db, { ...args, cursor, numItems: 3 });
                names.push(...page.page.map((row) => row.name));
                if (page.isDone) break;
                cursor = page.continueCursor;
            }
            expect(names.sort()).toEqual(["pc-0", "pc-1", "pc-2", "pc-3", "pc-4", "pc-5", "pc-6"]);
        }
        const newestFirst = await listComputersPaginated(t.db, { sortDesc: true, numItems: 2 });
        expect(newestFirst.page.map((row) => row.name)).toEqual(["pc-6", "pc-5"]);
    });

    test("search matches every word in name and login user", async () => {
        await insert({ name: "Reception-PC", loginUser: "John" });
        await insert({ name: "Lab-PC", loginUser: "jane" });
        await insert({ name: "100%_PC" });
        const search = async (filter: string) =>
            (await listComputersPaginated(t.db, { filter, sortDesc: false, numItems: 10 })).page.map((row) => row.name);
        expect(await search("john pc")).toEqual(["Reception-PC"]);
        expect(await search("PC")).toEqual(["100%_PC", "Lab-PC", "Reception-PC"]);
        expect(await search("%")).toEqual(["100%_PC"]);
    });
});
