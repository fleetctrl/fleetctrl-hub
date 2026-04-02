import { z } from "zod";

import type { Doc } from "../_generated/dataModel";

type Computer = Doc<"computers">;

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

export function parseRuleExpression(ruleExpression: unknown): RuleExpression {
    return ruleExpressionSchema.parse(ruleExpression);
}

function parseDateValue(value: string): number | null {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    const parsedDate = Date.parse(value);
    return Number.isNaN(parsedDate) ? null : parsedDate;
}

function evaluateCondition(
    condition: RuleCondition,
    computer: Computer,
    asOf: number
): boolean {
    let textValue: string | undefined;

    switch (condition.property) {
        case "name":
            textValue = computer.name;
            break;
        case "os":
            textValue = computer.os ?? undefined;
            break;
        case "osVersion":
            textValue = computer.os_version ?? undefined;
            break;
        case "ip":
            textValue = computer.ip ?? undefined;
            break;
        case "loginUser":
            textValue = computer.login_user ?? undefined;
            break;
        case "intuneMdm":
        case "intuneEnrolled":
            textValue = computer.intune_id ? "true" : "false";
            break;
        case "clientVersion":
            textValue = computer.client_version ?? undefined;
            break;
        case "createdAt": {
            const createdAt = computer._creationTime;
            switch (condition.operator) {
                case "olderThanDays": {
                    const days = Number.parseInt(condition.value, 10);
                    if (Number.isNaN(days)) {
                        return false;
                    }
                    return createdAt < asOf - days * 24 * 60 * 60 * 1000;
                }
                case "newerThanDays": {
                    const days = Number.parseInt(condition.value, 10);
                    if (Number.isNaN(days)) {
                        return false;
                    }
                    return createdAt >= asOf - days * 24 * 60 * 60 * 1000;
                }
                case "after": {
                    const compareAt = parseDateValue(condition.value);
                    return compareAt !== null ? createdAt > compareAt : false;
                }
                case "before": {
                    const compareAt = parseDateValue(condition.value);
                    return compareAt !== null ? createdAt < compareAt : false;
                }
                default:
                    return false;
            }
        }
        default:
            return false;
    }

    if (textValue === undefined) {
        return false;
    }

    switch (condition.operator) {
        case "equals":
            return textValue === condition.value;
        case "notEquals":
            return textValue !== condition.value;
        case "contains":
            return textValue.toLowerCase().includes(condition.value.toLowerCase());
        case "notContains":
            return !textValue.toLowerCase().includes(condition.value.toLowerCase());
        case "startsWith":
            return textValue.toLowerCase().startsWith(condition.value.toLowerCase());
        case "endsWith":
            return textValue.toLowerCase().endsWith(condition.value.toLowerCase());
        case "regex":
            try {
                return new RegExp(condition.value).test(textValue);
            } catch {
                return false;
            }
        default:
            return false;
    }
}

export function evaluateRule(
    ruleExpression: RuleExpression,
    computer: Computer,
    asOf: number
): boolean {
    if ("property" in ruleExpression) {
        return evaluateCondition(ruleExpression, computer, asOf);
    }

    const results = ruleExpression.conditions.map((condition) =>
        evaluateRule(condition, computer, asOf)
    );

    if (ruleExpression.logic === "AND") {
        return results.every(Boolean);
    }

    return results.some(Boolean);
}
