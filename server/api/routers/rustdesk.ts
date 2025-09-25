import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";



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

const SORT_COLUMN_MAP: Record<string, string> = {
    rustdeskID: "rustdesk_id",
    name: "name",
    ip: "ip",
    os: "os",
    osVersion: "os_version",
    loginUser: "login_user",
    lastConnection: "last_connection",
};

export const rustdeskRouter = createTRPCRouter({
    get: protectedProcedure.input(
        z.object({
            range: z
                .object({
                    limit: z.number(),
                    skip: z.number(),
                })
                .optional(),
            filter: z
                .object({
                    last_connected: z.string(),
                })
                .optional(),
            sort: z
                .array(
                    z.object({
                        id: z.string(),
                        desc: z.boolean().optional(),
                    }),
                )
                .optional(),
        })
    ).query(async ({ ctx, input }) => {
        let query = ctx.supabase
            .from("computers")
            .select("*", { count: "exact" });

        if (input.range) {
            const skip = Math.max(0, input.range.skip);
            const limit = Math.max(0, input.range.limit);

            if (limit > 0) {
                query = query.range(skip, skip + limit - 1);
            }
        }

        if (input?.filter?.last_connected) {
            query = query.ilike("last_connection", `%${input.filter.last_connected}%`);
        }

        if (input.sort?.length) {
            for (const sort of input.sort) {
                const column = SORT_COLUMN_MAP[sort.id];

                if (!column) {
                    continue;
                }

                query = query.order(column, {
                    ascending: sort.desc !== true,
                    nullsFirst: false,
                });
            }
        }

        const { data: rustdesk, error, count } = await query;

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }

        if (!rustdesk) {
            return { data: [], total: 0 };
        }

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

        return { data, total: count ?? data.length };
    }),
    getSingle: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const { data } = await ctx.supabase
            .from("computers")
            .select("*")
            .eq("id", input.id)
            .single() as { data: RustDesk };

        if (!data) return null;

        return data;
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
        const { error } = await ctx.supabase
            .from("computers")
            .delete()
            .eq("id", input.id);

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }
    })
});
