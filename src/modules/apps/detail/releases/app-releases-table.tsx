"use client";

import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AppReleaseSheet } from "./app-release-sheet";
import { MoreHorizontal, Pen, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { VirtualTable } from "@/components/virtual-table";

export interface Release {
  id: string;
  version: string;
  created_at: string | number;
  installer_type: string;
  disabled_at?: string | number | null;
  uninstall_previous?: boolean;
  computer_group_releases?: {
    assign_type: string;
    action: string;
    computer_groups: {
      _id: string;
      display_name: string;
    } | null;
  }[];
  dynamic_group_releases?: {
    assign_type: string;
    action: string;
    dynamic_computer_groups: {
      _id: string;
      display_name: string;
    } | null;
  }[];
  staticAssignments?: unknown[];
  dynamicAssignments?: unknown[];
  detection_rules?: {
    type: string;
    config: unknown;
  }[];
  detections?: unknown[];
  release_requirements?: {
    timeout_seconds: number;
    run_as_system: boolean;
    storage_id: string;
    byte_size?: number;
    hash: string;
  }[];
  win32_releases?: {
    install_script: string;
    uninstall_script: string;
    install_binary_storage_id: string;
    install_binary_size?: number;
    hash: string;
  }[];
  winget_releases?: {
    winget_id: string;
  }[];
}

interface ReleasesTableProps {
  releases: Release[];
  appId: string;
  isAutoUpdate?: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const formatDateTime = (date: string | number) =>
  new Date(date).toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function AssignmentsBadges({ release }: { release: Release }) {
  const staticGroups = release.computer_group_releases || [];
  const dynamicGroups = release.dynamic_group_releases || [];

  if (staticGroups.length === 0 && dynamicGroups.length === 0) {
    return <span className="text-sm text-muted-foreground">No groups</span>;
  }

  const getGroupName = (cg: any) => {
    if (!cg) return "Unknown";
    return cg.display_name || "Unknown";
  };

  function indexForID(cg: any) {
    if (!cg) return Math.random().toString();
    return cg._id || Math.random().toString();
  }

  const allGroupItems = [
    ...staticGroups.map((g) => ({
      name: getGroupName(g.computer_groups),
      id: indexForID(g.computer_groups),
    })),
    ...dynamicGroups.map((g) => ({
      name: getGroupName(g.dynamic_computer_groups),
      id: indexForID(g.dynamic_computer_groups),
    })),
  ];

  const visibleGroups = allGroupItems.slice(0, 2);
  const remainingCount = allGroupItems.length - visibleGroups.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleGroups.map((g, index) => (
        <Badge
          key={index}
          variant="outline"
          className="max-w-32 truncate text-xs"
        >
          {g.name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

export function AppReleasesTable({
  releases,
  appId,
  isAutoUpdate = false,
  isInitialLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: ReleasesTableProps) {
  const router = useRouter();
  const deleteRelease = useMutation(api.apps.deleteRelease);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [releaseToDelete, setReleaseToDelete] = useState<Release | null>(null);

  const handleEditClick = (release: Release) => {
    setSelectedRelease(release);
    setIsEditSheetOpen(true);
  };

  const handleDeleteClick = (release: Release) => {
    setReleaseToDelete(release);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (releaseToDelete) {
      try {
        await deleteRelease({ id: releaseToDelete.id as Id<"releases"> });
        toast.success("Release deleted successfully");
        router.refresh();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(`Error deleting release: ${message}`);
      }
    }
    setDeleteDialogOpen(false);
    setReleaseToDelete(null);
  };

  const columns = useMemo<ColumnDef<Release>[]>(() => [
    { accessorKey: "version", size: 120, header: "Version", cell: ({ row }) => <span className="font-medium">{row.original.version || "latest"}</span> },
    { accessorKey: "installer_type", size: 120, header: "Type", cell: ({ row }) => <Badge variant="outline" className="font-normal">{row.original.installer_type}</Badge> },
    { id: "assignments", size: 240, header: "Assignments", cell: ({ row }) => <AssignmentsBadges release={row.original} /> },
    { accessorKey: "created_at", size: 190, header: "Created", cell: ({ row }) => formatDateTime(row.original.created_at) },
    { id: "status", size: 60, header: "Status", cell: ({ row }) => row.original.disabled_at ? <Badge variant="secondary">Disabled</Badge> : <Badge>Active</Badge> },
    {
      id: "actions", size: 60, header: "", cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><span className="sr-only">Open menu</span><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleEditClick(row.original)}><Pen data-icon="inline-start" />Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleDeleteClick(row.original)} className="text-destructive focus:text-destructive"><Trash2 data-icon="inline-start" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  ], []);
  const table = useReactTable({ data: releases, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });

  return (
    <div className="flex flex-col gap-4">
      <VirtualTable
        table={table}
        ariaLabel="App releases"
        emptyMessage="No releases found."
        isInitialLoading={isInitialLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        pinnedStartColumns={1}
        pinnedEndColumns={1}
      />

      <AppReleaseSheet
        appId={appId}
        isAutoUpdate={isAutoUpdate}
        release={selectedRelease}
        open={isEditSheetOpen}
        onOpenChange={setIsEditSheetOpen}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              release &quot;{releaseToDelete?.version || "latest"}&quot; and all
              its assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
