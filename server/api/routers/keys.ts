import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type KeyRow = {
  token_hash: string;
  name: string | null;
  remaining_uses: number | null;
  token_fragment: string | null;
  expires_at: string | null;
  created_at: string;
};

const keySelection = "token_hash, name, remaining_uses, token_fragment, expires_at, created_at";

const formatExpiration = (expiresAt: string | null) => {
  if (!expiresAt) {
    return undefined;
  }

  const expiresDate = new Date(expiresAt);

  return `${expiresDate.toLocaleDateString("cs")} ${expiresDate.toLocaleTimeString("cs")}`;
};

export const keysRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("enrollment_tokens")
      .select(keySelection)
      .order("created_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load enrollment keys.",
        cause: error,
      });
    }

    const keys = (data ?? []) as KeyRow[];

    return keys.map((key) => ({
      id: key.token_hash,
      name: key.name ?? "",
      remainingUses:
        key.remaining_uses === -1
          ? "unlimited"
          : String(key.remaining_uses ?? 0),
      tokenFragment: key.token_fragment ?? "",
      expiresAt: formatExpiration(key.expires_at),
    }));
  }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        tokenHash: z.string().min(1),
        tokenFragment: z.string().min(1),
        expiresAt: z.string().min(1),
        remainingUses: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("enrollment_tokens").insert([
        {
          name: input.name,
          token_hash: input.tokenHash,
          token_fragment: input.tokenFragment,
          expires_at: input.expiresAt,
          remaining_uses: input.remainingUses,
        },
      ]);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create enrollment key.",
          cause: error,
        });
      }
    }),
  delete: protectedProcedure
    .input(z.object({ tokenHash: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("enrollment_tokens")
        .delete()
        .eq("token_hash", input.tokenHash);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete enrollment key.",
          cause: error,
        });
      }
    }),
});
