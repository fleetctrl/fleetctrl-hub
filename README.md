# FleetCtrl Hub

FleetCtrl Hub is a modern device management (MDM/Fleet Management) platform that enables centralized management of computers, groups, applications, and releases.

## Technologies

The project is built on the following technologies:

- **Frontend:** [Next.js](https://nextjs.org/) (App Router), [TanStack Query](https://tanstack.com/query)
- **API:** [Hono](https://hono.dev/) on Node.js: the device API, authentication and the dashboard's admin API
- **Database:** [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **File storage:** [RustFS](https://rustfs.com/) (S3-compatible)
- **Authentication:** [Better Auth](https://better-auth.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [Radix UI](https://www.radix-ui.com/)
- **Validation:** [Zod](https://zod.dev/)

## Getting Started

### Requirements

- **Node.js**: version 22 or newer
- **pnpm**: recommended package manager (version 10+)
- **Docker**: for the local Postgres and RustFS

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone <repository-url>
   cd fleetctrl-hub
   pnpm install
   ```

2. Start Postgres (port 5433) and RustFS (port 9100):
   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

3. Create `.env.local` (read by both the API and Next.js) and fill in `JWT_SECRET` and `BETTER_AUTH_SECRET`
   (`openssl rand -hex 32`); the other defaults match the dev compose file:
   ```bash
   cp .env.example .env.local
   ```

4. Apply the database migrations:
   ```bash
   pnpm db:migrate
   ```

### Running Development

Run the API and the dashboard:

```bash
pnpm dev:api   # API on http://localhost:3001
pnpm dev       # dashboard on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000). Next.js forwards `/api/*` and `/auth/*` to the API, so the
browser stays on one origin as it does behind Caddy in production. A device can use `http://localhost:3000/api`
as its server URL.

Other commands:

- `pnpm test`: unit, feature and device-contract tests on an in-memory Postgres (PGlite). With
  `TEST_DATABASE_URL=postgres://...` set, the concurrency tests also run against a real Postgres.
- `pnpm db:generate`: generate a SQL migration in `drizzle/` after changing a `schema.ts`.
- `pnpm lint`: includes the `feature-boundaries` rule; see `CLAUDE.md` for the code organization.

## Docker Production Setup

For a production-style Docker deployment you do not need to clone the whole repository. Run the bootstrap script over `curl`; it downloads the required files and prints the setup command to run next.

```bash
curl -fsSL https://raw.githubusercontent.com/fleetctrl/fleetctrl-hub/main/docker/install.sh | bash
```

Notes:

- The script creates a `fleetctrl-hub` directory in your current location and downloads the required files into it.
- It saves `docker-compose.production.yml` as `docker-compose.yml`, because `manage.sh` uses `docker compose` without an explicit `-f` flag.
- It downloads both `Caddyfile.proxy` and `Caddyfile.standalone`; the setup script selects the correct one based on your answers.

Then run:

```bash
cd fleetctrl-hub
./manage.sh setup
```

If you want a different target directory, run:

```bash
curl -fsSL https://raw.githubusercontent.com/fleetctrl/fleetctrl-hub/main/docker/install.sh | INSTALL_DIR=my-fleetctrl bash
```

After setup completes, FleetCtrl Hub will be available on the URL you entered during the setup wizard.

## Upgrading from v2 (Convex)

Version 3 replaces the Convex backend with PostgreSQL, RustFS storage and a standalone API service. Devices keep
working without a client update: their IDs, tokens and the device API stay the same. Upgrade an existing
installation with:

```bash
./manage.sh self-update
./manage.sh migrate-from-convex
```

The command exports Convex, shows a dry-run report of the import, imports into Postgres and starts v3. Convex data
is never modified, so `./manage.sh rollback-to-convex` returns to v2 (changes made on v3 are lost). Admins sign in
again after the upgrade. Once v3 works, `./manage.sh cleanup-convex` removes Convex for good. Details:
[docs/migration-convex-to-postgres.md](docs/migration-convex-to-postgres.md).
