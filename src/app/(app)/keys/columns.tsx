"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";

// Type matching Convex enrollmentTokens.list output
export type Key = {
  id: string;
  name?: string;
  tokenFragment?: string;
  remainingUses: number;
  disabled: boolean;
  expiresAt?: number;
  lastUsedAt?: number;
  createdAt: number;
};

export type KeysTableMeta = {
  onActionComplete?: () => Promise<unknown> | void;
};

export const columns: ColumnDef<Key>[] = [
  {
    accessorKey: "name",
    header: "Key",
    cell: ({ row }) => {
      return (
        <div className="flex flex-col">
          <span>{row.original.name}</span>
          <span className="text-xs text-gray-500">
            {row.original.tokenFragment}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "remainingUses",
    header: "Remaining",
  },
  {
    accessorKey: "expiresAt",
    header: "Expiration",
    cell: ({ row }) => {
      const val = row.original.expiresAt;
      if (!val) return "-";
      return new Date(val).toLocaleString();
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      return <RowOptions tokenID={row.original.id} />;
    },
  },
];

