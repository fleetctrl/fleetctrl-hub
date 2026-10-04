import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { isRefreshTokenStale, REVOKED_REFRESH_TOKEN_RETENTION_MS } from "../convex/lib/jwt";

const modules = {
    "../convex/_generated/server.ts": () => import("../convex/_generated/server"),
    "../convex/computers.ts": () => import("../convex/computers"),
    "../convex/deviceAuth.ts": () => import("../convex/deviceAuth"),
    "../convex/dpopJtis.ts": () => import("../convex/dpopJtis"),
    "../convex/groups.ts": () => import("../convex/groups"),
    "../convex/tasks.ts": () => import("../convex/tasks"),
};

const DAY = 24 * 60 * 60 * 1000;

describe("heartbeat", () => {
    test("skips the write while presence is recent", async () => {
        const t = convexTest(schema, modules);
        const recent = Date.now() - 30_000;
        const id = await t.run((ctx) => ctx.db.insert("computers", { name: "pc", last_connection: recent }));
        await t.mutation(internal.computers.heartbeat, { computerId: id });
        expect((await t.run((ctx) => ctx.db.get(id)))?.last_connection).toBe(recent);
    });
});

describe("refresh tokens", () => {
    test("reusing a rotated token revokes the device's active sessions", async () => {
        const t = convexTest(schema, modules);
        const { computerId } = await t.run(async (ctx) => {
            const computerId = await ctx.db.insert("computers", { name: "pc", jkt: "k" });
            await ctx.db.insert("refresh_tokens", {
                computer_id: computerId, token_hash: "old", jkt: "k", status: "REVOKED",
                expires_at: Date.now() + DAY, grace_until: Date.now() - 1000,
            });
            await ctx.db.insert("refresh_tokens", {
                computer_id: computerId, token_hash: "current", jkt: "k", status: "ACTIVE",
                expires_at: Date.now() + DAY,
            });
            return { computerId };
        });

        const result = await t.mutation(internal.deviceAuth.rotateRefreshTokenAndCreateSession, {
            refreshTokenHash: "old", dpopJkt: "k", newRefreshTokenHash: "new", newRefreshTokenExpiresAt: Date.now() + DAY,
        });

        expect(result).toEqual({ ok: false, error: "Refresh token not in grace period" });
        const tokens = await t.run((ctx) => ctx.db.query("refresh_tokens")
            .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId)).collect());
        expect(tokens.map((token) => [token.token_hash, token.status]).sort()).toEqual([
            ["current", "REVOKED"],
            ["old", "REVOKED"],
        ]);
    });

    test("normal rotation issues a new active token", async () => {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
            const computerId = await ctx.db.insert("computers", { name: "pc", jkt: "k" });
            await ctx.db.insert("refresh_tokens", {
                computer_id: computerId, token_hash: "current", jkt: "k", status: "ACTIVE",
                expires_at: Date.now() + DAY,
            });
        });

        const result = await t.mutation(internal.deviceAuth.rotateRefreshTokenAndCreateSession, {
            refreshTokenHash: "current", dpopJkt: "k", newRefreshTokenHash: "new", newRefreshTokenExpiresAt: Date.now() + DAY,
        });

        expect(result.ok).toBe(true);
        const fresh = await t.run((ctx) => ctx.db.query("refresh_tokens")
            .withIndex("by_token_hash", (q) => q.eq("token_hash", "new")).unique());
        expect(fresh?.status).toBe("ACTIVE");
    });

    test("cleanup deletes stale tokens and keeps usable or recently rotated ones", async () => {
        const t = convexTest(schema, modules);
        const now = Date.now();
        await t.run(async (ctx) => {
            const computer_id = await ctx.db.insert("computers", { name: "pc", jkt: "k" });
            const base = { computer_id, jkt: "k" };
            await ctx.db.insert("refresh_tokens", { ...base, token_hash: "active", status: "ACTIVE", expires_at: now + DAY });
            await ctx.db.insert("refresh_tokens", { ...base, token_hash: "expired-active", status: "ACTIVE", expires_at: now - 1 });
            await ctx.db.insert("refresh_tokens", { ...base, token_hash: "legacy-expired", status: "EXPIRED", expires_at: now - 1 });
            await ctx.db.insert("refresh_tokens", {
                ...base, token_hash: "recently-rotated", status: "REVOKED", expires_at: now + DAY, grace_until: now,
            });
        });

        await t.mutation(internal.deviceAuth.cleanupExpiredTokens, {});

        const remaining = await t.run((ctx) => ctx.db.query("refresh_tokens").collect());
        expect(remaining.map((token) => token.token_hash).sort()).toEqual(["active", "recently-rotated"]);
    });

    test("rotated tokens become stale only after the retention window", () => {
        const now = Date.now();
        const rotated = { status: "REVOKED", expires_at: now + DAY, grace_until: now - 1000 };
        expect(isRefreshTokenStale(rotated, now)).toBe(false);
        expect(isRefreshTokenStale(rotated, now + REVOKED_REFRESH_TOKEN_RETENTION_MS)).toBe(true);
        expect(isRefreshTokenStale({ status: "ACTIVE", expires_at: now + DAY }, now)).toBe(false);
        expect(isRefreshTokenStale({ status: "ACTIVE", expires_at: now - 1 }, now)).toBe(true);
    });
});

