# FleetCtrl Hub

The backend is a Hono API on Node (`src/server/index.ts`) with PostgreSQL (Drizzle ORM) and RustFS
(S3) storage. Next.js (`src/app`) is UI only and talks to the API. Background and decisions:
`docs/migration-convex-to-postgres.md`.

`convex/` is the v2 backend, kept only so installations can roll back during the upgrade window.
Do not add features there; it is deleted in Phase 6 of the migration plan.

## Code organization: feature ownership

```
src/features/<feature>/
  contract.ts          zod schemas + DTO types shared by server and ui
  server/index.ts      public server API: the only entry other features may import
  server/schema.ts     Drizzle tables this feature owns
  server/service.ts    domain logic and queries (take a db or transaction)
  server/*.routes.ts   device.routes.ts (device API), admin.routes.ts (exports its type for hc)
  server/jobs.ts       cron jobs
  ui/index.ts          public UI entry ("use client" barrel)
  ui/api.ts            typed hc client, query keys and hooks
src/server/            kernel + composition root (app.ts); owns no business tables
src/app/               thin Next.js pages rendering feature UI
```

Rules:

1. A feature owns its tables. Only that feature's `server/` code writes them; other features call its `server/index.ts`.
2. Reads across features go through the owner's public API. Exception: read-only joins for display columns, using the table object the owner exports from `server/index.ts`.
3. No deep imports: other features are reached only through `@/features/<feature>/server` or `@/features/<feature>/ui`.
4. UI never imports server code at runtime. `ui/` may `import type` its own `server/admin.routes.ts` (for `hc`) and use `contract.ts`.
5. The dependency graph stays acyclic. Upward notifications use domain events (`src/server/events.ts`), handled inside the emitter's transaction.
6. Cross-feature cleanup happens through FK cascades, never through service calls.
7. Composition happens only in `src/server/app.ts`: routers, `requireSession`/`requireDevice`, event handlers, jobs.

Rules 3 and 4 (and the kernel's independence) are enforced by `anti-slop/feature-boundaries` in `pnpm lint`.
`src/server/db/schema.ts`, `drizzle.config.ts`, `scripts/import-convex/` and tests are the sanctioned exceptions.

## Device API contract

The deployed Windows client (`fleetctrl-client`) depends on the device API byte for byte: paths, status
codes, JSON shapes, the `X-Client-Update` header, epoch-millisecond timestamps, and the existing IDs.
Every response goes through a mapper; never return raw rows. `tests/contract/` is the gate.
Never change `API_URL`, `JWT_SECRET` or the `/api` path layout.

## Commands

- `pnpm dev:api` / `pnpm dev`: API on :3001 and dashboard on :3000 (Next proxies `/api` and `/auth`)
- `pnpm db:generate` after changing a `schema.ts`; commit the generated SQL in `drizzle/`
- `pnpm test` (PGlite); add `TEST_DATABASE_URL` to also run the Postgres concurrency tests
- `pnpm lint`
