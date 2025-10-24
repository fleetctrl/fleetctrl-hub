"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";
import { Key } from "@/server/api/routers/key";

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
            {row.original.token_fragment}
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
