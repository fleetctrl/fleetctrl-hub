"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";

export type KeyData = {
  id: string
  name: string,
  remainingUses: string,
  expiresAt?: string,
}

export const columns: ColumnDef<KeyData>[] = [
  {
    accessorKey: "name",
    header: "Key",
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
