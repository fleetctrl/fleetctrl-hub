"use client";

import { useInstallStatusPaginated, useInstallStatusSummary } from "../api";

const PAGE_SIZE = 50;

export function useDeviceInstallStatus(appId: string) {
  const summary = useInstallStatusSummary(appId);
  const query = useInstallStatusPaginated(appId, { initialNumItems: PAGE_SIZE });
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
