"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useForm, useFieldArray, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";

// Properties available for filtering
const PROPERTIES = [
    { value: "name", label: "Computer Name" },
    { value: "os", label: "Operating System" },
    { value: "osVersion", label: "OS Version" },
    { value: "ip", label: "IP Address" },
    { value: "loginUser", label: "Login User" },
    { value: "createdAt", label: "Created At" },
] as const;

// Operators available for comparison
const TEXT_OPERATORS = [
    { value: "equals", label: "equals" },
    { value: "notEquals", label: "not equals" },
    { value: "contains", label: "contains" },
    { value: "notContains", label: "not contains" },
    { value: "startsWith", label: "starts with" },
    { value: "endsWith", label: "ends with" },
    { value: "regex", label: "matches regex" },
] as const;

const DATE_OPERATORS = [
    { value: "olderThanDays", label: "older than (days)" },
    { value: "newerThanDays", label: "newer than (days)" },
    { value: "after", label: "after date" },
    { value: "before", label: "before date" },
] as const;

// Combined operators for schema validation
const OPERATORS = [...TEXT_OPERATORS, ...DATE_OPERATORS] as const;

// Get operators based on property type
const getOperatorsForProperty = (property: string) => {
    if (property === "createdAt") {
        return DATE_OPERATORS;
    }
    return TEXT_OPERATORS;
};

// Schema for a single condition
const conditionSchema = z.object({
    property: z.enum(["name", "os", "osVersion", "ip", "loginUser", "createdAt"]),
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
    value: z.string().min(1, "Value is required"),
});

// Schema for a condition group (AND/OR block)
const conditionGroupSchema = z.object({
    logic: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).min(1, "At least one condition required"),
});

// Schema for entire rule expression
export const ruleExpressionFormSchema = z.object({
    logic: z.enum(["AND", "OR"]),
    groups: z.array(conditionGroupSchema).min(1, "At least one group required"),
});

export type RuleExpressionFormValues = z.infer<typeof ruleExpressionFormSchema>;
export type ConditionFormValues = z.infer<typeof conditionSchema>;

// Convert form values to API format
export function formToApiFormat(form: RuleExpressionFormValues): object {
    if (form.groups.length === 1 && form.groups[0].conditions.length === 1) {
        // Single condition - return it directly
        return form.groups[0].conditions[0];
    }

    if (form.groups.length === 1) {
        // Single group - return it directly
        return {
            logic: form.groups[0].logic,
            conditions: form.groups[0].conditions,
        };
    }

    // Multiple groups - wrap in outer logic
    return {
        logic: form.logic,
        conditions: form.groups.map((group) => {
            if (group.conditions.length === 1) {
                return group.conditions[0];
            }
            return {
                logic: group.logic,
                conditions: group.conditions,
            };
        }),
    };
}

// Convert API format back to form values
export function apiToFormFormat(apiRule: unknown): RuleExpressionFormValues {
    const defaultForm: RuleExpressionFormValues = {
        logic: "AND",
        groups: [
            {
                logic: "AND",
                conditions: [{ property: "name", operator: "contains", value: "" }],
            },
        ],
    };

    if (!apiRule || typeof apiRule !== "object") {
        return defaultForm;
    }

    const rule = apiRule as Record<string, unknown>;

    // Single condition (leaf node)
    if ("property" in rule && "operator" in rule && "value" in rule) {
        return {
            logic: "AND",
            groups: [
                {
                    logic: "AND",
                    conditions: [rule as ConditionFormValues],
                },
            ],
        };
    }

    // Nested structure
    if ("logic" in rule && "conditions" in rule) {
        const conditions = rule.conditions as unknown[];
        const logic = rule.logic as "AND" | "OR";

        // Check if all conditions are leaf nodes
        const allLeaf = conditions.every(
            (c) =>
                c &&
                typeof c === "object" &&
                "property" in (c as object) &&
                "operator" in (c as object)
        );

        if (allLeaf) {
            // Single group
            return {
                logic: "AND",
                groups: [
                    {
                        logic,
                        conditions: conditions as ConditionFormValues[],
                    },
                ],
            };
        }

        // Multiple groups
        const groups = conditions.map((c) => {
            if (
                c &&
                typeof c === "object" &&
                "property" in (c as object) &&
                "operator" in (c as object)
            ) {
                return {
                    logic: "AND" as const,
                    conditions: [c as ConditionFormValues],
                };
            }
            const group = c as { logic: "AND" | "OR"; conditions: ConditionFormValues[] };
            return {
                logic: group.logic,
                conditions: group.conditions,
            };
        });

        return { logic, groups };
    }

    return defaultForm;
}

