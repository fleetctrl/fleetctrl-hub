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
import {
  Fragment,
  useState,
} from "react";

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
import { computersColumns } from "./computers-columns";
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
import { useComputersTable } from "@/modules/apps/hooks/use-compters-table";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isComputerOnline(lastConnection?: number) {
  return (
    typeof lastConnection === "number" &&
    Date.now() - lastConnection < ONLINE_THRESHOLD_MS
  );
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

function ComputersDataTable<TData, TValue>({
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
                                "bg-red-400": !isComputerOnline(
                                  cell.getContext().getValue() as
                                  | number
                                  | undefined,
                                ),
                                "bg-green-400": isComputerOnline(
                                  cell.getContext().getValue() as
                                  | number
                                  | undefined,
                                ),
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

export function ComputersTable() {
  const {
    tableData,
    pagination,
    pageCount,
    sorting,
    inputValue,
    setInputValue,
    handlePaginationChange,
    handleSortingChange,
    handleResetFilters,
    hasActiveFilters,
    isFetching,
    total,
  } = useComputersTable();

  return (
    <ComputersDataTable
      columns={computersColumns}
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
