import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// Schema for a single rule condition (leaf node)
const ruleConditionSchema = z.object({
    property: z.enum(["name", "os", "osVersion", "ip", "loginUser", "createdAt", "intuneMdm"]),
    operator: z.enum([
        "equals",
        "notEquals",
        "contains",
        "notContains",
        "startsWith",
        "endsWith",
        "regex",
        "olderThanDays",
        "newerThanDays",
        "after",
        "before",
    ]),
    value: z.string(),
});

// Recursive schema for nested rule expressions
type RuleExpression =
    | z.infer<typeof ruleConditionSchema>
    | {
        logic: "AND" | "OR";
        conditions: RuleExpression[];
    };

const ruleExpressionSchema: z.ZodType<RuleExpression> = z.lazy(() =>
    z.union([
        ruleConditionSchema,
        z.object({
            logic: z.enum(["AND", "OR"]),
            conditions: z.array(ruleExpressionSchema),
        }),
    ])
);

export const dynamicGroupRouter = createTRPCRouter({
    // Create a new dynamic group
    create: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1),
                description: z.string().optional(),
                ruleExpression: ruleExpressionSchema,
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check if group name already exists
            const { count, error: checkError } = await ctx.supabase
                .from("dynamic_computer_groups")
                .select("id", { count: "exact", head: true })
                .eq("display_name", input.name);

            if (checkError) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Unable to check existing groups",
                    cause: checkError,
                });
            }

            if (count && count > 0) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "Group with this name already exists",
                });
            }

            // Create the group
            const { data, error } = await ctx.supabase
                .from("dynamic_computer_groups")
                .insert({
                    display_name: input.name,
                    description: input.description ?? null,
                    rule_expression: input.ruleExpression,
                })
                .select("id")
                .single();

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Unable to create dynamic group",
                    cause: error,
                });
            }

            return { id: data.id };
        }),

    // Get all dynamic groups with member counts
    getAll: protectedProcedure.query(async ({ ctx }) => {
        const { data, error } = await ctx.supabase
            .from("dynamic_computer_groups")
            .select(
                `
        id,
        display_name,
        description,
        created_at,
        updated_at,
        last_evaluated_at,
        dynamic_group_members(count)
      `
            )
            .order("display_name");

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Unable to get dynamic groups",
                cause: error,
            });
        }

        return (data ?? []).map((group: any) => ({
            id: group.id,
            displayName: group.display_name,
            description: group.description,
            createdAt: group.created_at,
            updatedAt: group.updated_at,
            lastEvaluatedAt: group.last_evaluated_at,
            memberCount: group.dynamic_group_members?.[0]?.count ?? 0,
        }));
    }),

    // Get a single dynamic group by ID with full details
    getById: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await ctx.supabase
                .from("dynamic_computer_groups")
                .select(
                    `
          id,
          display_name,
          description,
          rule_expression,
          created_at,
          updated_at,
          last_evaluated_at
        `
                )
                .eq("id", input.id)
                .single();

            if (error) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Dynamic group not found",
                    cause: error,
                });
            }

            return {
                id: data.id,
                displayName: data.display_name,
                description: data.description,
                ruleExpression: data.rule_expression as RuleExpression,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                lastEvaluatedAt: data.last_evaluated_at,
            };
        }),

    // Get members of a dynamic group (from cache)
    getMembers: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await ctx.supabase
                .from("dynamic_group_members")
                .select(
                    `
          computer_id,
          added_at,
          computers(id, name, os, os_version, ip, login_user)
        `
                )
                .eq("group_id", input.id);

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Unable to get group members",
                    cause: error,
                });
            }

            return (data ?? []).map((member: any) => ({
                computerId: member.computer_id,
                addedAt: member.added_at,
                computer: member.computers
                    ? {
                        id: member.computers.id,
                        name: member.computers.name,
                        os: member.computers.os,
                        osVersion: member.computers.os_version,
                        ip: member.computers.ip,
                        loginUser: member.computers.login_user,
                    }
                    : null,
            }));
        }),

    // Update a dynamic group
    update: protectedProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                name: z.string().min(1).optional(),
                description: z.string().optional(),
                ruleExpression: ruleExpressionSchema.optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check if new name conflicts with another group
            if (input.name) {
                const { count, error: checkError } = await ctx.supabase
                    .from("dynamic_computer_groups")
                    .select("id", { count: "exact", head: true })
                    .eq("display_name", input.name)
                    .neq("id", input.id);

                if (checkError) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Unable to check existing groups",
                        cause: checkError,
                    });
                }

                if (count && count > 0) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Group with this name already exists",
                    });
                }
            }

            const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            };

            if (input.name !== undefined) {
                updateData.display_name = input.name;
            }
            if (input.description !== undefined) {
                updateData.description = input.description;
            }
            if (input.ruleExpression !== undefined) {
                updateData.rule_expression = input.ruleExpression;
            }

            const { error } = await ctx.supabase
                .from("dynamic_computer_groups")
                .update(updateData)
                .eq("id", input.id);

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Unable to update dynamic group",
                    cause: error,
                });
            }

            return { success: true };
        }),

    // Delete a dynamic group
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { error } = await ctx.supabase
                .from("dynamic_computer_groups")
                .delete()
                .eq("id", input.id);

            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Unable to delete dynamic group",
                    cause: error,
                });
            }

            return { success: true };
        }),

    // Preview which computers would match a rule expression (without creating a group)
    previewMembers: protectedProcedure
        .input(
            z.object({
                ruleExpression: ruleExpressionSchema,
            })
        )
        .query(async ({ ctx, input }) => {
            // Use RPC to evaluate rule expression against all computers
            const { data, error } = await ctx.supabase.rpc(
                "preview_dynamic_group_members",
                {
                    rule_expr: input.ruleExpression,
                }
            );

            if (error) {
                // If the RPC doesn't exist yet, fall back to returning empty
                console.error("Preview RPC error:", error);
                return [];
            }

            return data ?? [];
        }),

    // Refresh all dynamic group memberships (for time-based rules)
    refreshAll: protectedProcedure.mutation(async ({ ctx }) => {
        const { error } = await ctx.supabase.rpc(
            "refresh_all_dynamic_group_memberships"
        );

        if (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to refresh memberships",
                cause: error,
            });
        }

        return { success: true };
    }),
});
