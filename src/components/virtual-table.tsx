
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Column, Table as TanStackTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type VirtualizedDataTableProps<TData> = {
  table: TanStackTable<TData>;
  ariaLabel: string;
  emptyTitle?: string;
  emptyMessage: string;
  emptyAction?: ReactNode;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  estimateRowHeight?: number;
  overscan?: number;
  pinnedStartColumns?: number;
  pinnedEndColumns?: number;
  className?: string;
  height?: CSSProperties["height"];
};

export function VirtualSortableHeader<TData, TValue>({
  column,
  label,
  disabled = false,
  disabledReason,
}: {
  column: Column<TData, TValue>;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const sortState = column.getIsSorted();
  const button = (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={() => {
        if (sortState === "asc") column.toggleSorting(true);
        else if (sortState === "desc") column.clearSorting();
        else column.toggleSorting(false);
      }}
    >
      {label}
      {sortState === "asc" ? (
        <ArrowUp data-icon="inline-end" />
      ) : sortState === "desc" ? (
        <ArrowDown data-icon="inline-end" />
      ) : (
        <ArrowUpDown data-icon="inline-end" />
      )}
    </Button>
  );

  if (!disabled || !disabledReason) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

export function VirtualTable<TData>({
  table,
  ariaLabel,
  emptyTitle,
  emptyMessage,
  emptyAction,
  isInitialLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  estimateRowHeight = 52,
  overscan = 8,
  pinnedStartColumns = 0,
  pinnedEndColumns = 0,
  className,
  height,
}: VirtualizedDataTableProps<TData>) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinShadows, setPinShadows] = useState({
    start: false,
    end: false,
    scrollbarWidth: 0,
  });
  const rows = table.getRowModel().rows;
  const loadingRef = useRef(false);
  const observedLoadingRef = useRef(false);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.tabIndex = 0;
    scrollElement.setAttribute("role", "region");
    scrollElement.setAttribute("aria-label", ariaLabel);
  }, [ariaLabel]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const syncHeader = () => {
      if (!headerScrollRef.current) return;
      const scrollbarWidth = scrollElement.offsetWidth - scrollElement.clientWidth;
      headerScrollRef.current.style.width = `calc(100% - ${scrollbarWidth}px)`;
      headerScrollRef.current.scrollLeft = scrollElement.scrollLeft;
      const nextShadows = {
        start: scrollElement.scrollLeft > 0,
        end: scrollElement.scrollLeft < scrollElement.scrollWidth - scrollElement.clientWidth - 1,
        scrollbarWidth,
      };
      setPinShadows((current) =>
        current.start === nextShadows.start &&
        current.end === nextShadows.end &&
        current.scrollbarWidth === nextShadows.scrollbarWidth
          ? current
          : nextShadows
      );
    };

    const resizeObserver = new ResizeObserver(syncHeader);
    resizeObserver.observe(scrollElement);
    scrollElement.addEventListener("scroll", syncHeader, { passive: true });
    syncHeader();
    return () => {
      resizeObserver.disconnect();
      scrollElement.removeEventListener("scroll", syncHeader);
    };
  }, [rows.length]);

  useEffect(() => {
    if (isInitialLoading) scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [isInitialLoading]);

  useEffect(() => {
    if (isLoadingMore) {
      observedLoadingRef.current = true;
    } else if (observedLoadingRef.current || !hasMore) {
      loadingRef.current = false;
      observedLoadingRef.current = false;
    }
  }, [hasMore, isLoadingMore]);

  useEffect(() => {
    if (
      hasMore &&
      !isLoadingMore &&
      !loadingRef.current &&
      (rows.length === 0 || lastVirtualIndex >= rows.length - 10)
    ) {
      loadingRef.current = true;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, lastVirtualIndex, onLoadMore, rows.length]);

  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows.at(-1)!.end
    : 0;
  const visibleColumns = table.getVisibleLeafColumns();
  const columnCount = Math.max(visibleColumns.length, 1);
  const hasData = rows.length > 0;
  const startCount = hasData
    ? Math.min(Math.max(0, pinnedStartColumns), visibleColumns.length)
    : 0;
  const endCount = Math.min(
    hasData ? Math.max(0, pinnedEndColumns) : 0,
    visibleColumns.length - startCount
  );
  const startPinnedWidth = visibleColumns
    .slice(0, startCount)
    .reduce((sum, column) => sum + column.getSize(), 0);
  const endPinnedWidth = visibleColumns
    .slice(visibleColumns.length - endCount)
    .reduce((sum, column) => sum + column.getSize(), 0);
  const tableWidth = table.getTotalSize();
  const stretchColumnIndex = Math.max(0, visibleColumns.length - endCount - 1);
  const getColumnWidth = (index: number) =>
    index === stretchColumnIndex
      ? `calc(${visibleColumns[index].getSize()}px + max(0px, 100% - ${tableWidth}px))`
      : visibleColumns[index].getSize();
  const getPinnedColumn = (columnId: string) => {
    const index = visibleColumns.findIndex((column) => column.id === columnId);
    if (index < 0) return null;

    if (index < startCount) {
      return {
        edge: index === startCount - 1,
        side: "start" as const,
        style: {
          left: visibleColumns.slice(0, index).reduce((sum, column) => sum + column.getSize(), 0),
          position: "sticky",
          zIndex: 20,
        } satisfies CSSProperties,
      };
    }

    if (index >= visibleColumns.length - endCount) {
      return {
        edge: index === visibleColumns.length - endCount,
        side: "end" as const,
        style: {
          position: "sticky",
          right: visibleColumns
            .slice(index + 1)
            .reduce((sum, column) => sum + column.getSize(), 0),
          zIndex: 20,
        } satisfies CSSProperties,
      };
    }

    return null;
  };

  return (
    <div className={cn("relative overflow-hidden rounded-md border", className)}>
      {startCount > 0 && pinShadows.start ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-30 w-1.5"
          style={{
            bottom: pinShadows.scrollbarWidth,
            left: startPinnedWidth,
            background:
              "linear-gradient(to right, color-mix(in oklab, var(--foreground) 14%, transparent), transparent)",
          }}
        />
      ) : null}
      {endCount > 0 && pinShadows.end ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-30 w-1.5"
          style={{
            bottom: pinShadows.scrollbarWidth,
            right: pinShadows.scrollbarWidth + endPinnedWidth,
            background:
              "linear-gradient(to left, color-mix(in oklab, var(--foreground) 14%, transparent), transparent)",
          }}
        />
      ) : null}
      <div className="bg-muted">
        <Table
          aria-label={ariaLabel}
          className="table-fixed"
          style={{ width: `max(100%, ${tableWidth}px)` }}
          containerRef={headerScrollRef}
          containerClassName="overflow-hidden"
        >
          <colgroup>
            {visibleColumns.map((column, index) => (
              <col key={column.id} style={{ width: getColumnWidth(index) }} />
            ))}
          </colgroup>
          <TableHeader className="[&_tr]:border-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const pinned = getPinnedColumn(header.column.id);
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "relative bg-muted after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']",
                      )}
                      style={pinned?.style}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
        </Table>
      </div>
      {isInitialLoading ? (
        <div
          ref={scrollRef}
          role="region"
          aria-label={`${ariaLabel} rows`}
          aria-busy="true"
          className={cn(
            "flex items-center justify-center bg-card",
            height === undefined &&
              "h-[calc(60dvh-2.5rem)] min-h-[17.5rem] lg:h-[calc(100dvh-18.5rem)]",
          )}
          style={{ height }}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading rows…
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div
          ref={scrollRef}
          role="region"
          aria-label={`${ariaLabel} rows`}
          className={cn(
            "overflow-auto bg-card",
            height === undefined &&
              "h-[calc(60dvh-2.5rem)] min-h-[17.5rem] lg:h-[calc(100dvh-18.5rem)]",
          )}
          style={{ height }}
        >
          <Empty className="h-full min-h-48 rounded-none">
            <EmptyHeader>
              {emptyTitle ? <EmptyTitle>{emptyTitle}</EmptyTitle> : null}
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            </EmptyHeader>
            {emptyAction ? <EmptyContent>{emptyAction}</EmptyContent> : null}
          </Empty>
        </div>
      ) : (
        <Table
          aria-label={`${ariaLabel} rows`}
          aria-busy={isInitialLoading || isLoadingMore}
          className="table-fixed"
          style={{ width: `max(100%, ${tableWidth}px)` }}
          containerRef={scrollRef}
          containerStyle={{ height }}
          containerClassName={cn(
            "overflow-auto",
            height === undefined &&
              "h-[calc(60dvh-2.5rem)] min-h-[17.5rem] lg:h-[calc(100dvh-18.5rem)]",
          )}
        >
          <colgroup>
            {visibleColumns.map((column, index) => (
              <col key={column.id} style={{ width: getColumnWidth(index) }} />
            ))}
          </colgroup>
          <TableBody className="bg-card [&_tr]:hover:bg-transparent">
            <>
              {paddingTop > 0 ? (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={columnCount} className="p-0" style={{ height: paddingTop }} />
                </TableRow>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <TableRow
                    key={row.id}
                    ref={rowVirtualizer.measureElement}
                    className="group border-0 [&>td]:border-0"
                    data-index={virtualRow.index}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const value = cell.getValue();
                      const pinned = getPinnedColumn(cell.column.id);
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "truncate",
                            pinned &&
                              "bg-card group-data-[state=selected]:bg-muted",
                          )}
                          style={{
                            ...pinned?.style,
                            backgroundImage:
                              "linear-gradient(to bottom, transparent calc(100% - 1px), var(--border) calc(100% - 1px))",
                          }}
                          onMouseEnter={(event) => {
                            const element = event.currentTarget;
                            if (typeof value === "string" && element.scrollWidth > element.clientWidth) {
                              element.title = value;
                            } else {
                              element.removeAttribute("title");
                            }
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {paddingBottom > 0 ? (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={columnCount} className="p-0" style={{ height: paddingBottom }} />
                </TableRow>
              ) : null}
              {isLoadingMore ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-13 text-center text-muted-foreground">
                    Loading more…
                  </TableCell>
                </TableRow>
              ) : null}
            </>
          </TableBody>
        </Table>
      )}
      <p className="sr-only" aria-live="polite">
        {isLoadingMore ? "Loading more rows" : hasMore ? "More rows available" : "All rows loaded"}
      </p>
    </div>
  );
}
