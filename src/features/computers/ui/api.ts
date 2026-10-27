"use client";

import { hc, type InferResponseType } from "hono/client";
import { call } from "@/lib/api/call";
import { useApiMutation, useApiQuery, usePaginatedApiQuery } from "@/lib/api/hooks";
import type { ComputersAdminRoutes } from "../server/admin.routes";

export const computersApiBase = "/api/admin/computers";
const client = hc<ComputersAdminRoutes>(computersApiBase);

export const computerKeys = {
    all: ["computers"] as const,
};

export type ComputerListItem = InferResponseType<typeof client.all.$get>[number];
export type ComputerDetail = NonNullable<InferResponseType<(typeof client)[":id"]["$get"]>>;

/** Every computer (dashboard). */
export function useComputers() {
    return useApiQuery([...computerKeys.all, "list"], () => call(client.all.$get()));
}

export function useComputersPaginated(
    args: { filter?: string; sortField?: string; sortDesc?: boolean },
    options: { initialNumItems: number },
) {
    return usePaginatedApiQuery(
        [...computerKeys.all, "page", args],
        ({ cursor, numItems }) => call(client.index.$get({
            query: {
                cursor,
                numItems: String(numItems),
                filter: args.filter,
                sortField: args.sortField,
                sortDesc: args.sortDesc === undefined ? undefined : args.sortDesc ? "true" : "false",
            },
        })),
        options,
    );
}

/** `null` when the computer does not exist. */
export function useComputer(id: string) {
    return useApiQuery([...computerKeys.all, "detail", id], () => call(client[":id"].$get({ param: { id } })));
}

export function useRemoveComputer() {
    return useApiMutation(({ id }: { id: string }) => call(client[":id"].$delete({ param: { id } })));
}
