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
import { toast } from "sonner";
import { api } from "@/trpc/react";

type RowOptionsProps = {
  groupId: string;
  onEdit?: () => void;
  onActionComplete?: () => Promise<unknown> | void;
};

export default function RowOptions({
  groupId,
  onEdit,
  onActionComplete,
}: RowOptionsProps) {
  const deleteMutation = api.group.delete.useMutation({
    onError: () => {
      toast.error("Unable to delete group");
    },
    onSuccess: async () => {
      toast.success("Group deleted");
      await onActionComplete?.();
    },
  });

  function handleDelete() {
    deleteMutation.mutate({ id: groupId });
  }

  function handleEdit() {
    onEdit?.();
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
        <DropdownMenuItem onClick={handleEdit}>Edit group</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
