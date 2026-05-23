"use client";

import { flexRender } from "@tanstack/react-table";

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

import { DialogTrigger } from "@radix-ui/react-dialog";
import { Preloaded } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useStaticGroupsTable } from "./hooks/use-static-groups-table";

export function StaticGroupsTable({
  preloaded,
}: {
  preloaded: {
    groups: Preloaded<typeof api.staticGroups.getTableData>;
  };
}) {
  const {
    computers,
    closeDialog,
    dialogState,
    form,
    handleMembersScroll,
    hasGroups,
    isDialogOpen,
    isLoadingComputers,
    isSaving,
    memberSearch,
    onSubmit,
    openCreateDialog,
    setMemberSearch,
    table,
  } = useStaticGroupsTable({ preloaded });

  return (
    <div className="flex w-full flex-col gap-4 pb-10">
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
                      <div
                        className="grid h-95 content-start gap-2 overflow-y-scroll [scrollbar-gutter:stable]"
                        onScroll={handleMembersScroll}
                      >
                        {computers.map((computer) => {
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
                                      (id) => id !== computer.id,
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
                        {isLoadingComputers && (
                          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                            Loading computers...
                          </div>
                        )}
                        {!isLoadingComputers && computers.length === 0 && (
                          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                            No computers found.
                          </div>
                        )}
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeDialog}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
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
                            header.getContext(),
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
                          cell.getContext(),
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
