"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type RowOptionsProps = {
  tokenID: string;
  onActionComplete?: () => Promise<unknown> | void;
};
export default function RowOptions({
  tokenID,
  onActionComplete,
}: RowOptionsProps) {
  const deleteMutation = api.key.delete.useMutation({
    async onSuccess() {
      toast.success("Computer deleted");
      await onActionComplete?.();
    },
    onError() {
      toast.error("Unable to delete computer");
    },
  });

  async function handleDelete() {
    deleteMutation.mutate({ id: tokenID });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only w-full">Open menu</span>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>

        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
