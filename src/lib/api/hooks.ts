"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

// Generic data hooks with the same return shapes as the Convex hooks they replace, so
// components and the virtual tables keep working unchanged.

/** Like Convex `useQuery`: `undefined` while loading (or disabled), and throws if the first load fails. */
export function useApiQuery<T>(key: QueryKey, fetcher: () => Promise<T>, options: { enabled?: boolean } = {}): T | undefined {
    const query = useQuery({ queryKey: key, queryFn: fetcher, enabled: options.enabled ?? true });
    if (query.error && query.data === undefined) throw query.error;
    return query.data;
}

export type Page<Item> = { page: Item[]; continueCursor: string; isDone: boolean };

const EMPTY: never[] = [];

export type PaginatedQueryStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export type PaginatedQueryResult<Item> = {
    results: Item[];
    status: PaginatedQueryStatus;
    isLoading: boolean;
    loadMore: (numItems: number) => void;
};

/**
 * Like Convex `usePaginatedQuery`. Pages are fetched with keyset cursors, so refetching
 * (on focus or after a mutation) reloads every loaded page without gaps or duplicates.
 * Every page has `initialNumItems` rows.
 */
export function usePaginatedApiQuery<Item>(
    key: QueryKey,
    fetchPage: (args: { cursor?: string; numItems: number }) => Promise<Page<Item>>,
    options: { initialNumItems: number; enabled?: boolean },
): PaginatedQueryResult<Item> {
    const query = useInfiniteQuery({
        queryKey: [...key, options.initialNumItems],
        queryFn: ({ pageParam }) => fetchPage({ cursor: pageParam, numItems: options.initialNumItems }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
        enabled: options.enabled ?? true,
    });
    if (query.error && query.data === undefined) throw query.error;

    const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
    const loadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const status: PaginatedQueryStatus = query.data === undefined
        ? "LoadingFirstPage"
        : isFetchingNextPage
            ? "LoadingMore"
            : hasNextPage
                ? "CanLoadMore"
                : "Exhausted";

    // Stable between renders, like Convex's `results`: tables key effects on it.
    const results = useMemo(() => query.data?.pages.flatMap((page) => page.page) ?? EMPTY, [query.data]);

    return {
        results,
        status,
        isLoading: status === "LoadingFirstPage" || status === "LoadingMore",
        loadMore,
    };
}

/**
 * Like Convex `useMutation`: returns an async function. After a successful call every active
 * query refetches (inactive ones are marked stale and refetch on mount), which stands in for
 * Convex's reactive updates across features.
 */
export function useApiMutation<Params extends unknown[], Result>(
    mutation: (...args: Params) => Promise<Result>,
): (...args: Params) => Promise<Result> {
    const queryClient = useQueryClient();
    const mutationRef = useRef(mutation);
    mutationRef.current = mutation;
    return useCallback(async (...args: Params) => {
        const result = await mutationRef.current(...args);
        void queryClient.invalidateQueries();
        return result;
    }, [queryClient]);
}
