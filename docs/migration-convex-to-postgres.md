# Migration plan: Convex → Postgres + RustFS + Hono

Status: implemented on `feat/postgres-migration` (phases 0–5; see "Implementation status") · Target release: v3.0.0

This plan moves the Hub off Convex to:

- **PostgreSQL**, accessed with **Drizzle ORM** (schema, queries, SQL migrations)
- **RustFS** as S3-compatible object storage, replacing Convex file storage
- **Hono** on Node as the only API server: device API, Better Auth, and the admin API used by the dashboard

Next.js stays, but becomes a UI-only app that calls the Hono API. The code is organized by **feature ownership** (§3): every feature owns its tables, logic, routes and UI in one folder.

## Implementation status

Phases 0–5 are implemented. Phase 6 (deleting `convex/` and the Convex dependencies) waits for the rollback window,
as planned. Still to do before the cutover:

- Run the device contract suite against v2 (`CONTRACT_BASE_URL=https://<host>/api CONTRACT_ENROLLMENT_TOKEN=<token> pnpm vitest run tests/contract/device-api.test.ts`) and
  a real Go client end to end against compose v3 (enroll → assigned → download → state → self-update).
- Rehearse `manage.sh migrate-from-convex` and `rollback-to-convex` on a production-sized export and measure downtime.
- Run the importer dry run on the production export: the local backups contain a duplicate static-group assignment
  (same release and group twice), which needs a decision.

Verified so far: 71 new tests (feature, importer and device-contract tests on PGlite; concurrency tests on Postgres 17),
the contract suite over HTTP against a running v3 API with Postgres 17 and RustFS, a real import of a local Convex
export (files verified against `_storage` hashes), and the dashboard driven in headless Chromium on the imported data.

### Phase 0 findings

- **Export layout**: app tables in `<table>/documents.jsonl`, Better Auth tables in
  `_components/betterAuth/<table>/documents.jsonl`, files in `_storage/<id>` (sometimes with an extension) with
  `_storage/documents.jsonl` holding base64 SHA-256 and size. Every number is a float (`4.0`, fractional
  `_creationTime`). Aggregate and migration components are ignored.
