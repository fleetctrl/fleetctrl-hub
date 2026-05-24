"use client";

import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/auth-query";

export const DEVICE_INSTALL_STATUS_PAGE_SIZE = 10;

type DeviceInstallStatusPage = NonNullable<
  FunctionReturnType<typeof api.apps.getDeviceInstallStatusPaginated>
>;

export function useDeviceInstallStatus(appId: Id<"apps">) {
  const [requestedPageIndex, setRequestedPageIndex] = useState(0);
  const [displayedPageIndex, setDisplayedPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [displayedStatus, setDisplayedStatus] = useState<
    DeviceInstallStatusPage | undefined
  >(undefined);

  const cursor = cursorStack[requestedPageIndex] ?? null;
  const status = useAuthQuery(api.apps.getDeviceInstallStatusPaginated, {
    appId,
    paginationOpts: {
      numItems: DEVICE_INSTALL_STATUS_PAGE_SIZE,
      cursor,
    },
  });

  useEffect(() => {
    if (!status) return;

    setDisplayedStatus(status);
    setDisplayedPageIndex(requestedPageIndex);
    setCursorStack((prev) => {
      const next = [...prev];
      next[requestedPageIndex + 1] = status.continueCursor;
      return next;
    });
  }, [requestedPageIndex, status]);

  useEffect(() => {
    setRequestedPageIndex(0);
    setDisplayedPageIndex(0);
    setCursorStack([null]);
    setDisplayedStatus(undefined);
  }, [appId]);

  const pageCount = useMemo(() => {
    const total = displayedStatus?.total ?? 0;
    return Math.max(1, Math.ceil(total / DEVICE_INSTALL_STATUS_PAGE_SIZE));
  }, [displayedStatus?.total]);

  const isFetching = status === undefined;
  const isLoading = displayedStatus === undefined;
  const canGoToPreviousPage = requestedPageIndex > 0;
  const canGoToNextPage = Boolean(displayedStatus) && !displayedStatus?.isDone;

  return {
    status: displayedStatus,
    isFetching,
    isLoading,
    pageIndex: displayedPageIndex,
    pageCount,
    canGoToPreviousPage,
    canGoToNextPage,
    previousPage: () =>
      setRequestedPageIndex((page) => Math.max(0, page - 1)),
    nextPage: () => setRequestedPageIndex((page) => page + 1),
  };
}
