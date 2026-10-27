"use client";

import { useEffect, useMemo, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import z from "zod";

import {
  useComputersForGroups,
  useCreateStaticGroup,
  useStaticGroupMemberIds,
  useStaticGroupsPaginated,
  useUpdateStaticGroup,
} from "../api";

import {
  staticGroupsTableColumns,
  type StaticGroupRow,
  type StaticGroupsTableMeta,
} from "../components/static/static-groups-table-columns";

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

export function useStaticGroupsTable() {
  const groupsQuery = useStaticGroupsPaginated({ initialNumItems: MEMBER_PAGE_SIZE });
  const groups = groupsQuery.results;
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadedEditGroupId, setLoadedEditGroupId] = useState<string | null>(null);

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { displayName: "", memberIds: [] },
  });

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
  } = useComputersForGroups(
    debouncedMemberSearch.trim() || undefined,
    { initialNumItems: MEMBER_PAGE_SIZE, enabled: isDialogOpen },
  );

  const editingGroupId = dialogState?.mode === "edit" ? dialogState.groupId : null;
  const editMembersQuery = useStaticGroupMemberIds(editingGroupId, { initialNumItems: MEMBER_PAGE_SIZE });

  useEffect(() => {
    if (editMembersQuery.status === "CanLoadMore") editMembersQuery.loadMore(MEMBER_PAGE_SIZE);
  }, [editMembersQuery]);

  useEffect(() => {
    if (!editingGroupId || editMembersQuery.status !== "Exhausted" || loadedEditGroupId === editingGroupId) return;
    const group = groups.find((item) => item.id === editingGroupId);
    if (!group) return;
    form.reset({ id: group.id, displayName: group.displayName, memberIds: [...editMembersQuery.results] });
    setLoadedEditGroupId(editingGroupId);
  }, [editMembersQuery.results, editMembersQuery.status, editingGroupId, form, groups, loadedEditGroupId]);

  const createGroupMutation = useCreateStaticGroup();
  const editGroupMutation = useUpdateStaticGroup();

  const groupRows: StaticGroupRow[] = useMemo(() => {
    if (!groups) {
      return [];
    }
    return groups.map((group) => ({
      id: group.id,
      displayName: group.displayName,
      members: group.members.filter(Boolean) as { id: string; name: string }[],
      memberCount: group.memberCount,
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
    setLoadedEditGroupId(null);
    form.reset({ id: group.id, displayName: group.displayName, memberIds: [] });
    setMemberSearch("");
    setDialogState({ mode: "edit", groupId });
  };

  const closeDialog = () => {
    setDialogState(null);
    setMemberSearch("");
    resetForm();
  };

  const onSubmit = async (values: GroupFormValues) => {
    const dedupedMembers = Array.from(new Set(values.memberIds));

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
          id: values.id,
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

  return {
    computers,
    closeDialog,
    dialogState,
    form,
    hasGroups: groupRows.length > 0,
    canLoadMoreComputers,
    loadMoreComputers: () => loadMoreComputers(MEMBER_PAGE_SIZE),
    isDialogOpen,
    isLoadingComputers,
    isSaving,
    memberSearch,
    onSubmit,
    openCreateDialog,
    setMemberSearch,
    table,
    groupsQuery,
    isLoadingEditMembers: Boolean(editingGroupId) && editMembersQuery.status !== "Exhausted",
  };
}
