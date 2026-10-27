import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/server/db/schema.ts",
    out: "./drizzle",
    casing: "snake_case",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? "postgres://fleetctrl:fleetctrl@localhost:5433/fleetctrl",
    },
});
