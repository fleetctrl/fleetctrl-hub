import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { VirtualSortableHeader } from "@/components/virtual-table";
import { cn, relativeTime } from "@/lib/utils";
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

const ONLINE_WINDOW = 5 * 60 * 1000;

export const computersColumns: ColumnDef<computer>[] = [
  {
    accessorKey: "lastConnection",
    size: 140,
    header: "Status",
    cell: ({ row }) => {
      const isOnline =
        typeof row.original.lastConnection === "number" &&
        Date.now() - row.original.lastConnection < ONLINE_WINDOW;

      return (
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              isOnline ? "bg-success" : "bg-muted-foreground/40",
            )}
            title={isOnline ? "Online" : "Offline"}
            aria-label={isOnline ? "Online" : "Offline"}
          />
          <span
            className={cn(
              "truncate text-xs",
              isOnline ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isOnline ? "Online" : relativeTime(row.original.lastConnection)}
          </span>
        </span>
      );
    },
  },
  {
    accessorKey: "name",
    size: 240,
    header: ({ column, table }) => {
      const isSearchActive = Boolean(
        (table.options.meta as { isSearchActive?: boolean } | undefined)
          ?.isSearchActive,
      );
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
        className="font-medium hover:text-primary hover:underline underline-offset-4"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "os",
    size: 220,
    header: ({ column, table }) => {
      const isSearchActive = Boolean(
        (table.options.meta as { isSearchActive?: boolean } | undefined)
          ?.isSearchActive,
      );
      return (
        <VirtualSortableHeader
          column={column}
          label="OS"
          disabled={isSearchActive}
          disabledReason="Sorting is disabled while searching"
        />
      );
    },
    cell: ({ row }) =>
      row.original.os ? (
        <span className="truncate">
          {row.original.os}
          {row.original.osVersion ? (
            <span className="text-muted-foreground">
              {" "}
              {row.original.osVersion}
            </span>
          ) : null}
        </span>
      ) : (
        "—"
      ),
  },
  {
    accessorKey: "rustdeskID",
    size: 110,
    header: "RustDesk ID",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.rustdeskID ?? "—"}</span>
    ),
  },
  {
    accessorKey: "loginUser",
    size: 160,
    header: "Login User",
    cell: ({ row }) => (
      <span className="truncate text-muted-foreground">
        {row.original.loginUser || "—"}
      </span>
    ),
  },
  {
    accessorKey: "clientVersion",
    size: 90,
    header: "Client",
    cell: ({ row }) =>
      row.original.clientVersion ? (
        <Badge variant="outline" className="tabular-nums">
          v{row.original.clientVersion.replace(/^v/, "")}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "actions",
    size: 56,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="mx-auto block">
        <RowOptions
          rustdeskId={row.original.rustdeskID}
          computerId={row.original.id}
        />
      </span>
    ),
  },
];
