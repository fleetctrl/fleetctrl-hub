"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { VirtualTable } from "@/components/virtual-table";
import { useEnrollmentTokensPaginated } from "../api";
import CreateNewKeyDialog from "./key-create-dialog";
import { keysColumns } from "./keys-columns";

const PAGE_SIZE = 50;

export function KeysTable() {
  const query = useEnrollmentTokensPaginated({ initialNumItems: PAGE_SIZE });
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
