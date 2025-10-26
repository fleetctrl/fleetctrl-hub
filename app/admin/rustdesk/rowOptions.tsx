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
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type RowOptionsProps = {
  rustdeskId?: number;
  computerId: string;
};
export default function RowOptions({
  rustdeskId,
  computerId,
}: RowOptionsProps) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => e.preventDefault()}
            >
              Delete
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                computer and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
