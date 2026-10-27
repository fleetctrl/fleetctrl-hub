import { defineConfig } from "tsup";

// Bundles the API service (and its one-shot tools) into self-contained ESM files for the
// `fleetctrl-api` image, so the image needs no node_modules.
export default defineConfig({
    entry: {
        index: "src/server/index.ts",
        migrate: "src/server/db/migrate.ts",
        "import-convex": "scripts/import-convex/index.ts",
    },
    outDir: "dist/api",
    format: ["esm"],
    platform: "node",
    target: "node22",
    bundle: true,
    noExternal: [/.*/],
    // Optional native binding of `pg`, never installed.
    external: ["pg-native"],
    splitting: false,
    sourcemap: true,
    clean: true,
    // Bundled CommonJS dependencies (pg, ...) call require().
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
