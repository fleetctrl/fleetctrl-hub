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

interface Release {
    id: string;
    version: string;
    created_at: string;
    installer_type: string;
    disabled_at: string | null;
}

interface ReleasesTableProps {
    releases: Release[];
}

const formatDateTime = (isoDate: string) =>
    new Date(isoDate).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
    });

export function ReleasesTable({ releases }: ReleasesTableProps) {
    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[100px]">Version</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {releases.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
