"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import RowOptions from "./row-options";

export type ClientUpdateRow = {
    id: string;
    version: string;
    hash: string;
    byte_size: number;
    is_active: boolean;
    notes: string | null;
    createdAtFormatted: string;
};

export type ClientUpdatesTableMeta = {
    onActionComplete?: () => Promise<unknown> | void;
};

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const columns: ColumnDef<ClientUpdateRow>[] = [
    {
        accessorKey: "version",
        header: "Version",
        cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{row.original.version}</span>
                {row.original.is_active && (
                    <Badge variant="default" className="bg-green-600">
                        Active
                    </Badge>
                )}
            </div>
        ),
    },
    {
        accessorKey: "byte_size",
        header: "Size",
        cell: ({ row }) => formatBytes(row.original.byte_size),
    },
    {
        accessorKey: "hash",
        header: "Hash",
        cell: ({ row }) => (
            <span className="font-mono text-xs text-muted-foreground">
                {row.original.hash.slice(0, 12)}...
            </span>
        ),
    },
    {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => (
            <span className="max-w-[200px] truncate text-sm text-muted-foreground">
                {row.original.notes || "—"}
            </span>
        ),
    },
    {
        accessorKey: "createdAtFormatted",
        header: "Uploaded",
    },
    {
        id: "actions",
        header: "",
        cell: ({ row, table }) => {
            const meta = table.options.meta as ClientUpdatesTableMeta | undefined;
            return (
                <RowOptions
                    versionId={row.original.id}
                    isActive={row.original.is_active}
                    onActionComplete={meta?.onActionComplete}
                />
            );
        },
    },
];
