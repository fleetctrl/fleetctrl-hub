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
import { api } from "@/trpc/react";
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

    const setActiveMutation = api.clientUpdate.setActive.useMutation({
        onSuccess: () => {
            toast.success("Version activated");
            onActionComplete?.();
        },
        onError: (error) => {
            toast.error("Failed to activate version: " + error.message);
        },
    });

    const deactivateMutation = api.clientUpdate.deactivate.useMutation({
        onSuccess: () => {
            toast.success("Version deactivated");
            onActionComplete?.();
        },
        onError: (error) => {
            toast.error("Failed to deactivate version: " + error.message);
        },
    });

    const deleteMutation = api.clientUpdate.delete.useMutation({
        onSuccess: () => {
            toast.success("Version deleted");
            onActionComplete?.();
        },
        onError: (error) => {
            toast.error("Failed to delete version: " + error.message);
        },
    });

    const handleActivate = () => {
        setActiveMutation.mutate({ id: versionId });
    };

    const handleDeactivate = () => {
        deactivateMutation.mutate({ id: versionId });
    };

    const handleDelete = () => {
        deleteMutation.mutate({ id: versionId });
        setDeleteDialogOpen(false);
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
                            disabled={deactivateMutation.isPending}
                        >
                            <Pause className="mr-2 h-4 w-4" />
                            Deactivate
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={handleActivate}
                            disabled={setActiveMutation.isPending}
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
