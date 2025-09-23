import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";



// Mocked DB
export type RustDesk = {
    id: string;
    rustdeskID?: number;
    name?: string;
    ip?: string;
    os?: string;
    osVersion?: string;
    loginUser?: string;
    lastConnection?: string;
};

export const rustdeskRouter = createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {

        const { data: rustdesk } = await ctx.supabase
            .from("computers")
            .select("*");

        if (!rustdesk) return [];

        const data = rustdesk.map((cp) => {
            // 5 minutes
            const now = new Date(Date.now() - 330000);

            const isActive =
                new Date(cp?.last_connection).getTime() >= now.getTime();

            return {
                id: cp.id,
                rustdeskID: cp.rustdesk_id,
                name: cp?.name,
                ip: cp?.ip,
                os: cp?.os,
                osVersion: cp?.os_version,
                loginUser: cp?.login_user,
                lastConnection: isActive ? "Online" : "Offline",
            } as RustDesk;
        });

        return data;

    }),
    get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const { data } = await ctx.supabase
            .from("computers")
            .select("*")
            .eq("id", input.id)
            .single() as { data: RustDesk };

        if (!data) return null;

        return data;
    }),
});
