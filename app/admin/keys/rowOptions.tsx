"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/trpc/react";

type RowOptionsProps = {
  tokenID: string
};
export default function RowOptions({ tokenID }: RowOptionsProps) {
  const router = useRouter();
  const deleteKey = api.keys.delete.useMutation({
    async onSuccess() {
      toast.success("Key was deleted");
      router.refresh();
    },
    onError(error) {
      toast.error("Error deleting key: " + error.message);
    },
  });

  async function handleDelete() {
    try {
      await deleteKey.mutateAsync({ tokenHash: tokenID });
    } catch {
      // Error handled in onError callback.
    }
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

        <DropdownMenuItem
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteKey.isPending}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
