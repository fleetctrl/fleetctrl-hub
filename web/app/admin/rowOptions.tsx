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

type RowOptionsProps = {
  computerId?: string;
  rustdeskId?: number;
};
export default function RowOptions(RowOptionsProps: RowOptionsProps) {
  const handleCopy = async () => {
    const connectionString = `"C:\Program Files\RustDesk\RustDesk.exe" --connect ${RowOptionsProps.rustdeskId}`;
    try {
      await navigator.clipboard.writeText(connectionString);
      toast.success("Kopírování probehl úspěšně");
    } catch (error) {
      console.error(error);
      toast.error("Kopírování selhalo");
    }
  };

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
        <DropdownMenuItem onClick={void handleCopy}>
          Connection string
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <a href={`/admin/computer/${RowOptionsProps.rustdeskId}`}>
          <DropdownMenuItem>Computer info</DropdownMenuItem>
        </a>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
