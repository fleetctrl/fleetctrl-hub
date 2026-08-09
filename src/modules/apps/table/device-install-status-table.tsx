
import { useMemo } from "react";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { VirtualTable } from "@/components/virtual-table";

type Item = {
  id: string;
  computerName: string;
  releaseVersion: string;
  status: "PENDING" | "INSTALLING" | "INSTALLED" | "ERROR" | "UNINSTALLED";
  statusUpdatedAt?: number;
};

const formatDateTime = (value?: number) => value ? new Date(value).toLocaleString("cs-CZ") : "-";

export function DeviceInstallStatusTable({ items, isInitialLoading, isLoadingMore, hasMore, onLoadMore }: {
  items: Item[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const columns = useMemo<ColumnDef<Item>[]>(() => [
    { accessorKey: "computerName", size: 300, header: "Computer", cell: ({ row }) => <span className="font-medium">{row.original.computerName}</span> },
    { accessorKey: "releaseVersion", size: 160, header: "Release" },
    { accessorKey: "status", size: 150, header: "Status", cell: ({ row }) => <Badge variant={row.original.status === "ERROR" ? "destructive" : "secondary"}>{row.original.status}</Badge> },
    { accessorKey: "statusUpdatedAt", size: 220, header: "Status updated", cell: ({ row }) => formatDateTime(row.original.statusUpdatedAt) },
  ], []);
  
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });
  
  return <VirtualTable
    table={table}
    ariaLabel="Device install status"
    emptyMessage="No device install data for this app yet."
    isInitialLoading={isInitialLoading}
    isLoadingMore={isLoadingMore}
    hasMore={hasMore}
    onLoadMore={onLoadMore}
  />;
}
