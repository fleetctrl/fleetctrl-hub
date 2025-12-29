"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

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

import { columns, type GroupRow, type GroupsTableMeta } from "./columns";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { api } from "@/trpc/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { toast } from "sonner";
import Link from "next/link";

type DialogState = { mode: "create" } | { mode: "edit"; groupId: string };

const formatDateTime = (isoDate: string) =>
  new Date(isoDate).toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const groupFormSchema = z.object({
  id: z.string().optional(),
  displayName: z
    .string()
    .trim()
    .min(1, { message: "Please provide a group name." }),
  memberIds: z.array(z.string()),
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

export function AppsTable() {
  const { data: apps, refetch } = api.app.getTableData.useQuery(undefined, {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const createGroupMutation = api.group.create.useMutation({
    onSuccess: () => {
      toast.success("Group created");
    },
    onError: (error) => {
      console.error(error.message);
      toast.error(error.message);
    },
  });
  const editGroupMutation = api.group.edit.useMutation({
    onSuccess: () => {
      toast.success("Group updated");
      refetch();
    },
    onError: (error) => {
      console.error(error.message);
      toast.error(error.message);
    },
  });

  const groupRows: GroupRow[] = useMemo(() => {
    if (!apps) {
      return [];
    }
    return apps.map((apps) => ({
      id: apps.id,
      displayName: apps.displayName,
      members: apps.groups,
      memberCount: apps.groupsCount,
      createdAtFormatted: formatDateTime(apps.createdAt),
      updatedAtFormatted: formatDateTime(apps.updatedAt),
    }));
  }, [apps]);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      displayName: "",
      memberIds: [],
    },
  });


  const openEditDialog = (groupId: string) => {
    const group = apps?.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    form.reset({
      id: group.id,
      displayName: group.displayName,
      memberIds: [...group.groups.map((c) => c.id)],
    });
    setDialogState({ mode: "edit", groupId });
  };

  const closeDialog = () => {
    setDialogState(null);
    form.reset({
      displayName: "",
      memberIds: [],
    });
  };

  const onSubmit = async (values: GroupFormValues) => {
    const dedupedMembers = Array.from(new Set(values.memberIds));

    switch (dialogState?.mode) {
      case "create":
        await createGroupMutation.mutateAsync({
          name: values.displayName,
          members: dedupedMembers,
        });
      case "edit":
        if (values.id) {
          await editGroupMutation.mutateAsync({
            id: values.id,
            name: values.displayName,
            members: dedupedMembers,
          });
        }
    }
    refetch();
    closeDialog();
  };

  const table = useReactTable<GroupRow>({
    data: groupRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: openEditDialog,
      onActionComplete: () => {
        refetch();
      },
    } satisfies GroupsTableMeta,
  });

  const hasGroups = groupRows.length > 0;

  const isDialogOpen = dialogState !== null;

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogTrigger asChild>
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Apps</h2>
              <p className="text-sm text-muted-foreground">
                Create and deploy computer apps to groups of computers
              </p>
            </div>
            <Button>
              <Link href="/admin/apps/create">Create app</Link>
            </Button>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <DialogHeader className="space-y-2">
                <DialogTitle>
                  {dialogState?.mode === "edit" ? "Edit group" : "Create group"}
                </DialogTitle>
                <DialogDescription>
                  Give the group a clear name and choose the computers that
                  should belong to it.
                </DialogDescription>
              </DialogHeader>

              {dialogState?.mode === "edit" && (
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
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
                        placeholder="e.g. Finance Team"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="memberIds"
                render={({ field }) => {
                  const members = field.value ?? [];
                  return (
                    <FormItem className="space-y-3">
                      <div>
                        <FormLabel>Members</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Select the computers that should be part of this
                          group.
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {members.length}{" "}
                        {members.length === 1 ? "computer" : "computers"}{" "}
                        selected
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit">
                  {dialogState?.mode === "edit"
                    ? "Save changes"
                    : "Create group"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {hasGroups ? (
        <Card>
          <CardContent className="p-0">
            <Table className="">
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
              No apps yet. Create one to start organizing computers.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
