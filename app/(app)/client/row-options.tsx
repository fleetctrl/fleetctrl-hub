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
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

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
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const setActive = useMutation(api.clientUpdates.setActive);
    const deactivate = useMutation(api.clientUpdates.deactivate);
    const remove = useMutation(api.clientUpdates.remove);

    const handleActivate = async () => {
        setActionLoading("activate");
        try {
            await setActive({ id: versionId as Id<"client_updates"> });
            toast.success("Version activated");
            onActionComplete?.();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error("Failed to activate version: " + message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeactivate = async () => {
        setActionLoading("deactivate");
        try {
            await deactivate({ id: versionId as Id<"client_updates"> });
            toast.success("Version deactivated");
            onActionComplete?.();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error("Failed to deactivate version: " + message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async () => {
        setActionLoading("delete");
        try {
            await remove({ id: versionId as Id<"client_updates"> });
            toast.success("Version deleted");
            onActionComplete?.();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error("Failed to delete version: " + message);
        } finally {
            setActionLoading(null);
            setDeleteDialogOpen(false);
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
                            disabled={actionLoading === "deactivate"}
                        >
                            <Pause className="mr-2 h-4 w-4" />
                            Deactivate
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={handleActivate}
                            disabled={actionLoading === "activate"}
                        >
                            <Play className="mr-2 h-4 w-4" />
                            Set as Active
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                        disabled={isActive || actionLoading === "delete"}
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
                            disabled={actionLoading === "delete"}
                        >
                            {actionLoading === "delete" ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
