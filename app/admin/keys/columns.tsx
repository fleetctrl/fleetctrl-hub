"use client";
import { ColumnDef } from "@tanstack/react-table";
import RowOptions from "./rowOptions";

export type KeyData = {
  id: string
  name: string,
  remainingUses: string,
  token_fragment: string
  expiresAt?: string,
}

export const columns: ColumnDef<KeyData>[] = [
  {
    accessorKey: "name",
    header: "Key",
    cell: ({ row }) => {
      return <div className="flex flex-col"><span>{row.original.name}</span><span className="text-xs text-gray-500">{row.original.token_fragment}</span></div>;
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
