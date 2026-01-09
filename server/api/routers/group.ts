import { string, z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const groupRouter = createTRPCRouter({
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("computer_groups")
        .delete()
        .eq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete group",
          cause: error.cause,
        });
      }
    }),
  create: protectedProcedure
    .input(
      z.object({ name: z.string(), members: z.string().array().optional() })
    )
    .mutation(async ({ ctx, input }) => {
      // chceck if group exist
      const { error, count } = await ctx.supabase
        .from("computer_groups")
        .select("id", { count: "exact", head: true })
        .eq("display_name", input.name);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get groups",
          cause: error.cause,
        });
      }
      if (count) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Group already exists",
        });
      }

      // create group
      const group = {
        display_name: input.name,
      };
      const create = await ctx.supabase
        .from("computer_groups")
        .insert(group)
        .select("id");
      if (create.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create group",
          cause: create.error.cause,
        });
      }
      // (optinal) set group members
      const groupId = create.data[0].id;
      if (input.members) {
        const memebers = input.members;
        const insert = memebers.map((member) => {
          return {
            computer_id: member,
            group_id: groupId,
          };
        });
        const insertedMembers = await ctx.supabase
          .from("computer_group_members")
          .insert(insert);
        if (insertedMembers.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable insert members to group",
            cause: insertedMembers.error.cause,
          });
        }
      }
    }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("computer_groups").select(`
      id,
      display_name,
      created_at,
      updated_at
      `)
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get groups",
        cause: (error as any)?.cause ?? error.message,
      });
    }

    return data
  }),
  // Get all groups (static + dynamic) for assignment selection
  getAllForAssignment: protectedProcedure.query(async ({ ctx }) => {
    // Get static groups
    const { data: staticGroups, error: staticError } = await ctx.supabase
      .from("computer_groups")
      .select("id, display_name")
      .order("display_name");

    if (staticError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get static groups",
        cause: staticError.message,
      });
    }

    // Get dynamic groups
    const { data: dynamicGroups, error: dynamicError } = await ctx.supabase
      .from("dynamic_computer_groups")
      .select("id, display_name")
      .order("display_name");

    if (dynamicError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get dynamic groups",
        cause: dynamicError.message,
      });
    }

    // Combine with type indicator
    const result = [
      ...(staticGroups ?? []).map((g: any) => ({
        id: g.id,
        displayName: g.display_name,
        type: "static" as const,
      })),
      ...(dynamicGroups ?? []).map((g: any) => ({
        id: g.id,
        displayName: g.display_name,
        type: "dynamic" as const,
      })),
    ];

    // Sort by displayName
    result.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return result;
  }),
  getTableData: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("computer_groups").select(`
      id,
      display_name,
      created_at,
      updated_at,
      computer_group_members(
        computers(id, name)
      )
    `);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get groups",
        cause: (error as any)?.cause ?? error.message,
      });
    }

    const toArray = (v: unknown) =>
      Array.isArray(v)
        ? v
        : v && typeof v === "object"
          ? Object.values(v as Record<string, unknown>)
          : [];

    const outData = (data ?? []).map((group: any) => {
      const members = toArray(group?.computer_group_members)
        .map((gm: any) => {
          const compObj = Array.isArray(gm?.computers)
            ? gm.computers[0]
            : gm?.computers;
          if (!compObj || typeof compObj !== "object") return null;

          const id = String((compObj as any)?.id ?? "");
          const name = String((compObj as any)?.name ?? "");
          if (!id) return null;

          return { id, name };
        })
        .filter(Boolean) as { id: string; name: string }[];

      return {
        id: String(group.id),
        displayName: String(group.display_name ?? ""),
        createdAt: group.created_at ?? null,
        updatedAt: group.updated_at ?? null,
        members,
        memberCount: members.length,
      };
    });

    return outData;
  }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        members: z.string().array(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // check if group name exist
      const { error, count } = await ctx.supabase
        .from("computer_groups")
        .select("id", { count: "exact", head: true })
        .eq("display_name", input.name)
        .neq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to get groups",
          cause: error.cause,
        });
      }
      if (count) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Group name already exists",
        });
      }

      const { error: updateError } = await ctx.supabase
        .from("computer_groups")
        .update({ display_name: input.name, updated_at: new Date() })
        .eq("id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to update group",
          cause: updateError?.cause,
        });
      }

      // update memebers
      const { error: deleteError } = await ctx.supabase
        .from("computer_group_members")
        .delete()
        .eq("group_id", input.id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete group members",
          cause: deleteError?.cause,
        });
      }

      const insert = input.members.map((member) => {
        return {
          computer_id: member,
          group_id: input.id,
        };
      });
      const insertedMembers = await ctx.supabase
        .from("computer_group_members")
        .insert(insert);
      if (insertedMembers.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable insert members to group",
          cause: insertedMembers.error.cause,
        });
      }
    }),
});
