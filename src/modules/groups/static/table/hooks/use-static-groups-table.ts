"use client";

import type { UIEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import z from "zod";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuthPaginatedQuery } from "@/hooks/use-auth-query";

import {
  staticGroupsTableColumns,
  type StaticGroupRow,
  type StaticGroupsTableMeta,
} from "../static-groups-table-columns";

type DialogState = { mode: "create" } | { mode: "edit"; groupId: string };

const MEMBER_PAGE_SIZE = 50;
const MEMBER_SEARCH_DEBOUNCE_MS = 300;

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

export function useStaticGroupsTable({
  preloaded,
}: {
  preloaded: {
    groups: Preloaded<typeof api.staticGroups.getTableData>;
  };
}) {
  const groups = usePreloadedQuery(preloaded.groups);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isDialogOpen = dialogState !== null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedMemberSearch(memberSearch);
    }, MEMBER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [memberSearch]);

  const {
    results: computers,
    status: computersStatus,
    loadMore: loadMoreComputers,
  } = useAuthPaginatedQuery(
    api.staticGroups.getComputersForGroupsPaginated,
    isDialogOpen
      ? {
        search: debouncedMemberSearch.trim() || undefined,
      }
      : "skip",
    { initialNumItems: MEMBER_PAGE_SIZE },
  );

  const createGroupMutation = useMutation(api.staticGroups.create);
  const editGroupMutation = useMutation(api.staticGroups.edit);

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      displayName: "",
      memberIds: [],
    },
  });

  const groupRows: StaticGroupRow[] = useMemo(() => {
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

  const resetForm = () => {
    form.reset({
      displayName: "",
      memberIds: [],
    });
  };

  const openCreateDialog = () => {
    resetForm();
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
    resetForm();
  };

  const onSubmit = async (values: GroupFormValues) => {
    const dedupedMembers = Array.from(
      new Set(values.memberIds),
    ) as Id<"computers">[];

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
      const message =
        error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setIsCreating(false);
      setIsEditing(false);
    }
    closeDialog();
  };

  const table = useReactTable<StaticGroupRow>({
    data: groupRows,
    columns: staticGroupsTableColumns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: openEditDialog,
      onActionComplete: () => undefined,
    } satisfies StaticGroupsTableMeta,
  });

  const isSaving = isCreating || isEditing;
  const canLoadMoreComputers = computersStatus === "CanLoadMore";
  const isLoadingComputers =
    computersStatus === "LoadingFirstPage" ||
    computersStatus === "LoadingMore";

  const handleMembersScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (
      distanceFromBottom < 64 &&
      canLoadMoreComputers &&
      !isLoadingComputers
    ) {
      loadMoreComputers(MEMBER_PAGE_SIZE);
    }
  };

  return {
    computers,
    closeDialog,
    dialogState,
    form,
    hasGroups: groupRows.length > 0,
    handleMembersScroll,
    isDialogOpen,
    isLoadingComputers,
    isSaving,
    memberSearch,
    onSubmit,
    openCreateDialog,
    setMemberSearch,
    table,
  };
}
