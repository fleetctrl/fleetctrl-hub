"use client";

import { useState } from "react";
import { MoreHorizontal, Play, Pause, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

interface RowOptionsProps {
    versionId: string;
    isActive: boolean;
    onActionComplete?: () => Promise<unknown> | void;
}

export default function RowOptions({
    versionId,
    isActive,
    onActionComplete,
}: RowOptionsProps) {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const setActive = useMutation(api.client_updates.setActive);
    const deleteVersion = useMutation(api.client_updates.deleteVersion);

    // Convex doesn't have "deactivate" specific mutation in my implementation,
    // `setActive` deactivates others. To just deactivate, we can set active to nothing?
    // Or maybe we just allow "Set Active" which implies others are inactive.
    // The previous code had `deactivate`.
    // I will implement a check: if it is active, and I click Deactivate, I might need to unset it.
    // But `setActive` sets ONE as active.
    // Let's assume we just implement Set Active for now or I update backend to support toggle.
    // Actually, `setActive` logic was: deactivate all, then activate target.
    // I should probably add `deactivate` to backend if I want that feature.
    // For now, let's just make "Set Active" work.

    const handleActivate = async () => {
        try {
            await setActive({ id: versionId as Id<"client_updates"> });
            toast.success("Version activated");
        } catch(e: any) {
            toast.error("Failed: " + e.message);
        }
    };

    const handleDeactivate = async () => {
        // Not implemented in backend yet, skipping for now or treat as TODO
        toast.info("Deactivation not implemented yet, activate another version instead.");
    };

    const handleDelete = async () => {
        try {
            await deleteVersion({ id: versionId as Id<"client_updates"> });
            toast.success("Version deleted");
            setDeleteDialogOpen(false);
        } catch(e: any) {
            toast.error("Failed: " + e.message);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {isActive ? (
                        <DropdownMenuItem
                            onClick={handleDeactivate}
                            // disabled
                        >
                            <Pause className="mr-2 h-4 w-4" />
                            Deactivate
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={handleActivate}
                        >
                            <Play className="mr-2 h-4 w-4" />
                            Set as Active
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                        disabled={isActive}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this version?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this client version and its binary
                            file. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
