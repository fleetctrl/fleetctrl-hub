import { useMemo } from "react";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VirtualTable } from "@/components/virtual-table";

type Item = {
  id: string;
  computerName: string;
  releaseVersion: string;
  status: "PENDING" | "INSTALLING" | "INSTALLED" | "ERROR" | "UNINSTALLED";
  statusUpdatedAt?: number;
  reinstallRequestedAt?: number;
  error?: string;
};

const formatDateTime = (value?: number) => value ? new Date(value).toLocaleString("cs-CZ") : "-";

const canReinstall = (item: Item) => item.status === "INSTALLED" || item.status === "ERROR";

export function DeviceInstallStatusTable({ items, isInitialLoading, isLoadingMore, hasMore, onLoadMore }: {
  items: Item[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const requestReinstall = useMutation(api.apps.requestReinstall);

  const columns = useMemo<ColumnDef<Item>[]>(() => {
    async function handleReinstall(item: Item) {
      try {
        await requestReinstall({ installId: item.id as Id<"computer_apps_installs"> });
        toast.success(`Reinstall requested on ${item.computerName}`);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to request reinstall");
      }
    }

    return [
      { accessorKey: "computerName", size: 300, header: "Computer", cell: ({ row }) => <span className="font-medium">{row.original.computerName}</span> },
      { accessorKey: "releaseVersion", size: 160, header: "Release" },
      {
        accessorKey: "status", size: 240, header: "Status", cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.status === "ERROR"
              ? <InstallErrorDialog item={row.original} />
              : <Badge variant="secondary">{row.original.status}</Badge>}
            {row.original.reinstallRequestedAt !== undefined && <Badge variant="outline">Reinstall pending</Badge>}
          </div>
        ),
      },
      { accessorKey: "statusUpdatedAt", size: 220, header: "Status updated", cell: ({ row }) => formatDateTime(row.original.statusUpdatedAt) },
      {
        id: "actions", size: 140, header: "", cell: ({ row }) => canReinstall(row.original) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={row.original.reinstallRequestedAt !== undefined}
            onClick={() => handleReinstall(row.original)}
          >
            <RotateCcw /> Reinstall
          </Button>
        ),
      },
    ];
  }, [requestReinstall]);
  
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id });
  
  return <VirtualTable
    table={table}
    ariaLabel="Device install status"
    emptyMessage="No device install data for this app yet."
    isInitialLoading={isInitialLoading}
    isLoadingMore={isLoadingMore}
    hasMore={hasMore}
    onLoadMore={onLoadMore}
  />;
}

function InstallErrorDialog({ item }: { item: Item }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(badgeVariants({ variant: "destructive" }), "cursor-pointer hover:opacity-80")}
          title="Show error details"
        >
          <CircleAlert /> ERROR
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Installation error</DialogTitle>
          <DialogDescription>
            {item.computerName} · release {item.releaseVersion} · {formatDateTime(item.statusUpdatedAt)}
          </DialogDescription>
        </DialogHeader>
        {item.error ? (
          <pre className="max-h-96 overflow-auto rounded-sm border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
            {item.error}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            The client did not report any details. It may be running an older version that does not send error messages.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
