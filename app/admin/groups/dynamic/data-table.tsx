"use client";

import { useEffect, useMemo, useState } from "react";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
    columns,
    type DynamicGroupRow,
    type DynamicGroupsTableMeta,
} from "./columns";
import {
    RuleBuilder,
    ruleExpressionFormSchema,
    type RuleExpressionFormValues,
    formToApiFormat,
    apiToFormFormat,
} from "@/components/dynamic-group-rule-builder";

type DialogState =
    | { mode: "create" }
    | { mode: "edit"; groupId: string };

const formatDateTime = (isoDate: string | null) =>
    isoDate
        ? new Date(isoDate).toLocaleString("cs-CZ", {
            dateStyle: "medium",
            timeStyle: "short",
        })
        : null;

const groupFormSchema = z.object({
    id: z.string().optional(),
    displayName: z.string().trim().min(1, "Please provide a group name."),
    description: z.string().optional(),
    ruleExpression: ruleExpressionFormSchema,
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

export function DynamicGroupsTable() {
    // Convex queries - automatically reactive!
    const groups = useQuery(api.groups.getAll);

    // Convex mutations
    const createGroup = useMutation(api.groups.createDynamicGroup);
    const updateGroup = useMutation(api.groups.updateDynamicGroup);
    const deleteGroup = useMutation(api.groups.deleteDynamicGroup);
    const refreshGroups = useMutation(api.groups.refreshAll);

    // State
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const groupRows: DynamicGroupRow[] = useMemo(() => {
        if (!groups) return [];
        return groups.map((group) => ({
            id: group.id,
            displayName: group.displayName,
            description: group.description ?? null,
            memberCount: group.memberCount,
            createdAtFormatted: formatDateTime(group.createdAt) ?? "",
            updatedAtFormatted: formatDateTime(group.updatedAt) ?? "",
            lastEvaluatedAtFormatted: formatDateTime(group.lastEvaluatedAt),
        }));
    }, [groups]);

    const [dialogState, setDialogState] = useState<DialogState | null>(null);
    const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
    const [viewMembersGroupId, setViewMembersGroupId] = useState<string | null>(null);

    // Query for members when dialog is open
    const membersData = useQuery(
        api.groups.getMembers,
        viewMembersGroupId ? { id: viewMembersGroupId as Id<"dynamic_computer_groups"> } : "skip"
    );
    const membersLoading = viewMembersGroupId && membersData === undefined;

    const defaultRuleExpression: RuleExpressionFormValues = {
        logic: "AND",
        groups: [
            {
                logic: "AND",
                conditions: [{ property: "name", operator: "contains", value: "" }],
            },
        ],
    };

    const form = useForm<GroupFormValues>({
        resolver: zodResolver(groupFormSchema),
        defaultValues: {
            displayName: "",
            description: "",
            ruleExpression: defaultRuleExpression,
        },
    });

    // Fetch full group details when editing
    const editingGroupId =
        dialogState?.mode === "edit" ? dialogState.groupId : null;
    const editingGroup = useQuery(
        api.groups.getById,
        editingGroupId ? { id: editingGroupId as Id<"dynamic_computer_groups"> } : "skip"
    );

    // Update form when editing group data loads
    useEffect(() => {
        if (editingGroup && dialogState?.mode === "edit") {
            form.reset({
                id: editingGroup.id,
                displayName: editingGroup.displayName,
                description: editingGroup.description ?? "",
                ruleExpression: apiToFormFormat(editingGroup.ruleExpression),
            });
        }
    }, [editingGroup, dialogState?.mode, form]);

    const openCreateDialog = () => {
        form.reset({
            displayName: "",
            description: "",
            ruleExpression: defaultRuleExpression,
        });
        setDialogState({ mode: "create" });
    };

    const openEditDialog = (groupId: string) => {
        setDialogState({ mode: "edit", groupId });
    };

    const closeDialog = () => {
        setDialogState(null);
        form.reset({
            displayName: "",
            description: "",
            ruleExpression: defaultRuleExpression,
        });
    };

    const onSubmit = async (values: GroupFormValues) => {
        const apiRuleExpression = formToApiFormat(values.ruleExpression);

        try {
            if (dialogState?.mode === "create") {
                setIsCreating(true);
                await createGroup({
                    displayName: values.displayName,
                    description: values.description,
                    ruleExpression: apiRuleExpression,
                });
                toast.success("Dynamic group created");
            } else if (dialogState?.mode === "edit" && values.id) {
                setIsUpdating(true);
                await updateGroup({
                    id: values.id as Id<"dynamic_computer_groups">,
                    displayName: values.displayName,
                    description: values.description,
                    ruleExpression: apiRuleExpression,
                });
                toast.success("Dynamic group updated");
            }
            closeDialog();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "An error occurred";
            toast.error(message);
        } finally {
            setIsCreating(false);
            setIsUpdating(false);
        }
    };

    const handleDelete = async () => {
        if (deleteGroupId) {
            try {
                setIsDeleting(true);
                await deleteGroup({ id: deleteGroupId as Id<"dynamic_computer_groups"> });
                toast.success("Dynamic group deleted");
                setDeleteGroupId(null);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "An error occurred";
                toast.error(message);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const handleRefresh = async () => {
        try {
            setIsRefreshing(true);
            await refreshGroups();
            toast.success("Memberships refreshed");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "An error occurred";
            toast.error(message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const table = useReactTable<DynamicGroupRow>({
        data: groupRows,
        columns,
        getCoreRowModel: getCoreRowModel(),
        meta: {
            onEdit: openEditDialog,
            onDelete: setDeleteGroupId,
            onViewMembers: setViewMembersGroupId,
        } satisfies DynamicGroupsTableMeta,
    });

    const hasGroups = groupRows.length > 0;
    const isDialogOpen = dialogState !== null;
    const isLoading = isCreating || isUpdating || isDeleting;

    // Convex queries are automatically reactive - no subscription needed!

    return (
        <div className="flex w-full flex-col gap-4 pb-10">
            {/* Tab navigation */}
            <div className="flex gap-1 border-b">
                <a
                    href="/admin/groups/static"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    Static Groups
                </a>
                <a
                    href="/admin/groups/dynamic"
                    className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
                >
                    Dynamic Groups
                </a>
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Dynamic Computer Groups</h2>
                        <p className="text-sm text-muted-foreground">
                            Define rules that automatically assign computers to groups based on
                            their properties.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button onClick={openCreateDialog}>Create dynamic group</Button>
                    </div>
                </div>

                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <DialogHeader className="space-y-2">
                                <DialogTitle>
                                    {dialogState?.mode === "edit"
                                        ? "Edit dynamic group"
                                        : "Create dynamic group"}
                                </DialogTitle>
                                <DialogDescription>
                                    Define the rules that determine which computers belong to this
                                    group.
                                </DialogDescription>
                            </DialogHeader>

                            {dialogState?.mode === "edit" && (
                                <FormField
                                    control={form.control}
                                    name="id"
                                    render={({ field }) => (
                                        <FormItem className="hidden">
                                            <FormControl>
                                                <Input {...field} value={field.value ?? ""} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="displayName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Group name</FormLabel>
                                        <FormControl>
                                            <Input
                                                autoFocus
                                                placeholder="e.g. Windows 11 Devices"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description (optional)</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Describe the purpose of this group..."
                                                className="resize-none"
                                                rows={2}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="ruleExpression"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Membership rules</FormLabel>
                                        <FormControl>
                                            <RuleBuilder
                                                value={field.value}
                                                onChange={field.onChange}
                                                disabled={isLoading}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <DialogFooter className="sm:justify-between">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={closeDialog}
                                    disabled={isLoading}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isLoading}>
                                    {dialogState?.mode === "edit"
                                        ? "Save changes"
                                        : "Create group"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog
                open={!!deleteGroupId}
                onOpenChange={(open) => !open && setDeleteGroupId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete dynamic group?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. The group will be permanently deleted.
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

            {/* Data Table */}
            {hasGroups ? (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="text-sm text-muted-foreground">
                            No dynamic groups yet. Create one to automatically group computers
                            based on their properties.
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* View Members Dialog */}
            <Dialog
                open={!!viewMembersGroupId}
                onOpenChange={(open) => !open && setViewMembersGroupId(null)}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Group Members</DialogTitle>
                        <DialogDescription>
                            Computers that match the group rules.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {membersLoading ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                Loading members...
                            </div>
                        ) : membersData && membersData.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Computer Name</TableHead>
                                        <TableHead>OS</TableHead>
                                        <TableHead>IP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {membersData.map((member) => (
                                        <TableRow key={member.computerId}>
                                            <TableCell className="font-medium">
                                                {member.computer?.name ?? "Unknown"}
                                            </TableCell>
                                            <TableCell>
                                                {member.computer?.os ?? "-"}
                                            </TableCell>
                                            <TableCell>
                                                {member.computer?.ip ?? "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                No members match the group rules.
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewMembersGroupId(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
