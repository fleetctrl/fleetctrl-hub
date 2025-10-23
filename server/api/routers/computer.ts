import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const computerRouter = createTRPCRouter({
    getForGroups: protectedProcedure.query(async ({ ctx }) => {
        const { data, error } = await ctx.supabase.from("computers").select("id, name")
        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: 'Unable get computers',
                cause: error.cause,
            });
        }

        return data
    })
});
