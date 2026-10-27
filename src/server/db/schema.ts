// Aggregates every feature's tables for the typed Drizzle client and drizzle-kit.
// The one place outside a feature allowed to import feature schema files directly.
export * from "@/features/auth/server/schema";
export * from "@/features/files/server/schema";
export * from "@/features/computers/server/schema";
export * from "@/features/device-auth/server/schema";
export * from "@/features/groups/server/schema";
export * from "@/features/tasks/server/schema";
export * from "@/features/apps/server/schema";
export * from "@/features/client-updates/server/schema";
export * from "@/server/security/schema";
