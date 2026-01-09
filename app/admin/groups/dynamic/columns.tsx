"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type DynamicGroupRow = {
    id: string;
    displayName: string;
    description: string | null;
    memberCount: number;
    createdAtFormatted: string;
    updatedAtFormatted: string;
    lastEvaluatedAtFormatted: string | null;
};

export type DynamicGroupsTableMeta = {
    onEdit: (groupId: string) => void;
    onDelete: (groupId: string) => void;
    onViewMembers: (groupId: string) => void;
};

export const columns: ColumnDef<DynamicGroupRow>[] = [
    {
        accessorKey: "displayName",
        header: "Name",
        cell: ({ row }) => (
            <div>
                <span className="font-medium">{row.original.displayName}</span>
                {row.original.description && (
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {row.original.description}
                    </p>
                )}
            </div>
        ),
    },
    {
        id: "members",
        header: "Members",
        cell: ({ row, table }) => {
            const meta = table.options.meta as DynamicGroupsTableMeta | undefined;
            return (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => meta?.onViewMembers(row.original.id)}
                >
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                        {row.original.memberCount} computers
                    </Badge>
                </Button>
            );
        },
    },
    {
        accessorKey: "lastEvaluatedAtFormatted",
        header: "Last Evaluated",
        cell: ({ row }) =>
            row.original.lastEvaluatedAtFormatted ?? (
                <span className="text-muted-foreground">Never</span>
            ),
    },
    {
        accessorKey: "updatedAtFormatted",
        header: "Last Updated",
    },
    {
        id: "actions",
        header: "",
        cell: ({ row, table }) => {
            const meta = table.options.meta as DynamicGroupsTableMeta | undefined;
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => meta?.onEdit(row.original.id)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => meta?.onDelete(row.original.id)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        },
    },
];
