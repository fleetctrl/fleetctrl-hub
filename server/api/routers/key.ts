import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";



// Mocked DB
export interface Key {
    id: string
    name: string,
    remainingUses: string,
    token_fragment: string
    expiresAt?: string,
}

const getCrypto = () => {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj) {
        throw new Error("Crypto API is unavailable in the current runtime");
    }
    return cryptoObj;
};

const generateKey = () => {
    const cryptoObj = getCrypto();
    const array = new Uint8Array(32);
    cryptoObj.getRandomValues(array);
    return Array.from(array)
        .map((b) => b.toString(32).padStart(2, "0"))
        .join("");
};

async function b64urlSHA256(input: string): Promise<string> {
    const cryptoObj = getCrypto();
    const data = new TextEncoder().encode(input);
    const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hashBuffer);

    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
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
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
        const { error } = await ctx.supabase.from("enrollment_tokens").delete().eq("token_hash", input.id)

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }
    }),
    create: protectedProcedure.input(z.object({ name: z.string(), expires_at: z.date(), remaining_uses: z.number() })).mutation(async ({ ctx, input }) => {
        const token = generateKey();
        const tokenHash = await b64urlSHA256(token)
        const token_fragment = token.slice(0, 8) + " ... " + token.slice(token.length - 4, token.length)
        const keyData = {
            name: input.name,
            token_hash: tokenHash,
            expires_at: input.expires_at,
            token_fragment: token_fragment,
            remaining_uses: input.remaining_uses,
        };
        const { error } = await ctx.supabase.from("enrollment_tokens").insert([keyData]);

        if (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred, please try again later.',
                cause: error,
            });
        }
        return {
            token,
        }
    })
});
