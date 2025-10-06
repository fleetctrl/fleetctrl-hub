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
import { createSupabaseClient } from "@/lib/supabase/client";
import { api } from "@/trpc/react";
import type { RustDesk } from "@/server/api/routers/rustdesk";
import { columns } from "./columns";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";

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
  total?: number;
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
  total,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (
    updater,
  ) => {
    setColumnFilters((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
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
            onChange={(event) =>
              onFilterChange(event.target.value)
            }
            className="max-w-sm"
          />
        </InputGroup>

      </div>
      <div className="rounded-md border">
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
                        header.getContext(),
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
                            cell.getContext(),
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
      </div>
      <div className="flex items-center justify-between py-4">
        <span className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1}
          {typeof total === "number" ? ` of ${Math.max(pageCount, 1)}` : ""}
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
  const [displayPagination, setDisplayPagination] = useState<PaginationState>(
    pagination,
  );
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState<string>("");
  const [tableData, setTableData] = useState<RustDesk[]>([]);
  const [tableTotal, setTableTotal] = useState<number | undefined>(undefined);

  const skip = pagination.pageIndex * pagination.pageSize;
  const limit = pagination.pageSize;

  const sortInput = useMemo(
    () =>
      sorting.length
        ? sorting.map((item) => ({ id: item.id, desc: Boolean(item.desc) }))
        : undefined,
    [sorting],
  );

  const { data, refetch, isFetching } = api.rustdesk.get.useQuery(
    {
      range: {
        skip,
        limit,
      },
      sort: sortInput,
      filter: {
        login_user: filter,
      },
    },
    {
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
    },
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    setTableTotal(data.total);

    const totalCount = typeof data.total === "number" ? data.total : data.data.length;
    const maxPageIndex = Math.max(0, Math.ceil(totalCount / pagination.pageSize) - 1);

    const shouldHoldData =
      totalCount > 0 &&
      data.data.length === 0 &&
      pagination.pageIndex > maxPageIndex;

    if (shouldHoldData) {
      return;
    }

    setTableData(data.data);
    setDisplayPagination(pagination);
  }, [data, pagination]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel("computer-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "computers" },
        () => {
          refetch();
        },
      );

    channel.subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  useEffect(() => {
    if (typeof tableTotal !== "number") {
      return;
    }

    if (tableTotal === 0 && pagination.pageIndex !== 0) {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
      setDisplayPagination((prev) => ({ ...prev, pageIndex: 0 }));
      return;
    }

    const maxPageIndex = Math.max(
      0,
      Math.ceil(tableTotal / pagination.pageSize) - 1,
    );

    if (pagination.pageIndex > maxPageIndex) {
      setPagination((prev) => ({ ...prev, pageIndex: maxPageIndex }));
      setDisplayPagination((prev) => ({ ...prev, pageIndex: maxPageIndex }));
    }
  }, [tableTotal, pagination.pageIndex, pagination.pageSize]);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;

        setDisplayPagination((current) => ({
          ...current,
          pageSize: next.pageSize,
        }));

        return next;
      });
    },
    [],
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      setSorting((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );

      setPagination((prev) => {
        if (prev.pageIndex === 0) {
          return prev;
        }

        return { ...prev, pageIndex: 0 };
      });

      setDisplayPagination((prev) => {
        if (prev.pageIndex === 0) {
          return prev;
        }

        return { ...prev, pageIndex: 0 };
      });
    },
    [],
  );

  const handleFilterChange = (filter: string) => {

    setPagination((prev) => {
      if (prev.pageIndex === 0) {
        return prev;
      }

      return { ...prev, pageIndex: 0 };
    });

    setDisplayPagination((prev) => {
      if (prev.pageIndex === 0) {
        return prev;
      }

      return { ...prev, pageIndex: 0 };
    });

    setFilter(filter)
  }

  const pageCount = useMemo(() => {
    if (typeof tableTotal === "number") {
      const computed = Math.ceil(tableTotal / pagination.pageSize) || 1;
      return Math.max(1, computed);
    }

    const hasMore = tableData.length === displayPagination.pageSize;
    const base = displayPagination.pageIndex + 1;

    return hasMore ? base + 1 : base;
  }, [
    tableTotal,
    tableData.length,
    displayPagination.pageIndex,
    displayPagination.pageSize,
    pagination.pageSize,
  ]);

  return (
    <DataTable
      columns={columns}
      data={tableData}
      pagination={displayPagination}
      pageCount={pageCount}
      onPaginationChange={handlePaginationChange}
      sorting={sorting}
      onSortingChange={handleSortingChange}
      filter={filter}
      onFilterChange={handleFilterChange}
      isLoading={isFetching}
      total={tableTotal}
    />
  );
}
