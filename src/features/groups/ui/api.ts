"use client";

import { hc } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery, usePaginatedApiQuery } from "@/lib/api/hooks";
import type { GroupsAdminRoutes } from "../server/admin.routes";

const client = hc<GroupsAdminRoutes>("/api/admin/groups");

export const groupKeys = {
    all: ["groups"] as const,
};

const page = ({ cursor, numItems }: { cursor?: string; numItems: number }) => ({ cursor, numItems: String(numItems) });

// Static groups

export function useStaticGroups() {
    return useApiQuery([...groupKeys.all, "static"], () => call(client.static.$get()));
}

export function useStaticGroupsPaginated(options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...groupKeys.all, "static", "table"],
        (args) => call(client.static.table.$get({ query: page(args) })),
        options,
    );
}

/** Computers to pick members from; name search when `search` is set. */
export function useComputersForGroups(search: string | undefined, options: { initialNumItems: number; enabled: boolean }) {
    return usePaginatedApiQuery(
        [...groupKeys.all, "static", "computers", search ?? ""],
        (args) => call(client.static.computers.$get({ query: { ...page(args), search } })),
        options,
    );
}

export function useStaticGroupMemberIds(groupId: string | null, options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...groupKeys.all, "static", "member-ids", groupId],
        (args) => call(client.static[":id"]["member-ids"].$get({ param: { id: groupId ?? "" }, query: page(args) })),
        { ...options, enabled: groupId !== null },
    );
}

export function useCreateStaticGroup() {
    return useApiMutation((args: { displayName: string; description?: string; memberIds?: string[] }) =>
        call(client.static.$post({ json: args })));
}

export function useUpdateStaticGroup() {
    return useApiMutation(({ id, ...json }: { id: string; displayName?: string; description?: string; memberIds?: string[] }) =>
        call(client.static[":id"].$patch({ param: { id }, json })));
}

export function useRemoveStaticGroup() {
    return useApiMutation(({ id }: { id: string }) => call(client.static[":id"].$delete({ param: { id } })));
}

// Dynamic groups

export function useDynamicGroups() {
    return useApiQuery([...groupKeys.all, "dynamic"], () => call(client.dynamic.$get()));
}

export function useDynamicGroupsPaginated(options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...groupKeys.all, "dynamic", "table"],
        (args) => call(client.dynamic.table.$get({ query: page(args) })),
        options,
    );
}

export function useDynamicGroup(id: string) {
    return useApiQuery([...groupKeys.all, "dynamic", "detail", id], () => call(client.dynamic[":id"].$get({ param: { id } })));
}

export function useDynamicGroupMembers(id: string, options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...groupKeys.all, "dynamic", "members", id],
        (args) => call(client.dynamic[":id"].members.$get({ param: { id }, query: page(args) })),
        options,
    );
}

export function useCreateDynamicGroup() {
    return useApiMutation((args: { displayName: string; description?: string; ruleExpression: unknown }) =>
        call(client.dynamic.$post({ json: args })));
}

export function useUpdateDynamicGroup() {
    return useApiMutation(({ id, ...json }: { id: string; displayName?: string; description?: string; ruleExpression?: unknown }) =>
        call(client.dynamic[":id"].$patch({ param: { id }, json })));
}

export function useRemoveDynamicGroup() {
    return useApiMutation(({ id }: { id: string }) => call(client.dynamic[":id"].$delete({ param: { id } })));
}

export function useRefreshDynamicGroups() {
    return useApiMutation(() => call(client.dynamic["refresh-all"].$post()));
}
