"use client";

import {
    OnChangeFn,
    PaginationState,
    SortingState,
    Updater,
} from "@tanstack/react-table";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    parseAsBoolean,
    parseAsInteger,
    parseAsString,
    parseAsStringLiteral,
    useQueryStates,
} from "nuqs";

import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import { computer } from "@/modules/computers/table/computers-columns";

const SORTABLE_FIELDS = [
    "name",
    "rustdeskID",
    "ip",
    "os",
    "osVersion",
    "loginUser",
    "lastConnection",
] as const;

type SortField = (typeof SORTABLE_FIELDS)[number];

function isSortField(value: string): value is SortField {
    return (SORTABLE_FIELDS as readonly string[]).includes(value);
}

export function useComputersTable() {
    const [{ page, search, sort, desc }, setQueryState] = useQueryStates({
        page: parseAsInteger.withDefault(1).withOptions({
            clearOnDefault: true,
            history: "push",
        }),
        search: parseAsString.withDefault("").withOptions({
            clearOnDefault: true,
            history: "replace",
        }),
        sort: parseAsStringLiteral(SORTABLE_FIELDS).withOptions({
            clearOnDefault: true,
            history: "push",
        }),
        desc: parseAsBoolean.withDefault(false).withOptions({
            clearOnDefault: true,
            history: "push",
        }),
    });

    const [pageSize, setPageSize] = useState(10);
    const [inputValue, setInputValue] = useState(search);
    const [pageCache, setPageCache] = useState<Record<number, computer[]>>({});
    const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
    const [total, setTotal] = useState<number | undefined>(undefined);
    const [isDone, setIsDone] = useState(false);
    const [visiblePageIndex, setVisiblePageIndex] = useState(0);

    const lastInternalQueryChangeRef = useRef<string | null>(null);

    const maxPageIndex =
        typeof total === "number"
            ? Math.max(0, Math.ceil(total / pageSize) - 1)
            : Infinity;

    const rawPageIndex = Math.max(page, 1) - 1;

    const pageIndex = Math.min(
        rawPageIndex,
        maxPageIndex,
        cursorStack.length - 1,
    );

    const pagination = useMemo<PaginationState>(
        () => ({
            pageIndex: visiblePageIndex,
            pageSize,
        }),
        [pageSize, visiblePageIndex],
    );

    const sorting = useMemo<SortingState>(() => {
        return sort ? [{ id: sort, desc }] : [];
    }, [desc, sort]);

    const querySignature = useMemo(
        () =>
            JSON.stringify({
                search,
                sort,
                desc: sort ? desc : false,
            }),
        [desc, search, sort],
    );

    const sortField = sort ?? undefined;
    const sortDesc = sort ? desc : undefined;

    const cursor = cursorStack[pageIndex] ?? null;
    const canAdvanceCursorStack = pageIndex === cursorStack.length - 1 && !isDone;

    const resetPaginationState = useCallback((keepVisibleData = false) => {
        if (!keepVisibleData) {
            setPageCache({});
            setVisiblePageIndex(0);
        }

        setCursorStack([null]);
        setTotal(undefined);
        setIsDone(false);
    }, []);

    // Only normalize the URL once the requested page is known to be unreachable.
    // While bootstrapping a deep-link, we intentionally let page 1 load first so its
    // continueCursor can extend the stack and unlock later pages.
    useEffect(() => {
        const requestedPageIsTemporarilyClamped =
            rawPageIndex > pageIndex && canAdvanceCursorStack;

        if (!requestedPageIsTemporarilyClamped && rawPageIndex !== pageIndex) {
            void setQueryState({ page: pageIndex + 1 });
        }
    }, [canAdvanceCursorStack, pageIndex, rawPageIndex, setQueryState]);

    const pageResult = useAuthQuery(api.computers.listPaginated, {
        filter: search || undefined,
        sortField,
        sortDesc,
        paginationOpts: {
            numItems: pageSize,
            cursor,
        },
    });

    const isFetching = pageResult === undefined;

    useEffect(() => {
        if (!pageResult) {
            return;
        }

        setTotal(pageResult.total);
        setIsDone(pageResult.isDone);

        setPageCache((prev) => ({
            ...prev,
            [pageIndex]: pageResult.page,
        }));
        setVisiblePageIndex(pageIndex);

        setCursorStack((prev) => {
            const next = [...prev];
            next[pageIndex + 1] = pageResult.continueCursor;
            return next;
        });
    }, [pageIndex, pageResult]);

    useEffect(() => {
        setInputValue((prev) => (prev === search ? prev : search));
    }, [search]);

    useEffect(() => {
        if (lastInternalQueryChangeRef.current === querySignature) {
            lastInternalQueryChangeRef.current = null;
            return;
        }

        resetPaginationState(true);
    }, [querySignature, resetPaginationState]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (search === inputValue) {
                return;
            }

            resetPaginationState(true);

            const nextSignature = JSON.stringify({
                search: inputValue,
                sort,
                desc: sort ? desc : false,
            });

            lastInternalQueryChangeRef.current = nextSignature;

            void setQueryState({
                page: 1,
                search: inputValue,
            });
        }, 400);

        return () => window.clearTimeout(timeoutId);
    }, [desc, inputValue, resetPaginationState, search, setQueryState, sort]);

    const tableData = pageCache[visiblePageIndex] ?? [];

    const pageCount = useMemo(() => {
        if (typeof total === "number") {
            return Math.max(1, Math.ceil(total / pageSize));
        }

        return isDone ? visiblePageIndex + 1 : visiblePageIndex + 2;
    }, [isDone, pageSize, total, visiblePageIndex]);

    const hasActiveFilters = Boolean(search || sort || page !== 1);

    const handlePaginationChange = useCallback(
        (updater: Updater<PaginationState>) => {
            const next =
                typeof updater === "function" ? updater(pagination) : updater;

            if (next.pageSize !== pagination.pageSize) {
                setPageSize(next.pageSize);
                resetPaginationState();
                lastInternalQueryChangeRef.current = querySignature;
                void setQueryState({ page: 1 });
                return;
            }

            if (next.pageIndex !== pagination.pageIndex) {
                lastInternalQueryChangeRef.current = querySignature;
                void setQueryState({ page: next.pageIndex + 1 });
            }
        },
        [pagination, querySignature, resetPaginationState, setQueryState],
    );

    const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
        (updater) => {
            const next = typeof updater === "function" ? updater(sorting) : updater;

            const nextSort = next[0]?.id;
            const nextSortField = nextSort && isSortField(nextSort) ? nextSort : null;
            const nextDesc = next[0]?.desc ?? false;

            resetPaginationState(true);

            lastInternalQueryChangeRef.current = JSON.stringify({
                search,
                sort: nextSortField,
                desc: nextSortField ? nextDesc : false,
            });

            void setQueryState({
                page: 1,
                sort: nextSortField,
                desc: nextSortField ? nextDesc : false,
            });
        },
        [resetPaginationState, search, setQueryState, sorting],
    );

    const handleResetFilters = useCallback(() => {
        resetPaginationState(true);
        setInputValue("");

        lastInternalQueryChangeRef.current = JSON.stringify({
            search: "",
            sort: null,
            desc: false,
        });

        void setQueryState({
            page: 1,
            search: "",
            sort: null,
            desc: false,
        });
    }, [resetPaginationState, setQueryState]);

    return {
        tableData,
        pagination,
        pageCount,
        sorting,
        inputValue,
        setInputValue,
        handlePaginationChange,
        handleSortingChange,
        handleResetFilters,
        hasActiveFilters,
        isFetching,
        total,
    };
}
