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
import { createClient } from "@/lib/supabase/client";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type RowOptionsProps = {
  rustdeskId?: number;
};
export default function RowOptions({ rustdeskId }: RowOptionsProps) {
  const supabase = createClient();
  const router = useRouter();
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
    const { error } = await supabase
      .from("computers")
      .delete()
      .eq("rustdesk_id", rustdeskId);

    if (error) {
      toast.error("Unable to delete computer: " + error.message);
      return;
    }

    toast.success("Computer deleted");
    router.refresh();
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
        <DropdownMenuItem onClick={handleCopy}>
          Connection string
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <a href={`/admin/computer/${rustdeskId}`}>
          <DropdownMenuItem>Computer info</DropdownMenuItem>
        </a>
        <DropdownMenuSeparator />
        {rustdeskId && (
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
