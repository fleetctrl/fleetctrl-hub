import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const appRouter = createTRPCRouter({
  getTableData: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("apps").select(`
      id,
      display_name,
      description,
      created_at,
      updated_at,
      computer_group_apps(
        computer_groups(id, display_name)
      )
    `);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get apps",
        cause: (error as any)?.cause ?? error.message,
      });
    }

    const toArray = (v: unknown) =>
      Array.isArray(v)
        ? v
        : v && typeof v === "object"
        ? Object.values(v as Record<string, unknown>)
        : [];

    const outData = (data ?? []).map((app: any) => {
      const groups = toArray(app?.computer_group_apps)
        .map((gm: any) => {
          const compObj = Array.isArray(gm?.computer_groups)
            ? gm.computer_groups[0]
            : gm?.computer_groups;
          if (!compObj || typeof compObj !== "object") return null;

          const id = String((compObj as any)?.id ?? "");
          const name = String((compObj as any)?.display_name ?? "");
          if (!id) return null;

          return { id, name };
        })
        .filter(Boolean) as { id: string; name: string }[];

      return {
        id: String(app.id),
        displayName: String(app.display_name ?? ""),
        createdAt: app.created_at ?? null,
        updatedAt: app.updated_at ?? null,
        groups: groups,
        groupsCount: groups.length,
      };
    });

    return outData;
  }),
});
