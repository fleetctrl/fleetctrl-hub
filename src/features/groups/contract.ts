import { z } from "zod";

const ruleConditionSchema = z.object({
    property: z.enum([
        "name",
        "os",
        "osVersion",
        "ip",
        "loginUser",
        "createdAt",
        "intuneMdm",
        "intuneEnrolled",
        "clientVersion",
    ]),
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
    value: z.string().min(1),
});

export type RuleCondition = z.infer<typeof ruleConditionSchema>;

export type RuleExpression = RuleCondition | {
    logic: "AND" | "OR";
    conditions: RuleExpression[];
};

export const ruleExpressionSchema: z.ZodType<RuleExpression> = z.lazy(() =>
    z.union([
        ruleConditionSchema,
        z.object({
            logic: z.enum(["AND", "OR"]),
            conditions: z.array(ruleExpressionSchema).min(1),
        }),
    ])
);

export const paginationQuerySchema = z.object({
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});

export const staticGroupInputSchema = z.object({
    displayName: z.string(),
    description: z.string().optional(),
    memberIds: z.array(z.string()).optional(),
});

export const staticGroupUpdateSchema = staticGroupInputSchema.partial();

export const dynamicGroupInputSchema = z.object({
    displayName: z.string(),
    description: z.string().optional(),
    ruleExpression: z.unknown(),
});

export const dynamicGroupUpdateSchema = z.object({
    displayName: z.string().optional(),
    description: z.string().optional(),
    ruleExpression: z.unknown().optional(),
});

export const rulePreviewSchema = z.object({
    ruleExpression: z.unknown(),
    asOf: z.number(),
});
