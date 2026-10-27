"use client";

import { hc, type InferResponseType } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery, usePaginatedApiQuery } from "@/lib/api/hooks";
import type { EnrollmentTokensAdminRoutes } from "../server/admin.routes";

const client = hc<EnrollmentTokensAdminRoutes>("/api/admin/enrollment-tokens");

export const enrollmentTokenKeys = {
    all: ["enrollment-tokens"] as const,
};

export type EnrollmentTokenItem = InferResponseType<typeof client.all.$get>[number];

export function useEnrollmentTokens() {
    return useApiQuery([...enrollmentTokenKeys.all, "list"], () => call(client.all.$get()));
}

export function useEnrollmentTokensPaginated(options: { initialNumItems: number }) {
    return usePaginatedApiQuery(
        [...enrollmentTokenKeys.all, "page"],
        ({ cursor, numItems }) => call(client.index.$get({ query: { cursor, numItems: String(numItems) } })),
        options,
    );
}

export function useCreateEnrollmentToken() {
    return useApiMutation((args: { name?: string; remainingUses: number; expiresAt?: number }) =>
        call(client.index.$post({ json: args })));
}

export function useRemoveEnrollmentToken() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].$delete({ param: { id } })));
}
