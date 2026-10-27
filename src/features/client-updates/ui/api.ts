"use client";

import { hc } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery, usePaginatedApiQuery } from "@/lib/api/hooks";
import type { ClientUpdatesAdminRoutes } from "../server/admin.routes";

const client = hc<ClientUpdatesAdminRoutes>("/api/admin/client-updates");

export const clientUpdateKeys = {
    all: ["client-updates"] as const,
};

export function useClientUpdates() {
    return useApiQuery([...clientUpdateKeys.all, "list"], () => call(client.all.$get()));
}

export function useClientUpdatesPaginated(options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...clientUpdateKeys.all, "page"],
        ({ cursor, numItems }) => call(client.index.$get({ query: { cursor, numItems: String(numItems) } })),
        options,
    );
}

export function useActiveClientUpdate() {
    return useApiQuery([...clientUpdateKeys.all, "active"], () => call(client.active.$get()));
}

export function useCreateClientUpdate() {
    return useApiMutation((args: {
        version: string;
        storageId: string;
        hash?: string;
        byte_size?: number;
        file_name?: string;
        mime_type?: string;
        notes?: string;
    }) => call(client.index.$post({ json: args })));
}

export function useActivateClientUpdate() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].activate.$post({ param: { id } })));
}

export function useDeactivateClientUpdate() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].deactivate.$post({ param: { id } })));
}

export function useRemoveClientUpdate() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].$delete({ param: { id } })));
}
