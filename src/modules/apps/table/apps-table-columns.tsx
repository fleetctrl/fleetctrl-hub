"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import RowOptions from "./apps-row-options";

export type AppRow = {
  id: string;
  displayName: string;
  groups: {
    id: string;
    name: string;
  }[];
  groupsCount: number;
  installedCount: number;
  createdAtFormatted: string;
  updatedAtFormatted: string;
};

export type AppsTableMeta = {
  onEdit: (appId: string) => void;
  onActionComplete?: () => Promise<unknown> | void;
};

export const appsTableColumns: ColumnDef<AppRow>[] = [
  {
    accessorKey: "displayName",
    size: 240,
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/apps/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.displayName}
      </Link>
    ),
  },
  {
    id: "groups",
    size: 240,
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
              className="max-w-40 truncate"
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
    accessorKey: "installedCount",
    size: 100,
    header: "Installed",
    cell: ({ row }) => row.original.installedCount,
  },
  {
    accessorKey: "updatedAtFormatted",
    size: 190,
    header: "Last updated",
  },
  {
    accessorKey: "createdAtFormatted",
    size: 190,
    header: "Created",
  },
  {
    id: "actions",
    size: 60,
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as AppsTableMeta | undefined;
      const onEdit = meta?.onEdit;
      const onActionComplete = meta?.onActionComplete;

      return (
        <RowOptions
          appId={row.original.id}
          onEditAction={onEdit ? () => onEdit(row.original.id) : undefined}
          onCompleteAction={onActionComplete}
        />
      );
    },
  },
];
