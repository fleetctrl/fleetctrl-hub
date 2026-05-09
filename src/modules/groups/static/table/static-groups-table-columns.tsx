"use client";

import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import StaticGroupsRowOptions from "./static-groups-row-options";

export type StaticGroupRow = {
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

export type StaticGroupsTableMeta = {
  onEdit: (groupId: string) => void;
  onActionComplete?: () => Promise<unknown> | void;
};

export const staticGroupsTableColumns: ColumnDef<StaticGroupRow>[] = [
  {
    accessorKey: "displayName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.displayName}</span>
    ),
  },
  {
    id: "members",
    header: "Members",
    cell: ({ row }) => {
      const visibleMembers = row.original?.members?.slice(0, 2) ?? [];
      const remainingCount = row.original.memberCount - visibleMembers.length;
      if (row.original.memberCount === 0) {
        return (
          <span className="text-sm text-muted-foreground">No members</span>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleMembers?.map((member) => (
            <Badge
              key={member.id}
              variant="outline"
              className="max-w-40 truncate"
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
      const meta = table.options.meta as StaticGroupsTableMeta | undefined;
      const onEdit = meta?.onEdit;
      const onActionComplete = meta?.onActionComplete;

      return (
        <StaticGroupsRowOptions
          groupId={row.original.id}
          onEdit={onEdit ? () => onEdit(row.original.id) : undefined}
          onActionComplete={onActionComplete}
        />
      );
    },
  },
];
