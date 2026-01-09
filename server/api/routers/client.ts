import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const clientRouter = createTRPCRouter({
    // Get all client update versions
    getAll: protectedProcedure.query(async ({ ctx }) => {
        const { data, error } = await ctx.supabase
            .from("client_updates")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get client updates",
                cause: error,
            });
        }

        return data;
    }),

    // Get currently active version
    getActive: protectedProcedure.query(async ({ ctx }) => {
        const { data, error } = await ctx.supabase
            .from("client_updates")
            .select("*")
            .eq("is_active", true)
            .single();

        // PGRST116 = no rows found, which is acceptable
        if (error && error.code !== "PGRST116") {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get active client version",
                cause: error,
            });
        }

        return data;
    }),

    // Create new client update version
    create: protectedProcedure
        .input(
            z.object({
                version: z.string().min(1),
                storage_path: z.string().min(1),
                hash: z.string().min(1),
                byte_size: z.number().positive(),
                notes: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await ctx.supabase
                .from("client_updates")
                .insert(input)
                .select()
                .single();

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create client update",
                    cause: error,
                });
            }

            return data;
        }),

    // Set a version as active (deactivates all others)
    setActive: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // First deactivate all versions
            const { error: deactivateError } = await ctx.supabase
                .from("client_updates")
                .update({ is_active: false })
                .eq("is_active", true);

            if (deactivateError) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to deactivate current version",
                    cause: deactivateError,
                });
            }

            // Activate the selected version
            const { data, error } = await ctx.supabase
                .from("client_updates")
                .update({ is_active: true })
                .eq("id", input.id)
                .select()
                .single();

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to activate client version",
                    cause: error,
                });
            }

            return data;
        }),

    // Deactivate (stop deploying) current active version
    deactivate: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await ctx.supabase
                .from("client_updates")
                .update({ is_active: false })
                .eq("id", input.id)
                .select()
                .single();

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to deactivate client version",
                    cause: error,
                });
            }

            return data;
        }),

    // Delete a client update version
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get the storage path first to delete the file
            const { data: version, error: fetchError } = await ctx.supabase
                .from("client_updates")
                .select("storage_path, storage_bucket")
                .eq("id", input.id)
                .single();

            if (fetchError) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to find client version",
                    cause: fetchError,
                });
            }

            // Delete the database record
            const { error } = await ctx.supabase
                .from("client_updates")
                .delete()
                .eq("id", input.id);

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to delete client update",
                    cause: error,
                });
            }

            // Try to delete the storage file (non-blocking)
            if (version?.storage_path && version?.storage_bucket) {
                await ctx.supabase.storage
                    .from(version.storage_bucket)
                    .remove([version.storage_path])
                    .catch(() => {
                        // Ignore storage deletion errors
                    });
            }

            return { success: true };
        }),
});
