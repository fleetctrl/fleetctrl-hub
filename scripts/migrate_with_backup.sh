#!/bin/bash
# shellcheck shell=bash
set -euo pipefail

# --- Konfigurace ---
: "${POSTGRES_URL:?Missing POSTGRES_URL (postgres://user:pass@host:port/db)}"
APP_NAME="${APP_NAME:-supabase}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
SUPABASE_CLI="${SUPABASE_CLI:-npx supabase}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"

# volitelné: čekání na DB, když nespouštíš přes depends_on:service_healthy
pg_isready -d "$POSTGRES_URL" -t 5 >/dev/null 2>&1 || {
  echo "==> Waiting for database to become ready…"
  until pg_isready -d "$POSTGRES_URL" -t 5 >/dev/null 2>&1; do sleep 2; done
}

mkdir -p "$BACKUP_DIR"

# --- Advisory lock proti paralelnímu běhu (ID 4242 si můžeš libovolně zvolit) ---
LOCK_ID="${LOCK_ID:-4242}"
unlock() {
  echo "==> Releasing DB migration lock…"
  psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_unlock(${LOCK_ID});" >/dev/null 2>&1 || true
}
trap 'unlock' EXIT

echo "==> Acquiring DB migration lock…"
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_lock(${LOCK_ID});" >/dev/null

# --- Zjisti pending migrace (single run) ---
echo "==> Checking pending migrations (dry-run)…"
set +e
DRYRUN_OUTPUT="$($SUPABASE_CLI db push --db-url "$POSTGRES_URL" --dry-run 2>&1)"
DRYRUN_CODE=$?
set -e

# Supabase CLI někdy vrací nenulový kód i když jen oznamuje změny, proto se rozhodujeme dle textu:
if echo "$DRYRUN_OUTPUT" | grep -qiE "up to date|no change|nothing to migrate|Remote database is up to date"; then
  echo "==> No pending migrations. Skipping backup & migrate."
  exit 0
fi

echo "==> Pending migrations detected:"
echo "---------------------------------"
echo "$DRYRUN_OUTPUT"
echo "---------------------------------"

# --- Backup (schema + data), gzip, rotace ---
# Supabase CLI dump vyžaduje Docker; používáme přímo pg_dump, který už máme v image.
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_SCHEMA="${BACKUP_DIR}/${APP_NAME}_${TS}_schema.sql.gz"
BACKUP_DATA="${BACKUP_DIR}/${APP_NAME}_${TS}_data.sql.gz"

echo "==> Creating backups into ${BACKUP_DIR}…"
COMMON_PGDUMP_ARGS=(--dbname="$POSTGRES_URL" --no-owner --no-privileges)
# Schema-only dump
"$PG_DUMP_BIN" "${COMMON_PGDUMP_ARGS[@]}" --schema-only | gzip -9 > "$BACKUP_SCHEMA"
# Data-only dump (no schema)
"$PG_DUMP_BIN" "${COMMON_PGDUMP_ARGS[@]}" --data-only | gzip -9 > "$BACKUP_DATA"

echo "==> Pruning old backups (> ${RETENTION_DAYS}d)…"
find "$BACKUP_DIR" -type f -name "${APP_NAME}_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete || true

# --- Apply migrace ---
echo "==> Applying migrations…"
$SUPABASE_CLI db push --db-url "$POSTGRES_URL" --yes

echo "==> Seeding storage..."
npm run seed:storage

echo "==> Done."
