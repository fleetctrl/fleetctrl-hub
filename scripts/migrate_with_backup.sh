#!/usr/bin/env bash
set -eu

if [ -n "${BASH_VERSION:-}" ] || [ -n "${ZSH_VERSION:-}" ]; then
  set -o pipefail
fi

# --- Konfigurace ---
: "${POSTGRES_URL:?Missing POSTGRES_URL (postgres://user:pass@host:port/db)}"
BACKUP_DIR="/backups"
RETENTION_DAYS="30"
APP_NAME="supabase"

mkdir -p "$BACKUP_DIR"

echo "==> Checking pending migrations (dry-run)…"
npx supabase db push --db-url "$POSTGRES_URL" --dry-run
DRYRUN_OUTPUT="$(npx supabase db push --db-url "$POSTGRES_URL" --dry-run || true)"

if echo "$DRYRUN_OUTPUT" | grep -qiE "up to date|no change|nothing to migrate|Remote database is up to date"; then
  echo "==> No pending migrations. Skipping backup & migrate."
  exit 0
fi

echo "==> Pending migrations detected:"
echo "$DRYRUN_OUTPUT"

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${APP_NAME}_${TS}.dump"

echo "==> Creating backup: $BACKUP_FILE"
npx supabase db dump -f "$BACKUP_FILE" --db-url "$POSTGRES_URL"

echo "==> Pruning old backups (> ${RETENTION_DAYS}d)…"
find "$BACKUP_DIR" -type f -name "${APP_NAME}_*.dump" -mtime "+$RETENTION_DAYS" -delete || true

echo "==> Applying migrations…"
npx supabase db push --db-url "$POSTGRES_URL" --yes

echo "==> Done."
