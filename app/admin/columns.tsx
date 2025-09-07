"use client";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import RowOptions from "./rowOptions";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Computer = {
  id: string;
  rustdeskID?: number;
  name?: string;
  ip?: string;
  os?: string;
  osVersion?: string;
  loginUser?: string;
  lastConnection?: string;
};

export const columns: ColumnDef<Computer>[] = [
  {
    accessorKey: "lastConnection",
    header: "",
  },
  {
    accessorKey: "rustdeskID",
    header: "RustDesk ID",
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
  },
  {
    accessorKey: "ip",
    header: "IP",
  },
  {
    accessorKey: "os",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          OS
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: "osVersion",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          OS Version
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
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
