import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const accountRouter = createTRPCRouter({
    update: protectedProcedure.input(
        z.object({
            firstname: z.string().min(1, { message: "First name is required" }),
            lastname: z.string().min(1, { message: "Last name is required" }),
        })
    ).mutation(async ({ ctx, input }) => {
        const { error } = await ctx.supabase.auth.updateUser({
            data: {
                firstname: input.firstname,
                lastname: input.lastname
            }
        })

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }
    })
});
