"use client";

import { useMemo } from "react";
import {
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";

import {
  appsTableColumns,
  type AppRow,
  type AppsTableMeta,
} from "./apps-table-columns";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthPaginatedQuery } from "@/hooks/use-auth-query";
import { VirtualTable } from "@/components/virtual-table";

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const PAGE_SIZE = 10;

export function AppsTable() {
  const query = useAuthPaginatedQuery(api.apps.getTableDataPaginated, {}, { initialNumItems: PAGE_SIZE });
  const apps = query.results;
  const router = useRouter();

  const appRows: AppRow[] = useMemo(() => {
    if (!apps) {
      return [];
    }
    return apps.map((app) => ({
      id: app.id,
      displayName: app.displayName,
      groups: app.groups,
      groupsCount: app.groupsCount,
      installedCount: app.installedCount ?? 0,
      createdAtFormatted: formatDateTime(app.createdAt),
      updatedAtFormatted: formatDateTime(app.updatedAt),
    }));
  }, [apps]);

  const openEditDialog = (appId: string) => {
    router.push(`/apps/${appId}`);
  };

  const table = useReactTable<AppRow>({
    data: appRows,
    columns: appsTableColumns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: openEditDialog,
      onActionComplete: () => {
        // Convex is automatically reactive - no refetch needed
      },
    } satisfies AppsTableMeta,
  });

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Apps</h2>
          <p className="text-sm text-muted-foreground">
            Create and deploy computer apps to groups of computers
          </p>
        </div>
        <Button asChild>
          <Link href="/apps/create">Create app</Link>
        </Button>
      </div>
      <VirtualTable
        table={table}
        ariaLabel="Apps"
        emptyMessage="No apps yet. Create one to start organizing computers."
        isInitialLoading={query.status === "LoadingFirstPage"}
        isLoadingMore={query.status === "LoadingMore"}
        hasMore={query.status === "CanLoadMore"}
        onLoadMore={() => query.loadMore(PAGE_SIZE)}
        pinnedStartColumns={1}
        pinnedEndColumns={1}
      />
    </div>
  );
}