describe("dpop replay", () => {
    test("a jti can be used once per key", async () => {
        const t = convexTest(schema, modules);
        const args = { jkt: "k", jti: "j1", expiresAt: Date.now() + 60_000 };
        expect(await t.mutation(internal.dpopJtis.consume, args)).toBe(true);
        expect(await t.mutation(internal.dpopJtis.consume, args)).toBe(false);
        expect(await t.mutation(internal.dpopJtis.consume, { ...args, jkt: "other" })).toBe(true);
    });

    test("cleanup forgets expired jtis only", async () => {
        const t = convexTest(schema, modules);
        await t.mutation(internal.dpopJtis.consume, { jkt: "k", jti: "old", expiresAt: Date.now() - 1 });
        await t.mutation(internal.dpopJtis.consume, { jkt: "k", jti: "live", expiresAt: Date.now() + 60_000 });
        await t.mutation(internal.dpopJtis.cleanupExpired, {});
        const remaining = await t.run((ctx) => ctx.db.query("dpop_jtis").collect());
        expect(remaining.map((row) => row.jti)).toEqual(["live"]);
    });
});

describe("tasks", () => {
    test("finishing a password task removes the password", async () => {
        const t = convexTest(schema, modules);
        const { computerId, taskId } = await t.run(async (ctx) => {
            const computerId = await ctx.db.insert("computers", { name: "pc" });
            const taskId = await ctx.db.insert("tasks", {
                computer_id: computerId, task_type: "SET_PASSWD", status: "PENDING", task_data: { password: "hunter2" },
            });
            return { computerId, taskId };
        });

        await t.mutation(internal.tasks.updateStatus, { taskId, computerId, status: "SUCCESS" });

        const task = await t.run((ctx) => ctx.db.get(taskId));
        expect(task?.status).toBe("SUCCESS");
        expect(task?.task_data).toBeUndefined();
    });
});

describe("dynamic groups", () => {
    test("refresh only writes membership changes", async () => {
        const t = convexTest(schema, modules);
        const { groupId, stayingMemberId, leaving, joining } = await t.run(async (ctx) => {
            const groupId = await ctx.db.insert("dynamic_computer_groups", {
                display_name: "Windows",
                rule_expression: { property: "os", operator: "equals", value: "Windows" },
            });
            const staying = await ctx.db.insert("computers", { name: "a", os: "Windows" });
            const leaving = await ctx.db.insert("computers", { name: "b", os: "Linux" });
            const joining = await ctx.db.insert("computers", { name: "c", os: "Windows" });
            const stayingMemberId = await ctx.db.insert("dynamic_group_members", {
                group_id: groupId, computer_id: staying, added_at: 1,
            });
            await ctx.db.insert("dynamic_group_members", { group_id: groupId, computer_id: leaving, added_at: 1 });
            return { groupId, stayingMemberId, leaving, joining };
        });

        await t.mutation(internal.groups.refreshGroupMembership, { groupId });

        const members = await t.run((ctx) => ctx.db.query("dynamic_group_members")
            .withIndex("by_group_id", (q) => q.eq("group_id", groupId)).collect());
        const memberComputers = members.map((member) => member.computer_id);
        expect(members.find((member) => member._id === stayingMemberId)?.added_at).toBe(1);
        expect(memberComputers).toContain(joining);
        expect(memberComputers).not.toContain(leaving);
        expect(members).toHaveLength(2);
    });
});
