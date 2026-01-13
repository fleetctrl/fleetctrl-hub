"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";

export type KeysTableMeta = {
  onActionComplete?: () => Promise<unknown> | void;
};

// Define local type instead of importing from tRPC
export type Key = {
    id: string;
    name?: string;
    token_fragment?: string; // If we map it
    tokenHash?: string; // We mapped it to tokenHash
    remainingUses: number;
    expiresAt?: string;
    disabled?: boolean;
}

export const columns: ColumnDef<Key>[] = [
  {
    accessorKey: "name",
    header: "Key",
    cell: ({ row }) => {
      return (
        <div className="flex flex-col">
          <span>{row.original.name}</span>
          <span className="text-xs text-gray-500">
            {/* We didn't map token_fragment in data-table. Let's fix data-table or just show hash/name */}
            {row.original.tokenHash?.substring(0, 8)}...
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
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row, table }) => {
      const meta = table.options.meta as KeysTableMeta | undefined;
      const onActionComplete = meta?.onActionComplete;
      return (
        <RowOptions
          tokenID={row.original.id}
          onActionComplete={onActionComplete}
        />
      );
    },
  },
];
