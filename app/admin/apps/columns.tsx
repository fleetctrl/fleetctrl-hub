"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import RowOptions from "./rowOptions";

export type GroupRow = {
  id: string;
  displayName: string;
  members: {
    id: string;
    name: string;
  }[];
  memberCount: number;
  createdAtFormatted: string;
  updatedAtFormatted: string;
};

export type GroupsTableMeta = {
  onEdit: (groupId: string) => void;
  onActionComplete?: () => Promise<unknown> | void;
};

export const columns: ColumnDef<GroupRow>[] = [
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
      const visibleMembers = row.original?.members?.slice(0, 2) ?? [];
      const remainingCount = row.original.memberCount - visibleMembers.length;
      if (row.original.memberCount === 0) {
        return <span className="text-sm text-muted-foreground">No groups</span>;
      }

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleMembers?.map((member) => (
            <Badge
              key={member.id}
              variant="outline"
              className="max-w-[10rem] truncate"
            >
              {member.name}
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
      const meta = table.options.meta as GroupsTableMeta | undefined;
      const onEdit = meta?.onEdit;
      const onActionComplete = meta?.onActionComplete;

      return (
        <RowOptions
          groupId={row.original.id}
          onEdit={onEdit ? () => onEdit(row.original.id) : undefined}
          onActionComplete={onActionComplete}
        />
      );
    },
  },
];
