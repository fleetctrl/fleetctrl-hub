"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Button } from "@/components/ui/button";
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

import { DialogTrigger } from "@radix-ui/react-dialog";
import { useStaticGroupsTable } from "./hooks/use-static-groups-table";
import { VirtualTable } from "@/components/virtual-table";

export function StaticGroupsTable() {
  const {
    computers,
    closeDialog,
    dialogState,
    form,
    canLoadMoreComputers,
    loadMoreComputers,
    isDialogOpen,
    isLoadingComputers,
    isSaving,
    memberSearch,
    onSubmit,
    openCreateDialog,
    setMemberSearch,
    table,
    groupsQuery,
    isLoadingEditMembers,
  } = useStaticGroupsTable();
  const memberScrollRef = useRef<HTMLDivElement>(null);
  const memberVirtualizer = useVirtualizer({
    count: computers.length,
    getScrollElement: () => memberScrollRef.current,
    estimateSize: () => 58,
    overscan: 8,
  });
  const memberVirtualRows = memberVirtualizer.getVirtualItems();
  const lastMemberIndex = memberVirtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    if (canLoadMoreComputers && !isLoadingComputers && lastMemberIndex >= computers.length - 10) loadMoreComputers();
  }, [canLoadMoreComputers, computers.length, isLoadingComputers, lastMemberIndex, loadMoreComputers]);

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
                        disabled={isLoadingEditMembers}
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
                        disabled={isLoadingEditMembers}
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                      <div
                        ref={memberScrollRef}
                        className="h-95 overflow-y-auto [scrollbar-gutter:stable]"
                      >
                        <div className="relative" style={{ height: memberVirtualizer.getTotalSize() }}>
                        {memberVirtualRows.map((virtualRow) => {
                          const computer = computers[virtualRow.index];
                          const checkboxId = `member-${computer.id}`;
                          const isChecked = members.includes(computer.id);
                          return (
                            <div
                              key={computer.id}
                              ref={memberVirtualizer.measureElement}
                              data-index={virtualRow.index}
                              className="absolute left-0 top-0 flex w-full items-start gap-3 rounded-lg border p-3 transition hover:bg-accent/40"
                              style={{ transform: `translateY(${virtualRow.start}px)` }}
                            >
                              <Checkbox
                                id={checkboxId}
                                disabled={isLoadingEditMembers}
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
                        </div>
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
                <Button type="submit" disabled={isSaving || isLoadingEditMembers}>
                  {isLoadingEditMembers
                    ? "Loading members…"
                    : dialogState?.mode === "edit"
                    ? "Save changes"
                    : "Create group"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <VirtualTable
        height={575}
        table={table}
        ariaLabel="Static computer groups"
        emptyMessage="No groups yet. Create one to start organizing computers."
        isInitialLoading={groupsQuery.status === "LoadingFirstPage"}
        isLoadingMore={groupsQuery.status === "LoadingMore"}
        hasMore={groupsQuery.status === "CanLoadMore"}
        onLoadMore={() => groupsQuery.loadMore(200)}
        pinnedEndColumns={1}
      />
    </div>
  );
}
