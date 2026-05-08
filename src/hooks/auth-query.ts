"use client";

import { useQuery as useConvexQuery, usePaginatedQuery as useConvexPaginatedQuery } from "convex/react";
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

    // @ts-ignore - "skip" is a valid argument for useAuthQuery but types make it hard to express generically
    return useConvexQuery(query, shouldSkip ? "skip" : queryArgs);
}

/**
 * A wrapper around usePaginatedQuery that automatically skips the query if the user is not authenticated yet.
 */
export function useAuthPaginatedQuery<Query extends FunctionReference<"query">>(
    query: Query,
    args: any, // Using any to avoid complex type gymnastics with paginationOpts
    options: { initialNumItems: number }
) {
    const { data: session, isPending: isSessionPending } = authClient.useSession();

    const shouldSkip = isSessionPending || !session || args === "skip";

    return useConvexPaginatedQuery(
        query,
        // @ts-ignore
        shouldSkip ? "skip" : args,
        options
    );
}