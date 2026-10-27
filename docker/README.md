# Docker Environment

This directory contains the Docker setup for FleetCtrl Hub: the dashboard, the API, PostgreSQL, RustFS and a Caddy
proxy that terminates HTTPS.

## Services

- **hub**: the Next.js dashboard (UI only).
- **api**: the Hono API: device API (`/api/*`), Better Auth (`/auth/*`) and the dashboard's admin API (`/api/admin/*`).
- **db-migrate**: one-shot container (API image) that applies the SQL migrations before the API starts.
- **postgres**: PostgreSQL 17; the API uses the `fleetctrl` database.
- **rustfs** / **rustfs-init**: S3-compatible storage for installers, scripts and client updates (bucket `fleetctrl-files`).
  RustFS is internal: the API streams downloads to devices.
- **proxy**: Caddy. `/auth*` goes to the API unchanged, `/api*` goes to the API with `/api` stripped, everything else
  goes to the hub. Devices sign DPoP proofs for `API_URL` + path, so this layout must not change.

Files:

- `docker-compose.production.yml`: published images (`ghcr.io/fleetctrl/fleetctrl-hub`, `ghcr.io/fleetctrl/fleetctrl-api`).
- `docker-compose.yml`: builds both images from this repository.
- `docker-compose.dev.yml`: only Postgres and RustFS, for running the API and dashboard on the host (see the main README).

## Production Setup via curl

```bash
curl -fsSL https://raw.githubusercontent.com/fleetctrl/fleetctrl-hub/main/docker/install.sh | bash
cd fleetctrl-hub
./manage.sh setup
```

The script downloads `docker-compose.production.yml` as `docker-compose.yml` (manage.sh uses Compose's default file
name), both Caddyfiles, `.env.example` and `manage.sh`. Setup asks for the site URL, ports, storage directories and the
TLS mode, generates the secrets, and starts everything. To install elsewhere, set `INSTALL_DIR=my-fleetctrl`.

## manage.sh

| Command | What it does |
| --- | --- |
| `setup` | First-time installation and configuration |
| `update` | Backup, pull newer images (or offer to update pinned tags), restart; migrations run automatically |
| `backup` | `pg_dump` of the `fleetctrl` database plus a copy of the bucket, into `backups/backup-<date>/` |
| `restore` | Restores one of those backups (replaces the current data) |
| `migrate-from-convex` | Upgrades a v2 (Convex) installation to v3, see below |
| `rollback-to-convex` | Returns to v2 after an upgrade; changes made on v3 are lost |
| `cleanup-convex` | Removes the Convex container, volume, database and buckets once v3 is confirmed |
| `self-update` | Downloads the latest `manage.sh` |

## Upgrading from v2 (Convex)

```bash
./manage.sh self-update
./manage.sh migrate-from-convex
```

1. Exports Convex with file storage (`npx convex export --include-file-storage`) while v2 is still running.
2. Stops the hub and the proxy. Devices back off and retry.
3. Saves `docker-compose.yml`, `Caddyfile` and `.env` as `*.v2.bak` and writes the v3 versions. Postgres keeps its
   existing volume and superuser (`POSTGRES_USER=convex`); v3 uses a new `fleetctrl` database next to Convex's.
4. Creates and migrates the `fleetctrl` database, runs the importer with `--dry-run`, shows the report and asks before
   importing. Conflicts that need a decision (for example two group assignments for the same release) are listed and
   only resolved with your confirmation.
5. Starts v3, runs smoke checks, waits for a device to check in, then stops Convex (its data stays for rollback).

Admins sign in again after the upgrade. Avoid enrolling devices and changing settings until you confirm the upgrade:
`./manage.sh rollback-to-convex` restores the v2 files and data, and anything written on v3 is lost. When v3 works,
run `./manage.sh cleanup-convex`.

The importer can also be run by hand, from the API image:

```bash
docker compose run --rm --no-deps --user root -v "$PWD/../convex/backups:/backups" api \
  node import-convex.js --zip /backups/<export>.zip --dry-run
```

`--files-only` copies the files to the bucket ahead of the cutover (they are immutable), so the import at cutover only
copies new ones.

## Configuration

- `.env` holds the configuration (see `.env.example`). Never change `API_URL` or `JWT_SECRET` on an existing
  installation: deployed devices are bound to them.
- Persistence: `postgres_data` and `rustfs-data` volumes (or the directories chosen during setup); Caddy certificates
  in `caddy_data`.

## Testing the Docker setup

```bash
pnpm test:docker-build        # builds both images from scratch
pnpm test:docker-deployment   # starts an isolated stack and checks auth, admin API, uploads, presence and the device API over HTTPS
```
