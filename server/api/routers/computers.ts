import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const ONLINE_THRESHOLD_MS = 330_000;

type ComputerRow = {
  id: string;
  rustdesk_id: number | null;
  name: string | null;
  ip: string | null;
  os: string | null;
  os_version: string | null;
  login_user: string | null;
  last_connection: string | null;
};

const mapToListComputer = (computer: ComputerRow) => {
  const lastConnectionDate =
    computer.last_connection !== null
      ? new Date(computer.last_connection)
      : null;

  const isActive =
    lastConnectionDate !== null &&
    lastConnectionDate.getTime() >= Date.now() - ONLINE_THRESHOLD_MS;

  return {
    id: computer.id,
    rustdeskID: computer.rustdesk_id ?? undefined,
    name: computer.name ?? undefined,
    ip: computer.ip ?? undefined,
    os: computer.os ?? undefined,
    osVersion: computer.os_version ?? undefined,
    loginUser: computer.login_user ?? undefined,
    lastConnection: isActive ? "Online" : "Offline",
  };
};

const mapToComputerDetail = (computer: ComputerRow) => ({
  id: computer.id,
  rustdeskID: computer.rustdesk_id ?? undefined,
  name: computer.name ?? undefined,
  ip: computer.ip ?? undefined,
  os: computer.os ?? undefined,
  osVersion: computer.os_version ?? undefined,
  loginUser: computer.login_user ?? undefined,
  lastConnection: computer.last_connection ?? undefined,
});

export const computersRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("computers")
      .select("*");

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load computers.",
        cause: error,
      });
    }

    const computers = (data ?? []) as ComputerRow[];

    return computers.map(mapToListComputer);
  }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("computers")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load computer.",
          cause: error,
        });
      }

      if (!data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Computer not found." });
      }

      return mapToComputerDetail(data as ComputerRow);
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("computers")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to delete computer.",
          cause: error,
        });
      }
    }),
});
