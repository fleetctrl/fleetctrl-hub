"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/trpc/react";

type RowOptionsProps = {
  rustdeskId?: number;
  computerId: string;
};
export default function RowOptions({ rustdeskId, computerId }: RowOptionsProps) {
  const utils = api.useUtils();
  const deleteMutation = api.rustdesk.delete.useMutation({
    async onSuccess() {
      await utils.rustdesk.get.invalidate();
      toast.success("Computer deleted");
    },
    onError() {
      toast.error("Unable to delete computer");
    },
  });
  async function handleCopy() {
    const connectionString = `"C:\\Program Files\\RustDesk\\RustDesk.exe" --connect ${rustdeskId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(connectionString);
        toast.success("Kopírování probehl úspěšně");
      } else {
        toast.error("Kopírování selhalo");
      }
    } catch (error) {
      console.error(error);
      toast.error("Kopírování selhalo");
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ id: computerId });
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy}>
          Connection string
        </DropdownMenuItem>
        <Link href={`/admin/rustdesk/computer/${computerId}`}>
          <DropdownMenuItem>Computer info</DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={handleDelete}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