interface RuleBuilderProps {
    value?: RuleExpressionFormValues;
    onChange?: (value: RuleExpressionFormValues) => void;
    disabled?: boolean;
}

export function RuleBuilder({ value, onChange, disabled }: RuleBuilderProps) {
    const defaultValues: RuleExpressionFormValues = value ?? {
        logic: "AND",
        groups: [
            {
                logic: "AND",
                conditions: [{ property: "name", operator: "contains", value: "" }],
            },
        ],
    };

    const form = useForm<RuleExpressionFormValues>({
        resolver: zodResolver(ruleExpressionFormSchema),
        defaultValues,
    });

    const { fields: groups, append: appendGroup, remove: removeGroup } = useFieldArray({
        control: form.control,
        name: "groups",
    });

    // Update internal form when value prop changes
    useEffect(() => {
        if (value) {
            // Only reset if the value is actually different from our internal state
            // to avoid focus loss and unnecessary re-renders while typing
            const currentValues = form.getValues();
            if (JSON.stringify(value) !== JSON.stringify(currentValues)) {
                form.reset(value);
            }
        }
    }, [value, form]);

    // Notify parent of changes
    const handleChange = () => {
        const values = form.getValues();
        onChange?.(values);
    };

    return (
        <div className="space-y-4">
            {/* Top-level logic selector */}
            {groups.length > 1 && (
                <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">
                        Match computers where
                    </Label>
                    <Controller
                        control={form.control}
                        name="logic"
                        render={({ field }) => (
                            <RadioGroup
                                value={field.value}
                                onValueChange={(v: string) => {
                                    field.onChange(v);
                                    handleChange();
                                }}
                                className="flex gap-4"
                                disabled={disabled}
                            >
                                <div className="flex items-center gap-1.5">
                                    <RadioGroupItem value="AND" id="top-and" />
                                    <Label htmlFor="top-and" className="text-sm font-normal">
                                        All groups match
                                    </Label>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <RadioGroupItem value="OR" id="top-or" />
                                    <Label htmlFor="top-or" className="text-sm font-normal">
                                        Any group matches
                                    </Label>
                                </div>
                            </RadioGroup>
                        )}
                    />
                </div>
            )}

            {/* Condition groups */}
            <div className="space-y-3">
                {groups.map((group, groupIndex) => (
                    <ConditionGroup
                        key={group.id}
                        groupIndex={groupIndex}
                        control={form.control}
                        onRemove={() => {
                            removeGroup(groupIndex);
                            handleChange();
                        }}
                        onChange={handleChange}
                        canRemove={groups.length > 1}
                        disabled={disabled}
                    />
                ))}
            </div>

            {/* Add group button */}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    appendGroup({
                        logic: "AND",
                        conditions: [{ property: "name", operator: "contains", value: "" }],
                    });
                    handleChange();
                }}
                disabled={disabled}
            >
                <Plus className="mr-1.5 h-4 w-4" />
                Add condition group
            </Button>
        </div>
    );
}

interface ConditionGroupProps {
    groupIndex: number;
    control: ReturnType<typeof useForm<RuleExpressionFormValues>>["control"];
    onRemove: () => void;
    onChange: () => void;
    canRemove: boolean;
    disabled?: boolean;
}

