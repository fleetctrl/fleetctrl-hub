/* eslint-disable @convex-dev/no-collect-in-query */
import { v } from "convex/values";
import { mutation } from "../functions";
import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";

const MOCK_NAME_PREFIX = "MOCK-PC-";
const CONFIRMATION = "ADD_MOCK_COMPUTERS";

const osProfiles = [
    { os: "Windows 11 Pro", osVersion: "23H2" },
    { os: "Windows 11 Enterprise", osVersion: "24H2" },
    { os: "Windows 10 Pro", osVersion: "22H2" },
    { os: "Windows Server 2022", osVersion: "21H2" },
];

const locations = ["PRG", "BRN", "OST", "PLZ", "LIB", "HKR", "CBU", "OLM", "Remote"];
const departments = ["FIN", "OPS", "HR", "ENG", "SALES", "SUP", "MKT", "IT", "QA", "LEGAL"];
const deviceTypes = ["NB", "DT", "WS", "KIOSK", "LAB", "SRV"];

const firstNames = [
    "adam",
    "alice",
    "barbora",
    "ben",
    "clara",
    "david",
    "eliska",
    "eva",
    "filip",
    "gina",
    "henry",
    "jakub",
    "jana",
    "katerina",
    "lucie",
    "marek",
    "martin",
    "natalie",
    "pavel",
    "petra",
    "sara",
    "tomas",
    "veronika",
    "zuzana",
];

const lastNames = [
    "bauer",
    "benes",
    "carter",
    "cerny",
    "dvorak",
    "horak",
    "jones",
    "kral",
    "lee",
    "marek",
    "novak",
    "novotny",
    "prochazka",
    "smith",
    "svoboda",
    "vesely",
    "wilson",
    "zeman",
];

function hashNumber(input: number) {
    let value = input + 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
}

function pick<T>(items: T[], seed: number) {
    return items[hashNumber(seed) % items.length];
}

function makeComputerName(index: number) {
    const number = index + 1;
    const location = pick(locations, number * 11);
    const department = pick(departments, number * 17);
    const deviceType = pick(deviceTypes, number * 23);
    const code = hashNumber(number * 31).toString(36).slice(0, 4).toUpperCase().padStart(4, "0");

    return `${location}-${department}-${deviceType}-${code}`;
}

function makeLoginUser(index: number) {
    const number = index + 1;
    const firstName = pick(firstNames, number * 37);
    const lastName = pick(lastNames, number * 41);
    const suffix = hashNumber(number * 43) % 5 === 0 ? String(10 + (hashNumber(number * 47) % 90)) : "";

    return `${firstName}.${lastName}${suffix}`;
}

async function deleteComputerReferences(ctx: MutationCtx, computerId: Id<"computers">) {
    const staticMemberships = await ctx.db
        .query("computer_group_members")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
        .collect();
    for (const membership of staticMemberships) {
        await ctx.db.delete("computer_group_members", membership._id);
    }

    const dynamicMemberships = await ctx.db
        .query("dynamic_group_members")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
        .collect();
    for (const membership of dynamicMemberships) {
        await ctx.db.delete("dynamic_group_members", membership._id);
    }

    const refreshTokens = await ctx.db
        .query("refresh_tokens")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
        .collect();
    for (const token of refreshTokens) {
        await ctx.db.delete("refresh_tokens", token._id);
    }

    const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
        .collect();
    for (const task of tasks) {
        await ctx.db.delete("tasks", task._id);
    }

    const installs = await ctx.db
        .query("computer_apps_installs")
        .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
        .collect();
    for (const install of installs) {
        await ctx.db.delete("computer_apps_installs", install._id);
    }
}

export const add = mutation({
    args: {
        confirm: v.string(),
        count: v.optional(v.number()),
        replaceExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, { confirm, count = 500, replaceExisting = true }) => {
        if (confirm !== CONFIRMATION) {
            throw new Error(`Pass confirm: "${CONFIRMATION}" to add mock computers.`);
        }

        if (!Number.isInteger(count) || count < 1 || count > 500) {
            throw new Error("count must be an integer between 1 and 500.");
        }

        let deleted = 0;
        if (replaceExisting) {
            const existingMockComputers = await ctx.db.query("computers").collect();
            for (const computer of existingMockComputers) {
                if (!computer.name.startsWith(MOCK_NAME_PREFIX)) {
                    continue;
                }

                await deleteComputerReferences(ctx, computer._id);
                await ctx.db.delete("computers", computer._id);
                deleted += 1;
            }
        }

        const now = Date.now();
        const insertedIds: Id<"computers">[] = [];

        for (let index = 0; index < count; index += 1) {
            const number = index + 1;
            const profile = osProfiles[index % osProfiles.length];
            const isOffline = index % 7 === 0;
            const hasIntune = index % 3 !== 0;
            const siteOctet = 10 + (index % 6);
            const hostOctet = 20 + index;

            const id = await ctx.db.insert("computers", {
                name: makeComputerName(index),
                jkt: `mock-jkt-${String(number).padStart(3, "0")}`,
                rustdesk_id: 880000000 + number,
                ip: `10.${siteOctet}.${Math.floor(index / 50)}.${hostOctet}`,
                os: profile.os,
                os_version: profile.osVersion,
                login_user: makeLoginUser(index),
                client_version: `2.${1 + (index % 4)}.${index % 10}`,
                last_connection: isOffline ? now - (8 + index) * 24 * 60 * 60 * 1000 : now - index * 37 * 60 * 1000,
                intune_id: hasIntune ? `mock-intune-${String(number).padStart(3, "0")}` : undefined,
            });

            insertedIds.push(id);
        }

        return {
            inserted: insertedIds.length,
            deleted,
            ids: insertedIds,
        };
    },
});
