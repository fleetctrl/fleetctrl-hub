import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type TaskRow = {
  id: number;
  task: string;
  status: string;
  created_at: string;
  error: string | null;
};

export const tasksRouter = createTRPCRouter({
  listForComputer: protectedProcedure
    .input(z.object({ computerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("tasks")
        .select("id, task, status, created_at, error")
        .eq("computer_id", input.computerId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load tasks.",
          cause: error,
        });
      }

      const tasks = (data ?? []) as TaskRow[];

      return tasks.map((task) => ({
        id: task.id,
        task: task.task,
        status: task.status,
        createdAt: task.created_at,
        error: task.error ?? undefined,
      }));
    }),
  enqueue: protectedProcedure
    .input(
      z.object({
        computerId: z.string().min(1),
        task: z.string().min(1),
        taskData: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("tasks").insert([
        {
          task: input.task,
          status: "PENDING",
          task_data: input.taskData ?? null,
          computer_id: input.computerId,
        },
      ]);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to enqueue task.",
          cause: error,
        });
      }
    }),
});
