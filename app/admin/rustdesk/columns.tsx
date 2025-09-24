"use client";
import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import RowOptions from "./rowOptions";
import { RustDesk } from "@/server/api/routers/rustdesk";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.

export const columns: ColumnDef<RustDesk>[] = [
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
      const sortState = column.getIsSorted();
      return (
        <Button
          variant="ghost"
          onClick={() => {
            if (sortState === "asc") {
              column.toggleSorting(true);
            } else if (sortState === "desc") {
              column.clearSorting();
            } else {
              column.toggleSorting(false);
            }
          }}
        >
          Name
          {sortState === "asc" ? (
            <ArrowUp className="ml-2 h-4 w-4" />
          ) : sortState === "desc" ? (
            <ArrowDown className="ml-2 h-4 w-4" />
          ) : (
            <ArrowUpDown className="ml-2 h-4 w-4" />
          )}
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
      const sortState = column.getIsSorted();
      return (
        <Button
          variant="ghost"
          onClick={() => {
            if (sortState === "asc") {
              column.toggleSorting(true);
            } else if (sortState === "desc") {
              column.clearSorting();
            } else {
              column.toggleSorting(false);
            }
          }}
        >
          OS
          {sortState === "asc" ? (
            <ArrowUp className="ml-2 h-4 w-4" />
          ) : sortState === "desc" ? (
            <ArrowDown className="ml-2 h-4 w-4" />
          ) : (
            <ArrowUpDown className="ml-2 h-4 w-4" />
          )}
        </Button>
      );
    },
  },
  {
    accessorKey: "osVersion",
    header: ({ column }) => {
      const sortState = column.getIsSorted();
      return (
        <Button
          variant="ghost"
          onClick={() => {
            if (sortState === "asc") {
              column.toggleSorting(true);
            } else if (sortState === "desc") {
              column.clearSorting();
            } else {
              column.toggleSorting(false);
            }
          }}
        >
          OS Version
          {sortState === "asc" ? (
            <ArrowUp className="ml-2 h-4 w-4" />
          ) : sortState === "desc" ? (
            <ArrowDown className="ml-2 h-4 w-4" />
          ) : (
            <ArrowUpDown className="ml-2 h-4 w-4" />
          )}
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
