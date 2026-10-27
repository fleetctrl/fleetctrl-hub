import type { ComputerRow } from "@/features/computers/server";
import { ruleExpressionSchema, type RuleCondition, type RuleExpression } from "../contract";

/** The computer fields dynamic group rules can read. */
export type RuleSubject = {
    id: string;
    name: string;
    os: string | null;
    osVersion: string | null;
    ip: string | null;
    loginUser: string | null;
    intuneId: string | null;
    clientVersion: string | null;
    createdAt: number;
};

export function toRuleSubject(computer: ComputerRow): RuleSubject {
    return {
        id: computer.id,
        name: computer.name,
        os: computer.os,
        osVersion: computer.osVersion,
        ip: computer.ip,
        loginUser: computer.loginUser,
        intuneId: computer.intuneId,
        clientVersion: computer.clientVersion,
        createdAt: computer.createdAt.getTime(),
    };
}

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

function evaluateCondition(condition: RuleCondition, computer: RuleSubject, asOf: number): boolean {
    let textValue: string | undefined;

    switch (condition.property) {
        case "name":
            textValue = computer.name;
            break;
        case "os":
            textValue = computer.os ?? undefined;
            break;
        case "osVersion":
            textValue = computer.osVersion ?? undefined;
            break;
        case "ip":
            textValue = computer.ip ?? undefined;
            break;
        case "loginUser":
            textValue = computer.loginUser ?? undefined;
            break;
        case "intuneMdm":
        case "intuneEnrolled":
            textValue = computer.intuneId ? "true" : "false";
            break;
        case "clientVersion":
            textValue = computer.clientVersion ?? undefined;
            break;
        case "createdAt": {
            const createdAt = computer.createdAt;
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

export function evaluateRule(ruleExpression: RuleExpression, computer: RuleSubject, asOf: number): boolean {
    if ("property" in ruleExpression) {
        return evaluateCondition(ruleExpression, computer, asOf);
    }

    const results = ruleExpression.conditions.map((condition) => evaluateRule(condition, computer, asOf));

    if (ruleExpression.logic === "AND") {
        return results.every(Boolean);
    }

    return results.some(Boolean);
}
