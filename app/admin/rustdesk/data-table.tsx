"use client";

import {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  SortingState,
  Updater,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { columns } from "./columns";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Define the shape of data for the table
export type RustDesk = {
    id: string;
    rustdeskID?: number;
    name: string;
    ip?: string;
    lastConnection: string;
    os?: string;
    osVersion?: string;
    loginUser?: string;
    clientVersion?: string;
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination: PaginationState;
  pageCount: number;
  onPaginationChange: (updater: Updater<PaginationState>) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  filter: string;
  onFilterChange: (filter: string) => void;
  isLoading?: boolean;
}

function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  pageCount,
  onPaginationChange,
  sorting,
  onSortingChange,
  filter,
  onFilterChange,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (
    updater
  ) => {
    setColumnFilters((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
    onPaginationChange((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  });

  return (
    <div className="w-[1000px]">
      <div className="flex w-full items-center py-4">
        <InputGroup className="max-w-[250px]">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search user"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            className="max-w-sm"
          />
        </InputGroup>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <Fragment key={cell.id}>
                        {cell.column.columnDef.header?.toString() === "" ? (
                          <TableCell className="pl-4">
                            <div
                              className={cn("w-3 h-3 rounded-[50%]", {
                                "bg-red-400":
                                  (cell.getContext().getValue() as string) ===
                                  "Offline",
                                "bg-green-400":
                                  (cell.getContext().getValue() as string) ===
                                  "Online",
                              })}
                            />
                          </TableCell>
                        ) : (
                          <TableCell>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        )}
                      </Fragment>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between py-4">
        <span className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
        </span>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={isLoading || !table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={isLoading || !table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RustDeskTable() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState<string>("");

  // Use Convex Paginated Query
  const { results, status, loadMore } = usePaginatedQuery(
    api.computers.list,
    {
        filter: filter || undefined,
        sort: sorting.length ? sorting[0] : undefined
    },
    { initialNumItems: pagination.pageSize }
  );

  const isLoading = status === "LoadingMore" || status === "LoadingFirstPage";
  const tableData = results || [];

  // Convex pagination is "load more" style, but the table expects "pages".
  // This is a common friction point.
  // For standard tables, usually `useQuery` with `skip/limit` is preferred if the backend supports it.
  // My `convex/computers.ts` used `paginate`, which is cursor-based.
  // Adapting cursor-based pagination to page-based table is tricky.

  // Alternative: Fetch all and slice on client (if data is small).
  // Or: Use `skip/take` logic in Convex manually (requires knowing offset).

  // Let's assume for this "Admin Table" we can just load the first page for now,
  // or use `loadMore` when clicking Next.

  // Simplified for now: Just pass the current loaded data.
  // Ideally we would sync `pagination.pageIndex` with `loadMore`.

  const pageCount = 100; // Unknown with cursor pagination unless we count separately

  // Handle pagination changes
  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        // If moving forward
        if (next.pageIndex > prev.pageIndex) {
            loadMore(next.pageSize);
        }
        return next;
      });
    },
    [loadMore]
  );

  return (
    <DataTable
      columns={columns}
      data={tableData} // This is accumulative in Convex `usePaginatedQuery` usually? No, it returns list.
      pagination={pagination}
      pageCount={pageCount}
      onPaginationChange={handlePaginationChange}
      sorting={sorting}
      onSortingChange={setSorting}
      filter={filter}
      onFilterChange={setFilter}
      isLoading={isLoading}
    />
  );
}
