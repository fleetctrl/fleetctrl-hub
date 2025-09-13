# Repository Guidelines

## Project Structure & Modules
- `app/`: Next.js App Router (layouts, routes, middleware). Auth flows live under `app/auth`, admin views under `app/admin`.
- `components/`: Reusable UI (forms, buttons, icons). Primitives under `components/ui`.
- `lib/`: Runtime helpers and Supabase clients (`lib/supabase/*`), env validation in `lib/env.js`.
- `types/`: Ambient types (`types/env.d.ts`).
- `supabase/`: Local Supabase setup and scripts (`supabase/scripts/*`).
- Root: `Dockerfile`, `docker-compose.yaml`, `Makefile`, `eslint.config.mjs`, `tailwind.config.ts`, `tsconfig.json`.

## Build, Test, and Development
- `npm run dev`: Start Next.js dev server (Turbopack) on port 3000.
- `npm run build`: Production build.
- `npm start`: Run the built app.
- `npm run lint`: Lint with Next/TypeScript rules.
- `docker compose up -d`: Bring up local Supabase stack.
- Make targets (require `.env` → `POSTGRES_URL`):
  - `make push-schema`: Apply migrations to the DB.
  - `make diff-schema`: Generate a migration diff from the current DB.
  - `make create-schema`: Create a new empty migration.
  - `make reset-schema`: Reset DB and reapply migrations.
- Keys for local Supabase: `node supabase/scripts/gen_anon.cjs` and `node supabase/scripts/gen_service.cjs` (requires `JWT_SECRET`).

## Coding Style & Naming
- Language: TypeScript (strict), React 19, Next.js App Router.
- Linting: ESLint (`next/core-web-vitals`, `next/typescript`). Run `npm run lint` pre-PR.
- Files: kebab-case for file names (e.g., `login-form.tsx`); components in PascalCase; hooks prefixed with `use`.
- Paths: use `@/*` alias per `tsconfig.json`.

## Testing Guidelines
- No formal test suite yet. Gate changes with `npm run lint` and TypeScript checks.
- If adding tests, prefer colocated `*.test.ts(x)` or `__tests__/` and Testing Library + Vitest/Playwright.

## Commit & Pull Requests
- Commits: concise, imperative subject (e.g., "fix builder", "add login form"); reference issues when applicable.
- PRs: include description, screenshots for UI changes, and linked issues. Ensure `npm run lint` passes and the app runs locally.
- Versioning: CI tags images from `package.json:version`. Bump semver on releases (e.g., `v0.3.1`).

## Security & Configuration
- Use `.env.example` as a template; never commit secrets. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL`, `JWT_SECRET`.
- Do not use sample keys in production. Rotate secrets and review `docker-compose.yaml` exposure.

