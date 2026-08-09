
import { ColumnDef } from "@tanstack/react-table";
import { VirtualSortableHeader } from "@/components/virtual-table";
import RowOptions from "./computers-row-options";
export type computer = {
  id: string;
  rustdeskID?: number;
  name?: string;
  ip?: string;
  os?: string;
  osVersion?: string;
  loginUser?: string;
  lastConnection?: number;
  clientVersion?: string;
  intuneId?: string;
};
import Link from "next/link";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.

export const computersColumns: ColumnDef<computer>[] = [
  {
    accessorKey: "lastConnection",
    size: 35,
    header: "",
    cell: ({ row }) => {
      const isOnline =
        typeof row.original.lastConnection === "number" &&
        Date.now() - row.original.lastConnection < 5 * 60 * 1000;

      return (
        <span
          className={`mx-auto block size-2.5 rounded-full ${isOnline ? "animate-pulse bg-green-500" : "bg-red-500"}`}
          title={isOnline ? "Online" : "Offline"}
          aria-label={isOnline ? "Online" : "Offline"}
        />
      );
    },
  },
  {
    accessorKey: "name",
    size: 230,
    header: ({ column, table }) => {
      const isSearchActive = Boolean((table.options.meta as { isSearchActive?: boolean } | undefined)?.isSearchActive);
      return (
        <VirtualSortableHeader
          column={column}
          label="Name"
          disabled={isSearchActive}
          disabledReason="Sorting is disabled while searching"
        />
      );
    },
    cell: ({ row }) => (
      <Link
        href={`/computers/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "rustdeskID",
    size: 110,
    header: "RustDesk ID",
  },
  {
    accessorKey: "os",
    size: 230,
    header: ({ column, table }) => {
      const isSearchActive = Boolean((table.options.meta as { isSearchActive?: boolean } | undefined)?.isSearchActive);
      return (
        <VirtualSortableHeader
          column={column}
          label="OS"
          disabled={isSearchActive}
          disabledReason="Sorting is disabled while searching"
        />
      );
    },
  },
  {
    accessorKey: "clientVersion",
    size: 70,
    header: "Client",
    cell: ({ row }) => row.original.clientVersion || "—",
  },
  {
    accessorKey: "loginUser",
    size: 180,
    header: "Login User",
  },
  {
    id: "actions",
    size: 60,
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <span className="mx-auto block">
          <RowOptions
          rustdeskId={row.original.rustdeskID}
          computerId={row.original.id}
        />
        </span>
      );
    },
  },
];
