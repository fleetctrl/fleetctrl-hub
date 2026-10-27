import { index, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamptz } from "@/server/db/columns";
import { computers } from "@/features/computers/server";
import type { RuleExpression } from "../contract";

export const computerGroups = pgTable("computer_groups", {
    id: primaryId(),
    createdAt: createdAt(),
    displayName: text().notNull(),
    description: text(),
}, (t) => [
    index("computer_groups_display_name_idx").on(t.displayName),
    index("computer_groups_created_at_idx").on(t.createdAt, t.id),
]);

export const computerGroupMembers = pgTable("computer_group_members", {
    groupId: text().notNull().references(() => computerGroups.id, { onDelete: "cascade" }),
    computerId: text().notNull().references(() => computers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
}, (t) => [
    primaryKey({ columns: [t.groupId, t.computerId] }),
    index("computer_group_members_computer_id_idx").on(t.computerId),
]);

export const dynamicComputerGroups = pgTable("dynamic_computer_groups", {
    id: primaryId(),
    createdAt: createdAt(),
    displayName: text().notNull(),
    description: text(),
    ruleExpression: jsonb().$type<RuleExpression>().notNull(),
    lastEvaluatedAt: timestamptz(),
}, (t) => [
    index("dynamic_computer_groups_display_name_idx").on(t.displayName),
    index("dynamic_computer_groups_created_at_idx").on(t.createdAt, t.id),
]);

export const dynamicGroupMembers = pgTable("dynamic_group_members", {
    groupId: text().notNull().references(() => dynamicComputerGroups.id, { onDelete: "cascade" }),
    computerId: text().notNull().references(() => computers.id, { onDelete: "cascade" }),
    addedAt: timestamptz().notNull(),
}, (t) => [
    primaryKey({ columns: [t.groupId, t.computerId] }),
    index("dynamic_group_members_computer_id_idx").on(t.computerId),
    index("dynamic_group_members_group_added_idx").on(t.groupId, t.addedAt),
]);

export type ComputerGroupRow = typeof computerGroups.$inferSelect;
export type DynamicComputerGroupRow = typeof dynamicComputerGroups.$inferSelect;
