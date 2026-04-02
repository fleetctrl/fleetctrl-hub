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
import { useAuthQuery } from "@/hooks/auth-query";
import { api } from "@/convex/_generated/api";
import { columns, RustDesk } from "./columns";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isComputerOnline(lastConnection?: number) {
  return typeof lastConnection === "number" && Date.now() - lastConnection < ONLINE_THRESHOLD_MS;
}

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
                                "bg-red-400": !isComputerOnline(
                                  cell.getContext().getValue() as number | undefined
                                ),
                                "bg-green-400": isComputerOnline(
                                  cell.getContext().getValue() as number | undefined
                                ),
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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [filter, setFilter] = useState<string>("");
  const [pageCache, setPageCache] = useState<Record<number, RustDesk[]>>({});
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);

  const { pageIndex, pageSize } = pagination;

  const sortField = sorting.length > 0 ? sorting[0].id : undefined;
  const sortDesc = sorting.length > 0 ? sorting[0].desc : undefined;

  const cursor = cursorStack[pageIndex] ?? null;

  const pageResult = useAuthQuery(api.computers.listPaginated, {
    filter: filter || undefined,
    sortField,
    sortDesc,
    paginationOpts: {
      numItems: pageSize,
      cursor,
    },
  });

  const isFetching = pageResult === undefined;

  const resetQueryState = useCallback((nextPageSize: number) => {
    setPagination({ pageIndex: 0, pageSize: nextPageSize });
    setPageCache({});
    setCursorStack([null]);
    setTotal(undefined);
    setIsDone(false);
  }, []);

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

    setCursorStack((prev) => {
      const next = [...prev];
      next[pageIndex + 1] = pageResult.continueCursor;
      return next;
    });
  }, [pageIndex, pageResult]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (inputValue === filter) {
        return;
      }

      resetQueryState(pageSize);
      setFilter(inputValue);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filter, inputValue, pageSize, resetQueryState]);

  useEffect(() => {
    resetQueryState(pageSize);
  }, [pageSize, resetQueryState]);

  const tableData = pageCache[pageIndex] ?? [];

  const pageCount = useMemo(() => {
    if (typeof total === "number") {
      return Math.max(1, Math.ceil(total / pageSize));
    }
    return isDone ? pageIndex + 1 : pageIndex + 2;
  }, [isDone, pageIndex, pageSize, total]);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        return next;
      });
    },
    []
  );

  const handleSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
    resetQueryState(pageSize);
  }, [pageSize, resetQueryState]);

  return (
    <DataTable
      columns={columns}
      data={tableData}
      pagination={pagination}
      pageCount={pageCount}
      onPaginationChange={handlePaginationChange}
      sorting={sorting}
      onSortingChange={handleSortingChange}
      filter={inputValue}
      onFilterChange={setInputValue}
      isLoading={isFetching}
      total={total}
    />
  );
}
