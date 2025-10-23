import { string, z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const groupRouter = createTRPCRouter({
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
        const { error } = await ctx.supabase.from("computer_groups").delete().eq("id", input.id)
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: 'Unable to delete group',
                cause: error.cause,
            });
        }
    }),
    create: protectedProcedure.input(z.object({ name: z.string(), members: z.string().array().optional() })).mutation(async ({ ctx, input }) => {
        // chceck if group exist
        const { error, count } = await ctx.supabase.from("computer_groups").select("id", { count: 'exact', head: true }).eq("display_name", input.name)
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: 'Unable to get groups',
                cause: error.cause,
            });
        }
        if (count) {
            throw new TRPCError({
                code: "CONFLICT",
                message: 'Group already exists',
            });
        }

        // create group
        const group = {
            display_name: input.name
        }
        const create = await ctx.supabase.from("computer_groups").insert(group).select("id")
        if (create.error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: 'Unable to create group',
                cause: create.error.cause,
            });
        }
        // (optinal) set group members
        const groupId = create.data[0].id
        if (input.members) {
            const memebers = input.members
            const insert = memebers.map((member) => {
                return {
                    computer_id: member,
                    group_id: groupId
                }
            })
            const insertedMembers = await ctx.supabase.from("computer_group_members").insert(insert)
            if (insertedMembers.error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: 'Unable insert members to group',
                    cause: insertedMembers.error.cause,
                });
            }
        }
    })
});
