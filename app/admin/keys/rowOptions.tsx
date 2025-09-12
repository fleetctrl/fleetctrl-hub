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
import { Axe, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type RowOptionsProps = {
  tokenID: string
};
export default function RowOptions({ tokenID }: RowOptionsProps) {
  const supabase = createClient();
  const router = useRouter();

  console.log(tokenID)

  async function handleDelete() {
    const { error } = await supabase.from("enrollment_tokens").delete().eq("token_hash", tokenID)
    if (error) {
      toast.error("Error deleting key")
      return
    }
    toast.success("Key was deleted")
    router.refresh()
  }

  // async function handleDelete() {
  //   const { error } = await supabase
  //     .from("computers")
  //     .delete()
  //     .eq("id", computerId);

  //   if (error) {
  //     toast.error("Unable to delete computer: " + error.message);
  //     return;
  //   }

  //   toast.success("Computer deleted");
  //   router.refresh();
  // }

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
