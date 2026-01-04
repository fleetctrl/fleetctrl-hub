"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { EditReleaseSheet } from "./edit-release-sheet";
import { MoreHorizontal, Pen, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
import { useRouter } from "next/navigation";

interface Release {
    id: string;
    version: string;
    created_at: string;
    installer_type: string;
    disabled_at: string | null;
    uninstall_previous?: boolean;
    computer_group_releases?: {
        assign_type: string;
        action: string;
        computer_groups: {
            id: string;
            display_name: string;
        } | { id: string; display_name: string; }[] | null;
    }[];
}

interface ReleasesTableProps {
    releases: Release[];
    appId: string;
    isAutoUpdate?: boolean;
}

const formatDateTime = (isoDate: string) =>
    new Date(isoDate).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
    });

function AssignmentsBadges({ release }: { release: Release }) {
    const groups = release.computer_group_releases || [];

    if (groups.length === 0) {
        return <span className="text-sm text-muted-foreground">No groups</span>;
    }

    const visibleGroups = groups.slice(0, 2);
    const remainingCount = groups.length - visibleGroups.length;

    const getGroupName = (cg: { id: string; display_name: string; } | { id: string; display_name: string; }[] | null | undefined) => {
        if (!cg) return "Unknown";
        if (Array.isArray(cg)) {
            return cg[0]?.display_name || "Unknown";
        }
        return cg.display_name || "Unknown";
    };

    return (
        <div className="flex flex-wrap items-center gap-1">
            {visibleGroups.map((g, index) => (
                <Badge
                    key={index}
                    variant="outline"
                    className="max-w-[8rem] truncate text-xs"
                >
                    {getGroupName(g.computer_groups)}
                </Badge>
            ))}
            {remainingCount > 0 && (
                <Badge variant="secondary" className="text-xs">+{remainingCount}</Badge>
            )}
        </div>
    );
}

export function ReleasesTable({ releases, appId, isAutoUpdate = false }: ReleasesTableProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [releaseToDelete, setReleaseToDelete] = useState<Release | null>(null);

    const deleteMutation = api.app.deleteRelease.useMutation({
        onSuccess: () => {
            toast.success("Release deleted successfully");
            router.refresh();
            utils.app.getReleases.invalidate({ appId });
        },
        onError: (error) => {
            toast.error(`Error deleting release: ${error.message}`);
        },
    });

    const handleEditClick = (release: Release) => {
        setSelectedRelease(release);
        setIsEditSheetOpen(true);
    };

    const handleDeleteClick = (release: Release) => {
        setReleaseToDelete(release);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = () => {
        if (releaseToDelete) {
            deleteMutation.mutate({ id: releaseToDelete.id });
        }
        setDeleteDialogOpen(false);
        setReleaseToDelete(null);
    };

    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[100px]">Version</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Assignments</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {releases.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                No releases found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        releases.map((release) => (
                            <TableRow key={release.id}>
                                <TableCell className="font-medium">{release.version !== "" ? release.version : "latest"}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="font-normal">
                                        {release.installer_type}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <AssignmentsBadges release={release} />
                                </TableCell>
                                <TableCell>{formatDateTime(release.created_at)}</TableCell>
                                <TableCell className="text-right">
                                    {release.disabled_at ? (
                                        <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/20">
                                            Disabled
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400">
                                            Active
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => handleEditClick(release)}>
                                                <Pen className="mr-2 h-4 w-4" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => handleDeleteClick(release)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <EditReleaseSheet
                appId={appId}
                isAutoUpdate={isAutoUpdate}
                release={selectedRelease}
                open={isEditSheetOpen}
                onOpenChange={setIsEditSheetOpen}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            release &quot;{releaseToDelete?.version || "latest"}&quot; and all its assignments.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>
                            Continue
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
