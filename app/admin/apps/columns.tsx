"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import RowOptions from "./rowOptions";

export type AppRow = {
  id: string;
  displayName: string;
  groups: {
    id: string;
    name: string;
  }[];
  groupsCount: number;
  createdAtFormatted: string;
  updatedAtFormatted: string;
};

export type AppsTableMeta = {
  onEdit: (appId: string) => void;
  onActionComplete?: () => Promise<unknown> | void;
};

export const columns: ColumnDef<AppRow>[] = [
  {
    accessorKey: "displayName",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/admin/apps/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.displayName}
      </Link>
    ),
  },
  {
    id: "groups",
    header: "Groups",
    cell: ({ row }) => {
      const visibleGroups = row.original?.groups?.slice(0, 2) ?? [];
      const remainingCount = row.original.groupsCount - visibleGroups.length;
      if (row.original.groupsCount === 0) {
        return <span className="text-sm text-muted-foreground">No groups</span>;
      }

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleGroups?.map((group) => (
            <Badge
              key={group.id}
              variant="outline"
              className="max-w-[10rem] truncate"
            >
              {group.name}
            </Badge>
          )) ?? []}
          {remainingCount > 0 ? (
            <Badge variant="secondary">+{remainingCount}</Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "updatedAtFormatted",
    header: "Last updated",
  },
  {
    accessorKey: "createdAtFormatted",
    header: "Created",
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as AppsTableMeta | undefined;
      const onEdit = meta?.onEdit;
      const onActionComplete = meta?.onActionComplete;

      return (
        <RowOptions
          appId={row.original.id}
          onEdit={onEdit ? () => onEdit(row.original.id) : undefined}
          onActionComplete={onActionComplete}
        />
      );
    },
  },
];
