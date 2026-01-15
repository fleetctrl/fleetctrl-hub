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
import { ReleaseSheet } from "./release-sheet";
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
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Release {
    id: string;
    version: string;
    created_at: string | number;
    installer_type: string;
    disabled_at?: string | number | null;
    uninstall_previous?: boolean;
    computer_group_releases?: {
        assign_type: string;
        action: string;
        computer_groups: {
            _id: string;
            display_name: string;
        } | null;
    }[];
    dynamic_group_releases?: {
        assign_type: string;
        action: string;
        dynamic_computer_groups: {
            _id: string;
            display_name: string;
        } | null;
    }[];
    staticAssignments?: unknown[];
    dynamicAssignments?: unknown[];
    detection_rules?: {
        type: string;
        config: unknown;
    }[];
    detections?: unknown[];
    release_requirements?: {
        timeout_seconds: number;
        run_as_system: boolean;
        storage_id: string;
        byte_size?: number;
        hash: string;
    }[];
    win32_releases?: {
        install_script: string;
        uninstall_script: string;
        install_binary_storage_id: string;
        install_binary_size?: number;
        hash: string;
    }[];
    winget_releases?: {
        winget_id: string;
    }[];
}

interface ReleasesTableProps {
    releases: Release[];
    appId: string;
    isAutoUpdate?: boolean;
}

const formatDateTime = (date: string | number) =>
    new Date(date).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
    });

function AssignmentsBadges({ release }: { release: Release }) {
    const staticGroups = release.computer_group_releases || [];
    const dynamicGroups = release.dynamic_group_releases || [];

    if (staticGroups.length === 0 && dynamicGroups.length === 0) {
        return <span className="text-sm text-muted-foreground">No groups</span>;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getGroupName = (cg: any) => {
        if (!cg) return "Unknown";
        return cg.display_name || "Unknown";
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function indexForID(cg: any) {
        if (!cg) return Math.random().toString();
        return cg._id || Math.random().toString();
    }

    const allGroupItems = [
        ...staticGroups.map(g => ({ name: getGroupName(g.computer_groups), id: indexForID(g.computer_groups) })),
        ...dynamicGroups.map(g => ({ name: getGroupName(g.dynamic_computer_groups), id: indexForID(g.dynamic_computer_groups) }))
    ];

    const visibleGroups = allGroupItems.slice(0, 2);
    const remainingCount = allGroupItems.length - visibleGroups.length;

    return (
        <div className="flex flex-wrap items-center gap-1">
            {visibleGroups.map((g, index) => (
                <Badge
                    key={index}
                    variant="outline"
                    className="max-w-[8rem] truncate text-xs"
                >
                    {g.name}
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
    const deleteRelease = useMutation(api.apps.deleteRelease);
    const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [releaseToDelete, setReleaseToDelete] = useState<Release | null>(null);

    const handleEditClick = (release: Release) => {
        setSelectedRelease(release);
        setIsEditSheetOpen(true);
    };

    const handleDeleteClick = (release: Release) => {
        setReleaseToDelete(release);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (releaseToDelete) {
            try {
                await deleteRelease({ id: releaseToDelete.id as Id<"releases"> });
                toast.success("Release deleted successfully");
                router.refresh();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Unknown error";
                toast.error(`Error deleting release: ${message}`);
            }
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

            <ReleaseSheet
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
