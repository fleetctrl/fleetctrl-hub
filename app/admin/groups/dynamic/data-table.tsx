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

import { api } from "@/trpc/react";
import { createSupabaseClient } from "@/lib/supabase/client";
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
    const utils = api.useUtils();
    const { data: groups, refetch } = api.dynamicGroup.getAll.useQuery(undefined, {
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
    });

    const createMutation = api.dynamicGroup.create.useMutation({
        onSuccess: () => {
            toast.success("Dynamic group created");
            utils.dynamicGroup.invalidate();
            refetch();
        },
        onError: (error) => toast.error(error.message),
    });

    const updateMutation = api.dynamicGroup.update.useMutation({
        onSuccess: () => {
            toast.success("Dynamic group updated");
            utils.dynamicGroup.invalidate();
            refetch();
        },
        onError: (error) => toast.error(error.message),
    });

    const deleteMutation = api.dynamicGroup.delete.useMutation({
        onSuccess: () => {
            toast.success("Dynamic group deleted");
            utils.dynamicGroup.invalidate();
            refetch();
        },
        onError: (error) => toast.error(error.message),
    });

    const refreshMutation = api.dynamicGroup.refreshAll.useMutation({
        onSuccess: () => {
            toast.success("Memberships refreshed");
            refetch();
        },
        onError: (error) => toast.error(error.message),
    });

    const groupRows: DynamicGroupRow[] = useMemo(() => {
        if (!groups) return [];
        return groups.map((group) => ({
            id: group.id,
            displayName: group.displayName,
            description: group.description,
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
    const { data: membersData, isLoading: membersLoading } = api.dynamicGroup.getMembers.useQuery(
        { id: viewMembersGroupId! },
        { enabled: !!viewMembersGroupId }
    );

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
    const { data: editingGroup } = api.dynamicGroup.getById.useQuery(
        { id: editingGroupId! },
        { enabled: !!editingGroupId }
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

        if (dialogState?.mode === "create") {
            await createMutation.mutateAsync({
                name: values.displayName,
                description: values.description,
                ruleExpression: apiRuleExpression as any,
            });
        } else if (dialogState?.mode === "edit" && values.id) {
            await updateMutation.mutateAsync({
                id: values.id,
                name: values.displayName,
                description: values.description,
                ruleExpression: apiRuleExpression as any,
            });
        }

        closeDialog();
    };

    const handleDelete = async () => {
        if (deleteGroupId) {
            await deleteMutation.mutateAsync({ id: deleteGroupId });
            setDeleteGroupId(null);
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
    const isLoading =
        createMutation.isPending ||
        updateMutation.isPending ||
        deleteMutation.isPending;

    // Realtime subscription
    useEffect(() => {
        const supabase = createSupabaseClient();
        const channel = supabase
            .channel("dynamic-group-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "dynamic_computer_groups" },
                () => refetch()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "dynamic_group_members" },
                () => refetch()
            );

        channel.subscribe();

        return () => {
            channel.unsubscribe();
            supabase.removeChannel(channel);
        };
    }, [refetch]);

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
                            onClick={() => refreshMutation.mutate()}
                            disabled={refreshMutation.isPending}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
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
