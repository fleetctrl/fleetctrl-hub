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
    clientVersion?: string;
    intuneId?: string;
};

const SORT_COLUMN_MAP: Record<string, string> = {
    rustdeskID: "rustdesk_id",
    name: "name",
    ip: "ip",
    os: "os",
    osVersion: "os_version",
    loginUser: "login_user",
    lastConnection: "last_connection",
    intuneId: "intune_id",
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
                    login_user: z.string(),
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

        if (input?.filter?.login_user) {
            query = query.ilike("login_user", `%${input.filter.login_user}%`);
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

        const data = rustdesk.map((data) => {
            // 5 minutes
            const now = new Date(Date.now() - 330000);

            const isActive =
                new Date(data?.last_connection).getTime() >= now.getTime();

            return {
                id: data.id,
                rustdeskID: data.rustdesk_id,
                name: data?.name,
                ip: data?.ip,
                os: data?.os,
                osVersion: data?.os_version,
                loginUser: data?.login_user,
                lastConnection: isActive ? "Online" : "Offline",
                clientVersion: data?.client_version,
                intuneId: data?.intune_id,
            } as RustDesk;
        });

        return { data, total: count ?? data.length };
    }),
    getSingle: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const { data } = await ctx.supabase
            .from("computers")
            .select("*")
            .eq("id", input.id)
            .single();

        if (!data) return null;

        return {
            id: data.id,
            rustdeskID: data.rustdesk_id,
            name: data?.name,
            ip: data?.ip,
            os: data?.os,
            osVersion: data?.os_version,
            loginUser: data?.login_user,
            lastConnection: data?.last_connection,
            clientVersion: data?.client_version,
            intuneId: data?.intune_id,
        } as RustDesk;

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
    }),
    getTasks: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
            .from("tasks")
            .select("id, task, status, created_at, error")
            .eq("computer_id", input.id)
            .order("created_at", { ascending: false });

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }

        return data;
    }),
    createTask: protectedProcedure.input(z.object({ computerID: z.string(), task: z.string(), taskData: z.json() })).mutation(async ({ ctx, input }) => {
        const { error } = await ctx.supabase
            .from("tasks")
            .insert([
                {
                    task: input.task,
                    status: "PENDING",
                    task_data: input.taskData,
                    computer_id: input.computerID,
                },
            ])
            .select();

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }
    })
});
