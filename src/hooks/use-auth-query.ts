"use client";

import {
    useQuery as useConvexQuery,
    usePaginatedQuery as useConvexPaginatedQuery,
    type PaginatedQueryArgs,
    type PaginatedQueryReference,
    type UsePaginatedQueryReturnType,
} from "convex/react";
import { authClient } from "@/lib/auth-client";
import { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";

/**
 * A wrapper around useQuery that automatically skips the query if the user is not authenticated yet.
 * This prevents "Authenticated" checks in Convex from failing/returning null during initial load.
 */
export function useAuthQuery<Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
): FunctionReturnType<Query> | undefined {
    const { data: session, isPending: isSessionPending } = authClient.useSession();

    const queryArgs = args[0];
    const shouldSkip = isSessionPending || !session || queryArgs === "skip";

    // @ts-expect-error - "skip" is a valid argument for useAuthQuery but types make it hard to express generically
    return useConvexQuery(query, shouldSkip ? "skip" : queryArgs);
}

/**
 * A wrapper around usePaginatedQuery that automatically skips the query if the user is not authenticated yet.
 */
export function useAuthPaginatedQuery<Query extends PaginatedQueryReference>(
    query: Query,
    args: PaginatedQueryArgs<Query> | "skip",
    options: { initialNumItems: number }
): UsePaginatedQueryReturnType<Query> {
    const { data: session, isPending: isSessionPending } = authClient.useSession();

    const shouldSkip = isSessionPending || !session || args === "skip";

    return useConvexPaginatedQuery(
        query,
        shouldSkip ? "skip" : args,
        options
    );
}
