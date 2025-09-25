"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/trpc/react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type RowOptionsProps = {
  tokenID: string
};
export default function RowOptions({ tokenID }: RowOptionsProps) {
  const router = useRouter();

  const deleteMutation = api.key.delete.useMutation()

  async function handleDelete() {
    deleteMutation.mutate({id: tokenID})

    if (deleteMutation.isError) {
      toast.error("Error deleting key")
      return
    }
    toast.success("Key was deleted")
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