function ConditionGroup({
    groupIndex,
    control,
    onRemove,
    onChange,
    canRemove,
    disabled,
}: ConditionGroupProps) {
    const {
        fields: conditions,
        append: appendCondition,
        remove: removeCondition,
    } = useFieldArray({
        control,
        name: `groups.${groupIndex}.conditions`,
    });

    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                {/* Group header with delete button */}
                <div className="flex items-center justify-between">
                    {/* Group logic selector - only show when multiple conditions */}
                    {conditions.length > 1 ? (
                        <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Match</Label>
                            <Controller
                                control={control}
                                name={`groups.${groupIndex}.logic`}
                                render={({ field }) => (
                                    <RadioGroup
                                        value={field.value}
                                        onValueChange={(v: string) => {
                                            field.onChange(v);
                                            onChange();
                                        }}
                                        className="flex gap-3"
                                        disabled={disabled}
                                    >
                                        <div className="flex items-center gap-1">
                                            <RadioGroupItem value="AND" id={`group-${groupIndex}-and`} />
                                            <Label
                                                htmlFor={`group-${groupIndex}-and`}
                                                className="text-xs font-normal"
                                            >
                                                All
                                            </Label>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <RadioGroupItem value="OR" id={`group-${groupIndex}-or`} />
                                            <Label
                                                htmlFor={`group-${groupIndex}-or`}
                                                className="text-xs font-normal"
                                            >
                                                Any
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                )}
                            />
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground">Condition Group</div>
                    )}

                    {/* Delete group button */}
                    {canRemove && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={onRemove}
                            disabled={disabled}
                        >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                    )}
                </div>

                {/* Conditions */}
                <div className="space-y-2">
                    {conditions.map((condition, conditionIndex) => (
                        <div key={condition.id} className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground/50" />

                            {/* Property */}
                            <Controller
                                control={control}
                                name={`groups.${groupIndex}.conditions.${conditionIndex}.property`}
                                render={({ field }) => (
                                    <Select
                                        value={field.value}
                                        onValueChange={(v) => {
                                            field.onChange(v);
                                            onChange();
                                        }}
                                        disabled={disabled}
                                    >
                                        <SelectTrigger className="min-w-[140px] w-full max-w-[160px]">
                                            <SelectValue placeholder="Property" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PROPERTIES.map((p) => (
                                                <SelectItem key={p.value} value={p.value}>
                                                    {p.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />

                            {/* Operator - with dynamic filtering based on property */}
                            <Controller
                                control={control}
                                name={`groups.${groupIndex}.conditions.${conditionIndex}.operator`}
                                render={({ field }) => {
                                    // Watch the property value for this condition
                                    const propertyValue = useWatch({
                                        control,
                                        name: `groups.${groupIndex}.conditions.${conditionIndex}.property`,
                                    });
                                    const availableOperators = getOperatorsForProperty(propertyValue);

                                    // Check if current value is valid, if not show first valid option
                                    const isValidOperator = availableOperators.some(o => o.value === field.value);
                                    const displayValue = isValidOperator ? field.value : "";

                                    return (
                                        <Select
                                            value={displayValue}
                                            onValueChange={(v) => {
                                                field.onChange(v);
                                                onChange();
                                            }}
                                            disabled={disabled}
                                        >
                                            <SelectTrigger className="min-w-[130px] w-full max-w-[150px]">
                                                <SelectValue placeholder="Operator" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableOperators.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    );
                                }}
                            />

                            {/* Value - with conditional date picker */}
                            <Controller
                                control={control}
                                name={`groups.${groupIndex}.conditions.${conditionIndex}.value`}
                                render={({ field }) => {
                                    // Watch the operator value for this condition
                                    const operatorValue = useWatch({
                                        control,
                                        name: `groups.${groupIndex}.conditions.${conditionIndex}.operator`,
                                    });
                                    const isDateOperator = operatorValue === "after" || operatorValue === "before";

                                    if (isDateOperator) {
                                        return (
                                            <div className="flex-1">
                                                <DatePicker
                                                    value={field.value}
                                                    onChange={(v) => {
                                                        field.onChange(v);
                                                        onChange();
                                                    }}
                                                    disabled={disabled}
                                                    placeholder="Select date"
                                                />
                                            </div>
                                        );
                                    }

                                    return (
                                        <Input
                                            {...field}
                                            placeholder="Value..."
                                            className="flex-1"
                                            onChange={(e) => {
                                                field.onChange(e);
                                                onChange();
                                            }}
                                            disabled={disabled}
                                        />
                                    );
                                }}
                            />

                            {/* Remove condition */}
                            {conditions.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => {
                                        removeCondition(conditionIndex);
                                        onChange();
                                    }}
                                    disabled={disabled}
                                >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Add condition */}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                        appendCondition({ property: "name", operator: "contains", value: "" });
                        onChange();
                    }}
                    disabled={disabled}
                >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add condition
                </Button>
            </CardContent>
        </Card>
    );
}
