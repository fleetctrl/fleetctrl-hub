"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthPaginatedQuery, useAuthQuery } from "@/hooks/use-auth-query";

const PAGE_SIZE = 50;

export function useDeviceInstallStatus(appId: Id<"apps">) {
  const summary = useAuthQuery(api.apps.getDeviceInstallStatusSummary, { appId });
  const query = useAuthPaginatedQuery(api.apps.getDeviceInstallStatusPaginated, { appId }, { initialNumItems: PAGE_SIZE });
  return {
    summary,
    items: query.results,
    isSummaryLoading: summary === undefined,
    isInitialLoading: query.status === "LoadingFirstPage",
    isLoadingMore: query.status === "LoadingMore",
    hasMore: query.status === "CanLoadMore",
    loadMore: () => query.loadMore(PAGE_SIZE),
  };
}
