"use client";

import { useEffect, useMemo, useState } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { api } from "@/convex/_generated/api";
import { useAuthPaginatedQuery } from "@/hooks/use-auth-query";

const SORTABLE_FIELDS = ["name", "os"] as const;
const PAGE_SIZE = 50;

export function useComputersTable() {
  const [{ search, sort, desc }, setQueryState] = useQueryStates({
    search: parseAsString.withDefault("").withOptions({ clearOnDefault: true, history: "replace" }),
    sort: parseAsStringLiteral(SORTABLE_FIELDS).withOptions({ clearOnDefault: true, history: "push" }),
    desc: parseAsBoolean.withDefault(false).withOptions({ clearOnDefault: true, history: "push" }),
  });
  const [inputValue, setInputValue] = useState(search);
  const sorting = useMemo<SortingState>(() => sort ? [{ id: sort, desc }] : [], [desc, sort]);
  const query = useAuthPaginatedQuery(
    api.computers.listPaginated,
    { filter: search || undefined, sortField: search ? undefined : sort ?? undefined, sortDesc: search ? undefined : desc },
    { initialNumItems: PAGE_SIZE },
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (inputValue !== search) void setQueryState({ search: inputValue, sort: null, desc: false });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [inputValue, search, setQueryState]);

  useEffect(() => setInputValue(search), [search]);

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (search) return;
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const field = next[0]?.id;
    void setQueryState({
      sort: field === "name" || field === "os" ? field : null,
      desc: next[0]?.desc ?? false,
    });
  };

  return {
    tableData: query.results,
    sorting,
    inputValue,
    setInputValue,
    handleSortingChange,
    handleResetFilters: () => {
      setInputValue("");
      void setQueryState({ search: null, sort: null, desc: null });
    },
    hasActiveFilters: Boolean(search || sort),
    isInitialLoading: query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(PAGE_SIZE),
    isSearchActive: Boolean(search),
  };
}
