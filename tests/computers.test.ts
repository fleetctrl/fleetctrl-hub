import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { inventorySchema } from "../convex/lib/hardware";

const modules = {
    "../convex/_generated/server.ts": () => import("../convex/_generated/server"),
    "../convex/computers.ts": () => import("../convex/computers"),
};
const hardware = {
    cpu_name: "Test CPU", cpu_cores: 4, cpu_logical_processors: 8,
    ram_bytes: 16 * 1024 ** 3, system_drive: "D:",
    system_drive_total_bytes: 512 * 1024 ** 3, system_drive_free_bytes: 0,
};

describe("device presence and inventory", () => {
    test("heartbeat only updates presence for its device", async () => {
        const t = convexTest(schema, modules);
        const id = await t.run((ctx) => ctx.db.insert("computers", {
            name: "pc", search_text: "pc", hardware, last_connection: 1, last_inventory_at: 2,
        }));
        const other = await t.run((ctx) => ctx.db.insert("computers", { name: "other", last_connection: 3 }));
        await t.mutation(internal.computers.heartbeat, { computerId: id });
        const computer = await t.run((ctx) => ctx.db.get(id));
        expect(computer?.last_connection).toBeGreaterThan(1);
        expect(computer?.last_inventory_at).toBe(2);
        expect(computer?.hardware).toEqual(hardware);
        expect((await t.run((ctx) => ctx.db.get(other)))?.last_connection).toBe(3);
    });

    test("inventory leaves presence unchanged and preserves omitted hardware", async () => {
        const t = convexTest(schema, modules);
        const id = await t.run((ctx) => ctx.db.insert("computers", { name: "pc", search_text: "pc", last_connection: 1 }));
        await t.mutation(internal.computers.rustdeskSync, { computerId: id, legacyPresence: false, data: { hardware } });
        let computer = await t.run((ctx) => ctx.db.get(id));
        expect(computer?.last_connection).toBe(1);
        expect(computer?.last_inventory_at).toBeGreaterThan(1);
        expect(computer?.hardware).toEqual(hardware);
        await t.mutation(internal.computers.rustdeskSync, { computerId: id, legacyPresence: false, data: {} });
        computer = await t.run((ctx) => ctx.db.get(id));
        expect(computer?.hardware).toEqual(hardware);
    });

    test("legacy sync still refreshes presence", async () => {
        const t = convexTest(schema, modules);
        const id = await t.run((ctx) => ctx.db.insert("computers", { name: "pc", search_text: "pc", last_connection: 1 }));
        await t.mutation(internal.computers.rustdeskSync, { computerId: id, data: {} });
        expect((await t.run((ctx) => ctx.db.get(id)))?.last_connection).toBeGreaterThan(1);
    });

    test("heartbeat cannot recreate a deleted computer", async () => {
        const t = convexTest(schema, modules);
        const id = await t.run(async (ctx) => {
            const id = await ctx.db.insert("computers", { name: "deleted" });
            await ctx.db.delete(id);
            return id;
        });
        await expect(t.mutation(internal.computers.heartbeat, { computerId: id })).rejects.toThrow("Computer not found");
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
