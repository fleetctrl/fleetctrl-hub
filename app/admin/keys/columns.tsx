"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";
import type { RouterOutputs } from "@/trpc/shared";

export type KeyData = RouterOutputs["keys"]["list"][number];

export const columns: ColumnDef<KeyData>[] = [
  {
    accessorKey: "name",
    header: "Key",
    cell: ({ row }) => {
      return (
        <div className="flex flex-col">
          <span>{row.original.name}</span>
          <span className="text-xs text-gray-500">{row.original.tokenFragment}</span>
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
    cell: ({ row }) => {
      return <RowOptions tokenID={row.original.id} />;
    },
  },
];
