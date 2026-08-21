"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { api } from "@/convex/_generated/api";
import { VirtualTable } from "@/components/virtual-table";
import { useAuthPaginatedQuery } from "@/hooks/use-auth-query";
import CreateNewKeyDialog from "../key-create-dialog";
import { keysColumns } from "./keys-columns";

const PAGE_SIZE = 50;

export function KeysTable() {
  const query = useAuthPaginatedQuery(api.enrollmentTokens.listPaginated, {}, { initialNumItems: PAGE_SIZE });
  const table = useReactTable({
    data: query.results,
    columns: keysColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex w-full flex-col gap-5">
      <CreateNewKeyDialog />
      <VirtualTable
        table={table}
        pinnedEndColumns={1}
        ariaLabel="Enrollment keys"
        emptyMessage="No enrollment keys found."
        isInitialLoading={query.status === "LoadingFirstPage"}
        isLoadingMore={query.status === "LoadingMore"}
        hasMore={query.status === "CanLoadMore"}
        onLoadMore={() => query.loadMore(PAGE_SIZE)}
      />
    </div>
  );
}
