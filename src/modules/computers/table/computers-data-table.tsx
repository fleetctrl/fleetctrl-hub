"use client";

import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VirtualTable } from "@/components/virtual-table";
import { useComputersTable } from "@/modules/apps/hooks/use-compters-table";
import { computersColumns } from "./computers-columns";

export function ComputersTable() {
  const state = useComputersTable();
  const table = useReactTable({
    data: state.tableData,
    columns: computersColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    onSortingChange: state.handleSortingChange,
    state: { sorting: state.sorting },
    meta: { isSearchActive: state.isSearchActive },
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <InputGroup className="max-w-62.5">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Search computers" value={state.inputValue} onChange={(event) => state.setInputValue(event.target.value)} />
        </InputGroup>
        {state.hasActiveFilters ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={state.handleResetFilters} aria-label="Reset filters">
                <XIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reset filters</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <VirtualTable
        height={575}
        table={table}
        pinnedStartColumns={2}
        pinnedEndColumns={1}
        ariaLabel="Computers"
        emptyMessage="No computers found."
        isInitialLoading={state.isInitialLoading}
        isLoadingMore={state.isLoadingMore}
        hasMore={state.hasMore}
        onLoadMore={state.loadMore}
      />
    </div>
  );
}