- **RustFS ignores `Authorization` on presigned URLs**: a presigned GET carrying `Authorization: Bearer …` and `DPoP`
  (what the client's transport sends after a redirect) returns 200. The 307 redirect would therefore work with RustFS,
  unlike AWS S3. Streaming stays the decision: presigning would need RustFS reachable publicly under a matching host,
  and RustFS can stay internal.
- **`GET /client/version` required DPoP in v2**: the protected router's `use("*")` also matched routes registered after
  it, so `/client/version` and unknown paths answered 401 without a device token. v3 serves `/client/version`
  publicly as this plan specifies (the client never calls it); unknown paths still answer 401 without a token.
- **Password hashes**: imported credential accounts use Better Auth's `salt:key` scrypt format and sign in unchanged.

### Decisions made during implementation

- `ON DELETE RESTRICT` raises SQLSTATE 23001, not 23503; the files GC treats both as "still referenced".
- All timestamps are `timestamptz(3)`, so values round-trip through epoch milliseconds exactly (reinstall
  acknowledgement compares them). New IDs are UUIDv7, monotonic within a process, so rows inserted in one transaction
  keep their order.
- `version_sort_key` columns use `COLLATE "C"`: the keys rely on byte order of `|` and `:`, which linguistic collations
  ignore.
- `(app_id, version)` is not unique (v2 allowed duplicate versions); the importer does not need to audit it.
- Admin search splits the input into words and requires each (`ILIKE`), instead of one substring.
- The JTI store remembers proofs for 17 minutes (15-minute proof age plus 2 minutes of allowed clock skew).
- After any admin mutation, the dashboard invalidates all active queries instead of per-feature keys: only on-screen
  queries refetch, and cross-feature effects (deleting a computer changes group counts) need no wiring.
- Release edits keep the stored name, hash and size of files that did not change. The v2 release form re-sends
  unchanged files with placeholder names (`installer.zip`, `script.ps1`), which renamed installers on every edit.
- The importer resolves some conflicts automatically (installs per computer and app, active client versions, one
  win32/winget row per release) and asks for a decision on others (duplicate `jkt`, token hashes, group assignments,
  user emails, invalid dynamic-group rules); `--auto-resolve` applies the listed default.
- The presence stream sets `Cache-Control: no-transform`: compressing proxies (Next's dev server gzips by default)
  otherwise buffer the events.
- Unused v2 queries and mutations were not ported (e.g. `enrollmentTokens.disable`, `apps.getReleases`).

## 1. Non-negotiables

These constraints come from the deployed Windows client (`fleetctrl-client`, Go). Breaking any of them takes the whole fleet offline or makes every device reinstall its apps.

1. **The device API contract stays byte-compatible**: same paths, methods, status codes, JSON shapes, the `X-Client-Update` header, and timestamps as epoch-millisecond numbers. The one intended change is `is-enrolled` (§6).
2. **Existing IDs are preserved.** The client stores `DeviceID` in the registry, the access-token subject is `device:<id>`, and the client's local SQLite DB is keyed by `release_id`. Computer, release, requirement, script and client-update IDs must keep their current Convex values.
3. **`JWT_SECRET` and `API_URL` stay unchanged**, along with the public path layout (Caddy strips `/api`). DPoP proofs bind `htu` to `API_URL + pathname`, so any change here makes every device request fail with 401. Access tokens already issued (15-minute lifetime) stay valid across the cutover.
4. **One-time cutover with rollback.** Convex data is never modified during migration, so rolling back means starting the old stack again.

## 2. Target architecture

```
                 ┌──────────── Caddy ────────────┐
 browser ──────► │ /auth*  → api  (no strip)     │
 Go client ────► │ /api*   → api  (strip /api)   │
                 │ *       → hub  (Next.js UI)   │
                 └───────────────┬───────────────┘
                                 │
        ┌────────────────────────▼─────────────────────────┐
        │ api  (Hono on @hono/node-server)                 │
        │  /…            device API (unchanged contract)   │
        │  /auth/*       Better Auth (drizzle adapter)     │
        │  /admin/*      admin API for the dashboard       │
        │  /admin/computers/presence   SSE (realtime)      │
        │  cron jobs     (croner + pg advisory locks)      │
        └───────┬─────────────────────────────┬────────────┘
                │ Drizzle (pg) + LISTEN       │ @aws-sdk/client-s3
          ┌─────▼─────┐                 ┌─────▼─────┐
          │ Postgres  │                 │  RustFS   │ (internal only)
          └───────────┘                 └───────────┘
```

### Key decisions

| Topic | Decision | Why |
| --- | --- | --- |
| API server | One standalone Hono service for device, auth and admin routes | Hono is already used for the device API (`convex/http.ts`). A long-running process is needed anyway for crons, SSE and streaming. It keeps one auth surface. |
| Dashboard data access | Per-feature Hono RPC clients (`hc<FeatureAdminRoutes>`) + TanStack Query | End-to-end types similar to Convex's `api.*`. Per-feature clients keep TypeScript fast. |
| Code organization | Single package with **feature-owned folders** `src/features/<feature>/{server,ui}`, a server kernel in `src/server/`, and Next.js pages in `src/app/` | Each feature has one owner and one place to change. The existing `src/modules/*` UI is already split along these lines. |
| ORM / driver | `drizzle-orm` + `pg` (node-postgres), `drizzle-kit` for SQL migrations | Drizzle was requested; `pg` is the most widely supported driver (Better Auth adapter, PGlite parity, `LISTEN`). |
| IDs | `text` primary keys. Imported rows keep their Convex `_id`; new rows get UUIDv7 generated in the app | Required by non-negotiable #2. The client treats IDs as opaque strings. Postgres 17 has no built-in `uuidv7()`. |
| Timestamps | `timestamptz` in the DB; explicit mappers convert to epoch ms in API responses | Correct Postgres types. The mappers protect the numeric contract (risk R4). |
| Storage | One private RustFS bucket `fleetctrl-files` plus a `files` table that replaces `_storage` | Gives FK integrity and a single owner for garbage collection. |
| Device downloads | API **streams** objects from RustFS instead of a 307 redirect to a presigned URL | The client's `AuthTransport` adds `Authorization` + `DPoP` to *every* request, including the request that follows the redirect. S3 rejects a request that carries both a presigned signature and an `Authorization` header (§8). |
| Realtime | **Only computer online/offline status is realtime**, via SSE fed by Postgres `LISTEN/NOTIFY` (§7). Everything else loads fresh on mount, on window focus, and after the user's own mutations, with no polling. | Matches what admins need today. Other screens can get realtime later through the same mechanism. |
| Admin sessions | Import users + credential accounts; skip sessions. Admins sign in once after the upgrade. | Password hashes are adapter-independent; migrating sessions isn't worth the complexity. |

## 3. Code structure: feature ownership

### Layout

```
src/
  app/                               # Next.js routes only: thin pages that render feature UI
  features/
    <feature>/
      contract.ts                    # zod schemas + DTO types shared by server and ui
      server/
        index.ts                     # public server API: the only entry other features may import
        schema.ts                    # Drizzle tables/enums this feature owns
        service.ts                   # domain logic and queries (accept db or tx)
        dto.ts                       # row → response mappers (epoch ms, null-dropping)
        device.routes.ts             # device API routes, if any
        admin.routes.ts              # admin API routes, if any (exports its route type for hc)
        jobs.ts                      # cron jobs, if any
        *.test.ts
      ui/
        index.ts                     # public UI entry for pages and other features
        api.ts                       # hc client, query keys, hooks, invalidation
        components/ …                # moved from src/modules/<module>
  server/                            # kernel + composition root (owns no business tables)
    index.ts                         # serve() entry; starts crons and pubsub
    app.ts                           # mounts feature routers and middleware; registers jobs and events
    env.ts  db/  storage/s3.ts  pubsub.ts  cron.ts  events.ts  http/  pagination.ts
    security/                        # dpop.ts, jwt.ts, encoding.ts, jti store, requireDevice middleware
  components/ui/, lib/, hooks/       # shared UI kernel (shadcn, virtual-table, generic api hooks)
drizzle/                             # generated SQL migrations (committed)
scripts/import-convex/               # one-off importer (sanctioned exception to ownership)
tests/contract/                      # device API contract suite (cross-cutting)
```

### Ownership rules

1. **A feature owns its tables.** Only that feature's `server/` code writes them. Other features call its public `server/index.ts`.
2. **Reads across features go through the owner's public API.** One sanctioned exception: read-only joins for display columns (e.g. computer name in install-status lists), using the table object the owner exports from `server/index.ts`. Writes to another feature's tables are never allowed.
3. **No deep imports.** `@/features/<other>/server/*` and `@/features/<other>/ui/*` are off limits; only the `index.ts` entries are allowed.
4. **UI never imports server code at runtime.** `ui/` may use `import type` from its *own* feature's `server/admin.routes.ts` (for `hc`), plus `contract.ts`.
5. **The dependency graph stays acyclic.** Upward notifications use in-process domain events from `src/server/events.ts`, dispatched synchronously **inside the caller's transaction**, which keeps Convex's single-mutation semantics. Example: `computers` emits `computer.ruleFieldsChanged` and `groups` handles it.
6. **Cross-feature cleanup happens through FK cascades**, never through service calls. Deleting a computer, group, app or release cleans up dependent rows wherever they live.
7. **Composition happens only in `src/server/app.ts`.** It mounts routers, applies `requireSession` to `/admin/*` and `requireDevice` + the `X-Client-Update` middleware to protected device routes, registers event handlers and cron jobs, and aggregates the Drizzle schema.

Enforcement: add a `feature-boundaries` rule to the existing custom oxlint plugin (`tools/oxlint/anti-slop`) covering rules 3 and 4, and replace the Convex instructions in `CLAUDE.md`/`AGENTS.md` with these rules in Phase 1. Rules 1, 2 and 6 are checked in review.

### Features

| Feature | Owns tables | Device routes | Admin API | Jobs / events | UI (moved from) |
| --- | --- | --- | --- | --- | --- |
| `auth` | `user`, `account`, `session`, `verification` | — | `/auth/*` (Better Auth) | — | `src/modules/account`, `src/app/sign-in` |
| `computers` | `computers` | `POST /computer/heartbeat`, `PATCH /computer/rustdesk-sync`, `PATCH /computer/hardware-sync` | list, paginated list, detail, delete, **presence SSE** | emits `computer.ruleFieldsChanged`; `NOTIFY computer_presence` | `src/modules/computers` |
| `device-auth` | `enrollment_tokens`, `refresh_tokens` | `POST /enroll`, `GET /devices/:deviceId/is-enrolled`, `POST /token/refresh`, `POST /token/recover` | enrollment-token CRUD | daily refresh-token expiry + purge | `src/modules/keys` |
| `groups` | `computer_groups`, `computer_group_members`, `dynamic_computer_groups`, `dynamic_group_members` | — | static + dynamic CRUD, members, rule preview, refresh-all | hourly dynamic refresh; handles `computer.ruleFieldsChanged` | `src/modules/groups`, `src/components/dynamic-group-rule-builder.tsx` |
| `apps` | `apps`, `releases`, `win32_releases`, `winget_releases`, `detection_rules`, `release_requirements`, `release_scripts`, `computer_group_releases`, `dynamic_group_releases`, `computer_apps_installs` | `GET /apps/assigned`, `GET /apps/download/:releaseId`, `GET /apps/requirement/download/:requirementId`, `GET /apps/script/download/:scriptId`, `PATCH /apps/release/:releaseId/state` | apps/releases CRUD, install status, reinstall | — | `src/modules/apps`, `src/lib/schemas/create-app.ts` |
| `tasks` | `tasks` | `GET /tasks`, `PATCH /task/:taskId` | tasks by computer, create | — | tasks tab in computer detail |
| `client-updates` | `client_updates` | `GET /client/version`, `GET /client/download/:versionId`; `X-Client-Update` middleware | CRUD, set active, deactivate | — | `src/modules/client` |
| `files` | `files` | — (owners stream through `files.stream()`) | `PUT /admin/files` (upload) | daily GC | upload helper (replaces `src/lib/convex-upload.ts`) |
| `dashboard` | — | — | — | — | `src/modules/dashboard` (composes other features' UI hooks) |

The kernel owns one infrastructure table, `dpop_jti`, used by `requireDevice`. Keeping DPoP/JWT verification in the kernel stops `device-auth` from becoming a dependency of every feature with device routes. `device-auth` itself depends on `computers`, so putting the middleware there would create a cycle.

### Dependency graph

```
auth, files, computers            (leaves; computers emits events)
groups          → computers
device-auth     → computers
tasks           → computers
client-updates  → files
apps            → computers, groups, files
dashboard (ui)  → ui of the features above
```

## 4. Data model

### Conventions

- `snake_case` column names (Drizzle `casing: "snake_case"`), so the TypeScript side uses camelCase.
- Convex `_creationTime` becomes `created_at timestamptz not null default now()`.
- `v.optional(x)` becomes a nullable column. Response mappers drop `null` so the JSON shape matches what Convex returned.
- A union of literals becomes a `pgEnum`. `v.any()` and nested objects (`rule_expression`, detection `config`, `task_data`, `hardware`) become `jsonb`, validated with the zod schemas in the owning feature's `contract.ts`.
- Byte sizes and `rustdesk_id` (10-digit values exceed int4) are `bigint` with `{ mode: "number" }`.
- Every `v.id()` becomes a real foreign key, indexed. The cascade rules replace the delete triggers in `convex/functions.ts`.
- `drizzle.config.ts` collects `src/features/*/server/schema.ts` plus the kernel schema; `src/server/db/schema.ts` re-exports all of them for the typed client.

Example (`src/features/computers/server/schema.ts`):

```ts
export const computers = pgTable("computers", {
  id: text().primaryKey().$defaultFn(() => uuidv7()),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  name: text().notNull(),
  jkt: text(),
  rustdeskId: bigint({ mode: "number" }),
  ip: text(), os: text(), osVersion: text(), loginUser: text(),
  clientVersion: text(), intuneId: text(),
  lastConnection: timestamp({ withTimezone: true }),
  lastInventoryAt: timestamp({ withTimezone: true }),
  hardware: jsonb().$type<Hardware>(),
  searchText: text().generatedAlwaysAs(sql`lower(name || ' ' || coalesce(login_user, ''))`),
}, (t) => [
  uniqueIndex().on(t.jkt).where(sql`jkt is not null`),
  index().on(t.name), index().on(t.os),
  index("computers_search_trgm").using("gin", sql`search_text gin_trgm_ops`),
]);
```

### Table mapping

| Convex | Postgres | Owner | Changes |
| --- | --- | --- | --- |
| `computers` | `computers` | computers | `search_text` becomes a generated column with a trigram GIN index (the first migration runs `CREATE EXTENSION pg_trgm`). `jkt` is unique where not null, after the data audit. |
| `enrollment_tokens` | same | device-auth | `token_hash` unique |
| `refresh_tokens` | same | device-auth | `token_hash` unique. FK → computers `on delete cascade`. Indexes `(status, expires_at)` and `(computer_id, status)`. |
| `tasks` | same | tasks | FK cascade, `task_data jsonb` |
| `computer_groups`, `computer_group_members` | same | groups | Members use PK `(group_id, computer_id)`; both FKs cascade |
| `dynamic_computer_groups`, `dynamic_group_members` | same | groups | `rule_expression jsonb`; members use a composite PK, both FKs cascade |
| `apps` | same | apps | Drop the deprecated `allow_multiple_versions` |
| `releases` | same | apps | FK → apps cascade; `version_sort_key` not null (still computed by `versionSortKey`); unique `(app_id, version)` if the audit is clean |
| `win32_releases`, `winget_releases` | same | apps | `release_id` unique (1:1), FK cascade. Win32 `install_binary_file_id` → `files` `on delete restrict`. |
| `detection_rules`, `release_requirements`, `release_scripts` | same | apps | FK cascade; `storage_id` becomes `file_id` → `files` `on delete restrict` |
| `computer_group_releases`, `dynamic_group_releases` | same | apps | Unique `(release_id, group_id)`; FKs cascade |
| `computer_apps_installs` | same | apps | **Unique `(computer_id, app_id)`**, which makes upserts possible. `release_id` FK cascade (matches today's trigger). Index `(app_id, status)` replaces the aggregate. |
| `client_updates` | same | client-updates | `file_id` → files `on delete restrict`. A partial unique index `ON (is_active) WHERE is_active` guarantees a single active version. |
| `_storage` (system) | `files` | files | `id, object_key, size, sha256, content_type, original_name, created_at` |
| Better Auth component: `user`, `account`, `session`, `verification` | Better Auth Drizzle schema (`@better-auth/cli generate`) | auth | `role` is kept as an additional field. `jwks` is dropped: it only served the Convex JWT plugin. |
| (in-memory `src/lib/jtiStore.ts`) | `dpop_jti` (UNLOGGED) | kernel | `jti` PK, `expires_at`. Replay protection becomes correct across restarts and replicas. |
| `installStatusAggregate`, `computerAggregate`, `migrations` components | none | — | Replaced by `count(*)` / `GROUP BY` and by drizzle-kit migrations |

## 5. Replacing Convex mechanisms

| Convex mechanism | Used in | Replacement |
| --- | --- | --- |
| Triggers: cascading deletes | `functions.ts` | `ON DELETE CASCADE` foreign keys |
| Trigger: `search_text` | `functions.ts` | Generated column |
| Triggers: aggregates | `functions.ts`, `lib/aggregate/*` | `select app_id, status, count(*) … group by` on the `(app_id, status)` index; `count(*)` for computers |
| Trigger: delete storage when a release is deleted | `functions.ts` | `files` GC job (§8) |
| `scheduler.runAfter(0, refreshComputerMemberships)` | `computers.ts` | `computer.ruleFieldsChanged` event handled by `groups` inside the same transaction. Evaluating one computer against all groups is cheap. |
| `scheduler.runAfter(0, refreshGroupMembership)` | `groups.ts` | Same transaction. Today this already scans every computer inside a single mutation. |
| `crons.ts` (token expiry daily, dynamic groups hourly) | `crons.ts` | Each feature's `jobs.ts`, registered by the composition root with `croner`. Each job runs under `pg_try_advisory_lock` so multiple replicas never run it twice. New jobs: `dpop_jti` cleanup (kernel), `files` GC, and deleting refresh tokens that are expired or revoked for more than 30 days (Convex only marks them). |
| `.paginate()` + `usePaginatedQuery` | 9 queries | Keyset pagination on `(sort_key, id)` via the kernel's `pagination.ts`. Responses keep the shape `{ page, continueCursor, isDone }`. |
| `withSearchIndex` | `computers.listPaginated`, `staticGroups.getComputersForGroupsPaginated` | `ILIKE '%term%'` on trigram-indexed columns. Ordering changes from relevance to name. |
| Live `useQuery` | all dashboard reads | Computer status: SSE (§7). Everything else: TanStack Query refetch on mount, on focus and on invalidation. |
| `ctx.storage.*` | `apps.ts`, `clientUpdates.ts`, `client.ts` | `files` feature public API (§8) |
| `ctx.auth` / `withAuth*` | `lib/withAuth.ts` | `requireSession` applied once to `/admin/*` by the composition root (`auth.api.getSession({ headers })`) |
| `@convex-dev/better-auth` + `convex()` plugin | `auth.ts`, `betterAuth/*` | Plain Better Auth with `drizzleAdapter(db, { provider: "pg" })` in the `auth` feature |
| `db.normalizeId` | `lib/idNormalization.ts` | Plain lookup; an unknown ID returns 404 |
| Serializable OCC mutations | everywhere | `db.transaction()` plus explicit locking at the hot spots below |
| `@convex-dev/migrations` backfills | `migrations.ts` | Not needed: the importer writes final values |

### Concurrency hot spots

Each Convex mutation is a serializable transaction. These places depend on that guarantee and need explicit handling:

1. **Enrollment token use** (`device-auth`): a single atomic `UPDATE enrollment_tokens SET remaining_uses = CASE WHEN remaining_uses = -1 THEN -1 ELSE remaining_uses - 1 END … WHERE token_hash = $1 AND NOT disabled AND remaining_uses <> 0 AND (expires_at IS NULL OR expires_at > now()) RETURNING *`. When no row comes back, a follow-up read picks the specific error message.
2. **Refresh-token rotation and grace** (`device-auth`): `SELECT … FOR UPDATE` on the token row, so the single-use grace window holds when two requests race.
3. **Install state** (`apps`): `SELECT … FOR UPDATE` on `(computer_id, app_id)`, then update. When no row exists, `INSERT … ON CONFLICT DO UPDATE` covers the insert race. The rule "clear `reinstall_requested_at` only when the echoed value matches" must compare epoch ms exactly; add a test.
4. **Active client update** (`client-updates`): unset and set in one transaction; the partial unique index is the backstop.
5. **Dynamic membership rewrites** (`groups`: cron, rule edits, inventory events): take `pg_advisory_xact_lock(<const>)` so concurrent rewrites queue instead of interleaving or deadlocking.
6. **Static group edits** (`groups`): composite PK with `ON CONFLICT DO NOTHING`.

## 6. API surface

### Device API (contract frozen)

Routes and their owners are listed in §3. The composition root builds the device router in this order: CORS (unchanged config) → public routes (`/health`, `device-auth` public routes, `GET /client/version`) → `requireDevice` (kernel) → `X-Client-Update` middleware (`client-updates`) → protected feature routes.

Port `convex/http.ts` almost verbatim into the owning features, replacing `c.env.ctx.runQuery/runMutation/runAction` with service calls. Keep the `{ error }` bodies and the status codes. Every response goes through the feature's `dto.ts`; route handlers never return raw rows.

**Decided behavior change: `is-enrolled`** now returns 404 when the computer doesn't exist. Today it returns `true` for any well-formed Convex ID, even a deleted one, because it only calls `normalizeId`. Effect on the client: a deleted device's service exits at startup with "This computer is not registered on the server." (`cmd/main/main.go`) instead of starting and failing every refresh and recover with 401. Either way the device has to be re-enrolled.

### Better Auth (`auth` feature)

Mounted at `/auth/*` with `baseURL = SITE_URL`, `basePath = "/auth"`. Public URLs stay what the browser uses today. Caddy forwards `/auth*` **without** stripping a prefix, which avoids the `/api` base-path mismatch described in `convex/auth.ts`. The `ALLOW_REGISTRATION` hook and `trustedOrigins` move over unchanged.

### Admin API

Public path `/api/admin/<feature>/*` (Hono sees `/admin/<feature>/*`). Each feature exports one admin router; the composition root mounts it and applies `requireSession`. Arguments are validated with `@hono/zod-validator` using the feature's `contract.ts`. Mapping rule: queries become `GET`; mutations become `POST`/`PATCH`/`DELETE`. **Responses keep today's shapes**, so components don't change. Example: `computers.listPaginated` becomes `GET /admin/computers?cursor&limit&filter&sortField&sortDesc` and returns `{ page, continueCursor, isDone }`.

`apps.getAssigned` currently runs N+1 lookups. Port it faithfully first; collapse it into a few joined queries afterwards, once contract tests cover it.

## 7. Realtime computer status

Scope: only the online/offline status, which comes from `last_connection`. Going offline needs no event: the UI derives it from time, as it does today.

**Server (`computers`)**

- `recordPresence(tx, computerId)` is the only writer of `last_connection`. Both the heartbeat and legacy `rustdesk-sync` use it. In the same transaction it runs `pg_notify('computer_presence', '{"id":…,"lastConnection":…}')`. Postgres delivers notifications only on commit, so a rolled-back write never broadcasts.
- `GET /admin/computers/presence` streams with Hono `streamSSE`. It buffers updates and flushes at most once per second as a single `presence` event, `[{ id, lastConnection }]`. (A 1000-device fleet heartbeating every minute produces about 17 updates per second.) It sends a keep-alive every 25 s. SSE connections don't hold database connections.

**Kernel (`src/server/pubsub.ts`)**: one dedicated `pg` connection per API process runs `LISTEN`. It fans out to in-process subscribers, reconnects with backoff, and tells subscribers to resync after a reconnect. Every replica receives every notification, so multiple replicas work unchanged. Caddy flushes `text/event-stream` responses immediately, so the proxy needs no config change.

**UI (`computers/ui`)**

- `ComputerPresenceProvider`, mounted once in `src/app/(app)/layout.tsx`, opens one `EventSource` per tab. It parses events with the zod schema from `computers/contract.ts` and keeps `id → lastConnection` in a small external store (`useSyncExternalStore`).
- `useComputerStatus(id, lastConnection)` takes the newer of the queried and pushed timestamps and applies the existing `useCurrentTime` 30 s tick. The computers table, the computer detail page and the dashboard's online count all use it, and other features consume it through `computers/ui/index.ts`.
- On every `open` event (first connect and each reconnect), the provider invalidates computer queries, so updates missed while disconnected are refetched.
- Dev: Next rewrites proxy the stream. If the dev proxy turns out to buffer it, point the `EventSource` at the API origin in dev (check during Phase 4).

## 8. Storage (`files` feature)

- **Bucket**: `fleetctrl-files`, created by the existing `rustfs-init` container. Object key: `files/<fileId>`. Imported files keep their Convex storage ID as `fileId`.
- **S3 client** (kernel `src/server/storage/s3.ts`): `forcePathStyle: true`, `requestChecksumCalculation` / `responseChecksumValidation: "WHEN_REQUIRED"` (the same reason the compose file sets these for aws-cli), with endpoint `http://rustfs:9000`.
- **Public API**: `files.upload(stream, meta)`, `files.stream(c, fileId)`, `files.assertExists(tx, fileId)`. Nothing else touches the bucket.
- **Upload (dashboard)**: `PUT /api/admin/files` streams the request body to RustFS with `@aws-sdk/lib-storage` `Upload` and computes SHA-256 on the way. It inserts a `files` row and returns `{ fileId, sha256, size }`. `apps` and `client-updates` mutations then reference `fileId`. The server-computed hash replaces trusting the browser's (`src/lib/convex-upload.ts` goes away). The `.msi` → `application/x-msi` content-type fix moves to the server.
- **Download (devices)**: URLs and status behavior are unchanged for the client. The owning feature checks authorization exactly as today, then calls `files.stream()`, which sends `GetObject` with `Content-Type` and `Content-Length`.
  - Why not keep the 307 redirect: `AuthTransport.RoundTrip` in `fleetctrl-client/internal/auth/http_middleware.go` sets `Authorization` and `DPoP` on every request, including the redirected one. With Convex this was harmless because Convex ignores the header. An S3 server that receives a presigned URL plus an `Authorization` header rejects the request (AWS: "Only one auth mechanism allowed"). Confirm RustFS behaves the same in Phase 0. Presigning would also require RustFS to be publicly reachable under a host that matches the signature.
  - Optional later, if download bandwidth through Node becomes a problem: add a Caddy route `/fleetctrl-files/*` → `rustfs:9000` with `header_up -Authorization` and `header_up -DPoP`, and presign against the public origin.
- **Garbage collection** (daily, `files/jobs.ts`), designed so `files` never needs to know who references it:
  1. For `files` rows older than 24 h, try `DELETE` one by one, each in a savepoint. Every referencing FK is `on delete restrict`, so a referenced file fails the delete and is skipped; an unreferenced one is removed.
  2. List the bucket and delete objects older than 24 h that have no `files` row.

  This covers abandoned uploads and deleted releases, so no feature needs after-commit hooks.
- **Exposure**: RustFS becomes internal-only. Drop the published `9000`/`9001` host ports from the production compose file, or bind them to localhost.

## 9. Frontend changes

29 files in `src/` import Convex. The goal is to change call sites, not rendering.

- **Move UI into features**: for each feature, first a rename-only commit (`src/modules/<module>` → `src/features/<feature>/ui/`, see the §3 table), then the data-layer switch. `src/app/**` pages become thin wrappers around `ui/index.ts` exports. Shared pieces (`src/components/ui`, `virtual-table.tsx`, `use-current-time.ts`) stay in the shared UI kernel.
- Remove `ConvexClientProvider`, `ConvexBetterAuthProvider`, `getToken`/`initialToken` in `src/app/layout.tsx`, `src/lib/auth-server.ts`, `src/app/api/auth/[...all]/route.ts`, and `src/lib/convex-upload.ts`.
- Add a `QueryClientProvider` with defaults `staleTime: 30_000`, `refetchOnWindowFocus: true` and no `refetchInterval`.
- Replace `src/hooks/use-auth-query.ts` with generic `useApiQuery`, `usePaginatedApiQuery` and `useApiMutation` in `src/lib/api/`. They return **the same shapes Convex hooks return**: `undefined` while loading, and `{ results, status, loadMore, isLoading }` for paginated reads. `virtual-table.tsx` and the table hooks then stay as they are.
- Each feature's `ui/api.ts` owns its `hc` client (`hc<ComputersAdminRoutes>("/api/admin/computers")`), its query keys, and its invalidations after mutations. Another feature's data is used only through its `ui/index.ts` hooks. For example, the dashboard uses `computers`, `apps`, `groups`, `client-updates` and `device-auth` hooks.
- `src/lib/auth-client.ts` moves to `auth/ui`: `createAuthClient({ baseURL: NEXT_PUBLIC_SITE_URL })` without the `convexClient()` plugin.
- `src/proxy.ts`: an optimistic check with `getSessionCookie(request)` from `better-auth/cookies`; the API enforces the real check.
- `src/lib/env.js`: drop `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `CONVEX_URL` and `CONVEX_SITE_INTERNAL_URL`.
- Local dev: `next.config.ts` rewrites `/api/:path*` and `/auth/:path*` to the local API (e.g. `:3001`), so the browser stays same-origin as it is behind Caddy.

## 10. Data migration (importer)

**Input**: the zip that `manage.sh backup` already produces (`npx convex export --include-file-storage`). It holds the app tables, the `_storage` metadata and files, and the Better Auth component tables.

`scripts/import-convex/index.ts --zip <path> [--dry-run]` is the one tool allowed to write every feature's tables:

1. **Preflight**: the target database is empty (refuse otherwise), migrations are applied, and the bucket exists.
2. **Stream** JSONL per table (`yauzl`, random access, so multi-GB exports never load into memory).
3. **Audit and report.** Convex enforces no foreign keys, so expect dirty data:
   - Orphans (child rows whose parent is missing) are dropped and listed.
   - Duplicates against the new unique constraints: installs per `(computer, app)` keep the newest `status_updated_at`; multiple active client updates keep the newest; duplicate `jkt`, token hashes, `(app_id, version)` and group assignments are reported for a manual decision.
   - `--dry-run` stops here and prints the report.
4. **Files**: `PutObject` each `_storage` entry to `files/<convexStorageId>`, check size and SHA-256 (Convex stores base64 SHA-256), and insert `files` rows.
5. **Rows**: insert in FK order inside one transaction, in batches of about 1000. `_creationTime` becomes `created_at`; ms numbers become `timestamptz`.
6. **Auth**: import `user` and `account`. Credential password hashes are Better Auth's own scrypt format and work with any adapter. Skip `session`, `verification` and `jwks`; admins sign in again.
7. **Refresh tokens**: import tokens that are `ACTIVE` and unexpired, and `REVOKED` tokens still inside their grace window. Drop the rest.
8. **Dynamic membership**: not imported. It is recomputed through the `groups` public API after import, which is authoritative.
9. **Verify**: per-table counts (source − dropped = target), file count and total bytes. Write a JSON report next to the zip.

Re-running means dropping the database and starting again; the importer never merges.

Optimization if file copy dominates downtime: files are immutable, so pre-copy objects from an earlier export while v2 is still running, and copy only the new ones at cutover.

## 11. Deployment and cutover

### Compose v3

- **Keep** `postgres` (same container and volume; add a new database `fleetctrl` and leave `convex_self_hosted` untouched for rollback), `rustfs`, `rustfs-init` (adds `fleetctrl-files`), and `proxy`.
- **Add** `api` (`ghcr.io/fleetctrl/fleetctrl-api`, bundled from `src/server/index.ts` with tsup) and a one-shot `db-migrate` service (same image, runs the drizzle migrator). It replaces `convex-migration`, and `api` waits for it to complete.
- **`hub`**: drop the Convex env vars.
- **Remove after cutover**: `convex`, `convex-dashboard`, `convex-migration`, and the `convex.{$CADDY_DOMAIN}` block in the Caddyfiles.
- **New env**: `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. **Unchanged**: `JWT_SECRET`, `API_URL`, `BETTER_AUTH_SECRET`, `SITE_URL`, `ALLOW_REGISTRATION`. Fresh installs get a dedicated `fleetctrl` role; upgrades reuse the existing superuser to create the database.
- **CI**: `builder.yaml` builds the `api` image and retires `fleetctrl-convex-migration` after v3. Update `docker-compose.smoke.yml` and `scripts/test-docker-deployment*.sh`.

### Operator runbook: `manage.sh migrate-from-convex`

1. Check that v2 is healthy, then run `cmd_backup` to produce the export zip with files.
2. Stop `hub` and `proxy`. Devices back off and retry (`waitForServerOnline` in the client transport).
3. Save `docker-compose.yml`, `Caddyfile` and `.env` as `*.v2.bak`, write the v3 versions, and add the new env vars.
4. Start `postgres`, `rustfs`, `rustfs-init` and `db-migrate`. Run the importer with `--dry-run`, show the report, ask for confirmation, then run the real import.
5. Start `api`, `hub` and `proxy`, then run smoke checks: `/api/health`, `/api/client/version`, the sign-in page, and a DPoP-signed request from a test device.
6. Stop `convex` and `convex-dashboard`, keeping their volumes.

**Rollback** (`manage.sh rollback-to-convex`): restore the `*.v2.bak` files and start v2. Anything written on v3 is lost. Device state repopulates within about an hour, but devices enrolled on v3 and admin changes made on v3 must be redone. Tell operators to avoid enrollments and admin changes until they confirm the upgrade.

**Later** (`manage.sh cleanup-convex`): remove the Convex volumes, the `convex_self_hosted` database and the `convex-*` buckets.

## 12. Phases

Build the kernel and features' `server/` code on `main` incrementally: it ships inert, since v2 images don't run it. Do the UI moves, the frontend switch and the ops work (phases 4–5) on one integration branch. Land in-flight Convex work (e.g. `feat/error-details`) before Phase 2, and freeze new Convex features from Phase 4 on; anything else gets ported twice.

| Phase | Size | Scope | Exit criteria |
| --- | --- | --- | --- |
| 0. Spikes | S | Export a seeded snapshot (`seed:mock-*`) and document the exact zip layout, including component tables. Import one admin and sign in through Better Auth + Drizzle. Exercise S3 put/stream/delete against RustFS. Confirm that a presigned GET carrying an `Authorization` header fails on RustFS. Prove `NOTIFY` → SSE through Caddy. Write the **device contract test suite** and record golden responses from the v2 stack. | Decisions confirmed or this plan amended |
| 1. Foundations | M | Kernel (`env`, `db`, `s3`, `pubsub`, `cron`, `events`, `pagination`, `security/` with DPoP/JWT/JTI), composition root, feature skeletons with every `schema.ts` and the first migration (incl. `pg_trgm`), `feature-boundaries` lint rule, ownership rules in `CLAUDE.md`/`AGENTS.md`, PGlite test harness, dev compose for Postgres and RustFS, scripts `dev:api`, `db:generate`, `db:migrate` | `db:migrate` builds the schema on an empty database; tests run on PGlite; the lint rule catches a deliberate deep import |
| 2. Device API | M | Server side, feature by feature: `device-auth`, `computers` (heartbeat, sync, `recordPresence` + NOTIFY), `groups` (rule engine, `computer.ruleFieldsChanged` handler, cron), `tasks`, `files` (stream), `apps` (assigned, downloads, install state), `client-updates` (version, download, header middleware) | The contract suite passes against v3; `tests/computers.test.ts` and `tests/reinstall.test.ts`, ported into `computers` and `apps`, pass; a real Go client enrolls, syncs, installs a win32 app and self-updates against the local stack |
| 3. Auth | S | `auth` feature: Better Auth at `/auth`, registration hook, `requireSession`; auth client and `proxy.ts` | Sign-up, sign-in, sign-out and password change work |
| 4. Admin API + UI | L | Feature by feature (rename-only move first, then the switch): `device-auth` (keys) → `computers` (+ realtime presence) → `groups` → `files` + `apps` → `client-updates` → `tasks` → `dashboard` → `auth` (account). Each feature gets its admin router, contract, UI hooks, swapped components and tests. | No Convex imports left in `src/`; `src/modules/` is gone; status changes appear in an open dashboard within about 1 s of a heartbeat |
| 5. Importer + ops | M | Importer with dry-run report; `manage.sh` migrate, rollback and cleanup; compose v3 (production, smoke, dev); Caddyfiles; `api` Dockerfile; CI; README and docs | Docker smoke test passes on v3; full migrate + rollback rehearsal on a production-sized dataset, with downtime measured |
| 6. Release + cleanup | S | Ship v3.0.0 with upgrade notes. After the rollback window, delete `convex/`, the Convex deps (`convex`, `@convex-dev/*`, `convex-helpers`, `convex-test`), `Dockerfile.convex-migration` and `docker/migration/` | No Convex references in the repo |

## 13. Testing

- **Device contract suite** (`tests/contract/`, Phase 0) runs against both v2 and v3 with real DPoP proofs. It is the gate for cutover.
- **Feature tests** live next to the code (`src/features/<feature>/server/*.test.ts`) and run on PGlite: real Postgres semantics, fast in vitest. They replace `convex-test`.
- **Concurrency tests on a real Postgres** (docker): parallel enrollments against a limited-use token, a race inside the refresh-token grace window, and concurrent install-state reports.
- **Realtime test**: a heartbeat in a committed transaction produces one SSE `presence` event; a rolled-back one produces none; a pubsub reconnect triggers resync.
- **Importer tests**: a fixture zip containing orphans, duplicates and files.
- **End-to-end**: the Go client against compose v3, covering enroll → assigned → download → state → self-update.

## 14. Risks

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Computer or release IDs change | Devices orphaned, or every app reinstalled | Text PKs keep Convex IDs; the importer asserts this; contract tests use pre-migration IDs |
| R2 | Storage redirect plus the client's `Authorization` header | Every install and self-update fails | Stream through the API (§8); confirm in Phase 0 |
| R3 | DPoP `htu` mismatch from path or `API_URL` changes | Every device request returns 401 | Same `API_URL` and Caddy strip; contract tests with real proofs |
| R4 | Dates serialized as ISO strings instead of ms numbers | Go `*int64` decoding fails; reinstall acknowledgement breaks | Mandatory `dto.ts` mappers; contract tests; no raw rows in responses |
| R5 | Dirty Convex data violates the new constraints | Import aborts mid-cutover | Dry-run report during rehearsal and again right before cutover |
| R6 | SSE drops or gets buffered by a proxy | Stale status | Keep-alives, auto-reconnect with resync on `open`; the 30 s client tick still marks devices offline; any refetch corrects the state |
| R7 | Large file copy | Long downtime | Measure in rehearsal; pre-copy immutable files |
| R8 | Multiple API replicas | Double crons, replay gaps, missed presence events | Advisory locks, `dpop_jti` in Postgres, `LISTEN` on every replica; no in-process state beyond SSE buffers |
| R9 | Feature boundaries erode | Hidden coupling returns | Lint rule for imports; review checklist for table ownership and cross-feature writes |
| R10 | Hono RPC type-checking slows the IDE | Slow feedback | One `hc` client per feature instead of one app-wide type |

## 15. Decisions log

| Question | Decision |
| --- | --- |
| Where does the dashboard API live? | Hono, together with the device API and Better Auth |
| `is-enrolled` for deleted devices | Returns 404 (§6) |
| Admin sessions on upgrade | Admins sign in again; sessions are not migrated |
| Realtime | Only computer status, via SSE + `LISTEN/NOTIFY`; no polling elsewhere |
| Repo layout | Single package, organized by feature ownership (§3) |
| Device downloads | Streamed through the API; redirect mode stays an optional later optimization |
