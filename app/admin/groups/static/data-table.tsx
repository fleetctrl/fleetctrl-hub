"use client";

import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { toast } from "sonner";

type DialogState = { mode: "create" } | { mode: "edit"; groupId: string };

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("cs-CZ", {
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

export function GroupsTable() {
  // Convex queries - automatically reactive!
  const computers = useQuery(api.staticGroups.getComputersForGroups);
  const groups = useQuery(api.staticGroups.getTableData);

  // Convex mutations
  const createGroupMutation = useMutation(api.staticGroups.create);
  const editGroupMutation = useMutation(api.staticGroups.edit);

  // State for mutations
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const groupRows: GroupRow[] = useMemo(() => {
    if (!groups) {
      return [];
    }
    return groups.map((group) => ({
      id: group.id,
      displayName: group.displayName,
      members: group.members.filter(Boolean) as { id: string; name: string }[],
      memberCount: group.members.length ?? 0,
      createdAtFormatted: formatDateTime(group.createdAt),
      updatedAtFormatted: formatDateTime(group.createdAt),
    }));
  }, [groups]);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      displayName: "",
      memberIds: [],
    },
  });

  const openCreateDialog = () => {
    form.reset({
      displayName: "",
      memberIds: [],
    });
    setMemberSearch("");
    setDialogState({ mode: "create" });
  };

  const openEditDialog = (groupId: string) => {
    const group = groups?.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    form.reset({
      id: group.id,
      displayName: group.displayName,
      memberIds: [...group.members.filter(Boolean).map((c) => c?.id ?? "")],
    });
    setMemberSearch("");
    setDialogState({ mode: "edit", groupId });
  };

  const closeDialog = () => {
    setDialogState(null);
    setMemberSearch("");
    form.reset({
      displayName: "",
      memberIds: [],
    });
  };

  const onSubmit = async (values: GroupFormValues) => {
    const dedupedMembers = Array.from(new Set(values.memberIds)) as Id<"computers">[];

    try {
      if (dialogState?.mode === "create") {
        setIsCreating(true);
        await createGroupMutation({
          displayName: values.displayName,
          memberIds: dedupedMembers,
        });
        toast.success("Group created");
      } else if (dialogState?.mode === "edit" && values.id) {
        setIsEditing(true);
        await editGroupMutation({
          id: values.id as Id<"computer_groups">,
          displayName: values.displayName,
          memberIds: dedupedMembers,
        });
        toast.success("Group updated");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setIsCreating(false);
      setIsEditing(false);
    }
    closeDialog();
  };

  const table = useReactTable<GroupRow>({
    data: groupRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: openEditDialog,
      onActionComplete: () => {
        // No-op - Convex is automatically reactive
      },
    } satisfies GroupsTableMeta,
  });

  const hasGroups = groupRows.length > 0;
  const isDialogOpen = dialogState !== null;
  const isLoading = isCreating || isEditing;

  // Convex queries are automatically reactive - no Supabase subscription needed!

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b">
        <a
          href="/admin/groups/static"
          className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          Static Groups
        </a>
        <a
          href="/admin/groups/dynamic"
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Dynamic Groups
        </a>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogTrigger asChild>
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Computer Groups</h2>
              <p className="text-sm text-muted-foreground">
                Organize devices into named groups to streamline policy
                management.
              </p>
            </div>
            <Button onClick={openCreateDialog}>Create group</Button>
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
                  const filteredComputers =
                    computers?.filter((c: { id: string; name: string }) =>
                      c.name?.toLowerCase().includes(memberSearch.toLowerCase())
                    ) ?? [];

                  return (
                    <FormItem className="space-y-3">
                      <div>
                        <FormLabel>Members</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Select the computers that should be part of this
                          group.
                        </p>
                      </div>
                      <Input
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                      <div className="grid max-h-[400px] gap-2 overflow-y-auto">
                        {filteredComputers.map((computer) => {
                          const checkboxId = `member-${computer.id}`;
                          const isChecked = members.includes(computer.id);
                          return (
                            <div
                              key={computer.id}
                              className="flex items-start gap-3 rounded-lg border p-3 transition hover:bg-accent/40"
                            >
                              <Checkbox
                                id={checkboxId}
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const shouldInclude = checked === true;
                                  const next = shouldInclude
                                    ? [...members, computer.id]
                                    : members.filter(
                                      (id) => id !== computer.id
                                    );
                                  field.onChange(Array.from(new Set(next)));
                                }}
                              />
                              <div className="grid gap-0.5">
                                <Label
                                  htmlFor={checkboxId}
                                  className="font-medium"
                                >
                                  {computer.name}
                                </Label>
                              </div>
                            </div>
                          );
                        })}
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
              No groups yet. Create one to start organizing computers.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
