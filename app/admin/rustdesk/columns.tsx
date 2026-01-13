"use client";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import RowOptions from "./rowOptions";
import { RustDesk } from "./data-table"; // Import type from data-table
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export const columns: ColumnDef<RustDesk>[] = [
  {
    accessorKey: "lastConnection",
    header: "",
    cell: ({ row }) => {
        const date = new Date(row.original.lastConnection);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const isOnline = diff < 1000 * 60 * 5; // 5 mins
        return isOnline ? "Online" : "Offline";
    }
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <Link
        href={`/admin/rustdesk/computer/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "rustdeskID",
    header: "RustDesk ID",
  },
  {
    accessorKey: "os",
    header: "OS",
  },
  {
    accessorKey: "clientVersion",
    header: "Client",
    cell: ({ row }) => row.original.clientVersion || "—",
  },
  {
    accessorKey: "loginUser",
    header: "Login User",
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      return <RowOptions rustdeskId={row.original.rustdeskID} computerId={row.original.id} />;
    },
  },
];
