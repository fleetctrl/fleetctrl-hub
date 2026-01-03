"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { columns, type AppRow, type AppsTableMeta } from "./columns";
import { api } from "@/trpc/react";
import Link from "next/link";

type DialogState = null;

const formatDateTime = (isoDate: string) =>
  new Date(isoDate).toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });



export function AppsTable() {
  const { data: apps, refetch } = api.app.getTableData.useQuery(undefined, {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const appRows: AppRow[] = useMemo(() => {
    if (!apps) {
      return [];
    }
    return apps.map((app) => ({
      id: app.id,
      displayName: app.displayName,
      groups: app.groups,
      groupsCount: app.groupsCount,
      createdAtFormatted: formatDateTime(app.createdAt),
      updatedAtFormatted: formatDateTime(app.updatedAt),
    }));
  }, [apps]);

  const openEditDialog = (appId: string) => {
    // Navigate to edit page or open edit sheet if we had one here
    // For now we navigate to the app details page where edit resides
    window.location.href = `/admin/apps/${appId}`;
  };

  const table = useReactTable<AppRow>({
    data: appRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: openEditDialog,
      onActionComplete: () => {
        refetch();
      },
    } satisfies AppsTableMeta,
  });

  const hasApps = appRows.length > 0;

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Apps</h2>
          <p className="text-sm text-muted-foreground">
            Create and deploy computer apps to groups of computers
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/apps/create">Create app</Link>
        </Button>
      </div>
      {hasApps ? (
        <Card>
          <CardContent className="p-0">
            <Table className="">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-sm text-muted-foreground">
              No apps yet. Create one to start organizing computers.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
