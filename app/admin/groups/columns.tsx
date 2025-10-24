"use client";

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
};

export const columns: ColumnDef<GroupRow>[] = [
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
    cell: ({ row }) => {
      return <RowOptions groupId={row.original.id} />;
    },
  },
];
