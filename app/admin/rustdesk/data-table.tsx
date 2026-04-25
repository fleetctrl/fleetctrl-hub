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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";

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
import { SearchIcon, XIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const SORTABLE_FIELDS = [
  "name",
  "rustdeskID",
  "ip",
  "os",
  "osVersion",
  "loginUser",
  "lastConnection",
] as const;
type SortField = (typeof SORTABLE_FIELDS)[number];

function isSortField(value: string): value is SortField {
  return (SORTABLE_FIELDS as readonly string[]).includes(value);
}

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
  onResetFilters: () => void;
  hasActiveFilters: boolean;
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
  onResetFilters,
  hasActiveFilters,
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
    <div className="w-full flex flex-col">
      <div className="flex w-full items-center gap-2 py-4">
        <InputGroup className="max-w-62.5">
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
        {hasActiveFilters ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onResetFilters}
                disabled={isLoading}
                className="size-9"
                aria-label="Reset filters"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reset filters</TooltipContent>
          </Tooltip>
        ) : null}
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
  const [{ page, search, sort, desc }, setQueryState] = useQueryStates({
    page: parseAsInteger.withDefault(1).withOptions({
      clearOnDefault: true,
      history: "push",
    }),
    search: parseAsString.withDefault("").withOptions({
      clearOnDefault: true,
      history: "replace",
    }),
    sort: parseAsStringLiteral(SORTABLE_FIELDS).withOptions({
      clearOnDefault: true,
      history: "push",
    }),
    desc: parseAsBoolean.withDefault(false).withOptions({
      clearOnDefault: true,
      history: "push",
    }),
  });
  const [pageSize, setPageSize] = useState(10);
  const [inputValue, setInputValue] = useState<string>(search);
  const [pageCache, setPageCache] = useState<Record<number, RustDesk[]>>({});
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);
  const lastInternalQueryChangeRef = useRef<string | null>(null);

  const maxPageIndex = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : Infinity;
  const pageIndex = Math.max(page, 1) - 1 > maxPageIndex ? maxPageIndex : Math.max(page, 1) - 1;
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex, pageSize }),
    [pageIndex, pageSize]
  );
  const sorting = useMemo<SortingState>(() => {
    return sort ? [{ id: sort, desc }] : [];
  }, [desc, sort]);
  const querySignature = useMemo(
    () => JSON.stringify({ search, sort, desc: sort ? desc : false }),
    [desc, search, sort]
  );

  const sortField = sort ?? undefined;
  const sortDesc = sort ? desc : undefined;

  const cursor = cursorStack[pageIndex] ?? null;

  const pageResult = useAuthQuery(api.computers.listPaginated, {
    filter: search || undefined,
    sortField,
    sortDesc,
    paginationOpts: {
      numItems: pageSize,
      cursor,
    },
  });

  const isFetching = pageResult === undefined;

  const resetPaginationState = useCallback(() => {
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
    setInputValue((prev) => (prev === search ? prev : search));
  }, [search]);

  useEffect(() => {
    if (lastInternalQueryChangeRef.current === querySignature) {
      lastInternalQueryChangeRef.current = null;
      return;
    }

    resetPaginationState();
  }, [querySignature, resetPaginationState]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (search === inputValue) {
        return;
      }

      resetPaginationState();
      const nextSignature = JSON.stringify({
        search: inputValue,
        sort,
        desc: sort ? desc : false,
      });
      lastInternalQueryChangeRef.current = nextSignature;
      void setQueryState({ page: 1, search: inputValue });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [desc, inputValue, resetPaginationState, search, setQueryState, sort]);

  const tableData = pageCache[pageIndex] ?? [];

  const pageCount = useMemo(() => {
    if (typeof total === "number") {
      return Math.max(1, Math.ceil(total / pageSize));
    }
    return isDone ? pageIndex + 1 : pageIndex + 2;
  }, [isDone, pageIndex, pageSize, total]);
  const hasActiveFilters = Boolean(search || sort || page !== 1);

  const handlePaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;

      if (next.pageSize !== pagination.pageSize) {
        setPageSize(next.pageSize);
        resetPaginationState();
        lastInternalQueryChangeRef.current = querySignature;
        void setQueryState({ page: 1 });
        return next;
      }

      if (next.pageIndex !== pagination.pageIndex) {
        lastInternalQueryChangeRef.current = querySignature;
        void setQueryState({ page: next.pageIndex + 1 });
      }

      return next;
    },
    [pagination, querySignature, resetPaginationState, setQueryState]
  );

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const nextSort = next[0]?.id;
      const nextSortField = nextSort && isSortField(nextSort) ? nextSort : null;
      const nextDesc = next[0]?.desc ?? false;

      resetPaginationState();
      lastInternalQueryChangeRef.current = JSON.stringify({
        search,
        sort: nextSortField,
        desc: nextSortField ? nextDesc : false,
      });
      void setQueryState({
        page: 1,
        sort: nextSortField,
        desc: nextSortField ? nextDesc : false,
      });
    },
    [resetPaginationState, search, setQueryState, sorting]
  );

  const handleResetFilters = useCallback(() => {
    resetPaginationState();
    setInputValue("");
    lastInternalQueryChangeRef.current = JSON.stringify({
      search: "",
      sort: null,
      desc: false,
    });
    void setQueryState({
      page: 1,
      search: "",
      sort: null,
      desc: false,
    });
  }, [resetPaginationState, setQueryState]);

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
      onResetFilters={handleResetFilters}
      hasActiveFilters={hasActiveFilters}
      isLoading={isFetching}
      total={total}
    />
  );
}
