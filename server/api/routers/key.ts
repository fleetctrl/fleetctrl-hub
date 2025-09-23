import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";



// Mocked DB
export interface Key {
    id: string
    name: string,
    remainingUses: string,
    token_fragment: string
    expiresAt?: string,
}

export const keyRouter = createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {

        const { data: keys } = await ctx.supabase
            .from("enrollment_tokens")
            .select("*").order("created_at", {
                ascending: false,
            });

        if (!keys) return [];

        const data = keys.map((key) => {
            return {
                id: key.token_hash ?? "",
                name: key.name ?? "",
                remainingUses: key.remaining_uses == -1 ? "unlimited" : key.remaining_uses,
                token_fragment: key.token_fragment ?? "",
                expiresAt: new Date(key.expires_at).toLocaleDateString("cs") + " " + new Date(key.expires_at).toLocaleTimeString("cs")
            } as Key
        })

        return data;
    }),
});
