#!/bin/bash
set -e
set -o pipefail

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

REPO_OWNER=${REPO_OWNER:-fleetctrl}
REPO_NAME=${REPO_NAME:-fleetctrl-hub}
REPO_REF=${REPO_REF:-main}
BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_REF}/docker"

# Change directory to the script's location (docker directory)
cd "$(dirname "$0")"

# Cross-platform in-place sed (GNU vs BSD/macOS)
sedi() {
  if sed --version >/dev/null 2>&1; then
    sed -i -e "$1" "${@:2}"
  else
    sed -i '' -e "$1" "${@:2}"
  fi
}

get_env_value() {
  local key="$1"
  local file="${2:-.env}"

  grep -m 1 "^${key}=" "$file" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r'
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"
  local escaped_value

  escaped_value=$(printf '%s' "$value" | sed 's/[&|]/\\&/g')

  if grep -q "^${key}=" "$file"; then
    sedi "s|^${key}=.*|${key}=${escaped_value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-.env}"

  if [ -z "$(get_env_value "$key" "$file")" ]; then
    echo "${key}=${value}" >> "$file"
  fi
}

get_compose_image_tag() {
  local image="$1"
  local file="${2:-docker-compose.yml}"

  awk -v image="$image" '
    $1 == "image:" && index($2, image ":") == 1 {
      print substr($2, length(image) + 2)
      exit
    }
  ' "$file"
}

set_compose_image_tag() {
  local image="$1"
  local tag="$2"
  local file="${3:-docker-compose.yml}"
  local escaped_image

  escaped_image=$(printf '%s' "$image" | sed 's/[][\\.^$*+?{}()|]/\\&/g')
  sedi "s|^\([[:space:]]*image:[[:space:]]*${escaped_image}:\).*|\1${tag}|" "$file"
}

get_latest_ghcr_tag() {
  local package="$1"
  local token
  local tags

  token=$(curl -fsSL "https://ghcr.io/token?scope=repository:fleetctrl/${package}:pull" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || return 0

  tags=$(curl -fsSL -H "Authorization: Bearer ${token}" "https://ghcr.io/v2/fleetctrl/${package}/tags/list" \
    | tr ',' '\n' \
    | sed -n 's/.*"name":"\([^"]*\)".*/\1/p; s/.*"\([^"]*\)".*/\1/p' \
    | grep -E '^v?[0-9]+([.][0-9]+){1,3}([-+][0-9A-Za-z.-]+)?$' \
    | awk '{ version=$0; sub(/^v/, "", version); print version " " $0 }' \
    | sort -k1,1V \
    | awk '{ print $2 }') || return 0

  printf '%s\n' "$tags" | tail -n 1
}

check_compose_image_updates() {
  local compose_file="${1:-docker-compose.yml}"
  local hub_image="ghcr.io/fleetctrl/fleetctrl-hub"
  local api_image="ghcr.io/fleetctrl/fleetctrl-api"
  local current_tag
  local latest_tag

  if [ ! -f "$compose_file" ]; then
    echo -e "${YELLOW}Compose file '$compose_file' not found, skipping image version check.${NC}"
    return 0
  fi

  current_tag=$(get_compose_image_tag "$hub_image" "$compose_file")
  if [ -z "$current_tag" ]; then
    echo -e "${YELLOW}No ${hub_image} image tag found in ${compose_file}, skipping image version check.${NC}"
    return 0
  fi

  if [ "$current_tag" = "latest" ]; then
    echo -e "${BLUE}▶ Compose uses ${hub_image}:latest. Pulling fresh images...${NC}"
    docker compose pull hub api db-migrate
    return 0
  fi

  echo -e "${BLUE}▶ Checking latest Fleetctrl image version...${NC}"
  latest_tag=$(get_latest_ghcr_tag "fleetctrl-hub")
  if [ -z "$latest_tag" ]; then
    echo -e "${YELLOW}Could not determine the latest Fleetctrl image tag. Continuing with ${current_tag}.${NC}"
    return 0
  fi

  if [ "$current_tag" = "$latest_tag" ]; then
    echo -e "${GREEN}Fleetctrl image is already pinned to the latest version (${current_tag}).${NC}"
    return 0
  fi

  echo -e "${YELLOW}A newer Fleetctrl image is available: ${current_tag} → ${latest_tag}.${NC}"
  echo -ne "${YELLOW}Update docker-compose.yml to ${latest_tag} and pull it now? [y/N] ${NC}"
  read -r update_image_tag
  if [[ "$update_image_tag" =~ ^[Yy]$ ]]; then
    set_compose_image_tag "$hub_image" "$latest_tag" "$compose_file"
    set_compose_image_tag "$api_image" "$latest_tag" "$compose_file"
    docker compose pull hub api db-migrate
    echo -e "${GREEN}Updated Fleetctrl image pins to ${latest_tag}.${NC}"
  else
    echo -e "${YELLOW}Keeping pinned Fleetctrl image version ${current_tag}.${NC}"
  fi
}

confirm_empty_dir() {
  local label="$1"
  local dir_path="$2"

  if [ -d "$dir_path" ] && [ "$(ls -A "$dir_path" 2>/dev/null)" ]; then
    echo -e "\n${RED}⚠️  WARNING: ${label} directory '$dir_path' already exists and is not empty.${NC}"
    echo -e "${RED}Continuing might overwrite or corrupt your existing data!${NC}"
    read -p "$(echo -e ${BOLD}"  Are you sure you want to continue and risk overwriting data? (y/N): "${NC})" OVERWRITE_INPUT
    if [[ ! "$OVERWRITE_INPUT" =~ ^[Yy]$ ]]; then
      echo -e "${YELLOW}Setup cancelled to protect existing data.${NC}"
      exit 1
    fi
  fi
}

confirm() {
  local prompt="$1"
  local answer
  read -p "$(echo -e ${BOLD}"${prompt} (y/N): "${NC})" answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

load_env() {
  set -a
  source .env
  set +a
}

require_env_file() {
  if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found. Have you run setup?${NC}"
    exit 1
  fi
}

# A v2 installation still runs the Convex backend from its compose file.
is_v2_install() {
  [ -f docker-compose.yml ] && grep -qE '^[[:space:]]+convex:' docker-compose.yml
}

require_v3_install() {
  if is_v2_install; then
    echo -e "${RED}This installation still runs FleetCtrl v2 (Convex).${NC}"
    echo -e "Upgrade it first with: ${CYAN}$0 migrate-from-convex${NC}"
    exit 1
  fi
}

download_file() {
  local source_path="$1"
  local target_path="$2"
  echo -e "${BLUE}▶ Downloading ${source_path}...${NC}"
  curl -fsSL "${BASE_URL}/${source_path}" -o "$target_path"
}

container_health() {
  local service="$1"
  local id
  id=$(docker compose ps -q "$service" 2>/dev/null | head -n 1)
  [ -n "$id" ] || return 1
  docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null
}

wait_for_service() {
  local service="$1"
  echo -e "${BLUE}▶ Waiting for ${service}...${NC}"
  for _ in $(seq 1 100); do
    if [ "$(container_health "$service")" = "healthy" ]; then
      echo -e "  ${GREEN}✓ ${service} is healthy${NC}"
      return 0
    fi
    sleep 3
  done
  echo -e "${RED}${service} did not become healthy. Check: docker compose logs ${service}${NC}"
  return 1
}

configure_caddyfile() {
  local behind_proxy="$1"
  local tls_internal="$2"
  local source_dir="${3:-.}"

  if [ "$behind_proxy" = "true" ]; then
    cp "${source_dir}/Caddyfile.proxy" Caddyfile
  else
    cp "${source_dir}/Caddyfile.standalone" Caddyfile
    if [ "$tls_internal" = "false" ]; then
      sedi 's/^[[:space:]]*tls internal/    # tls internal/' Caddyfile
    else
      sedi 's/^[[:space:]]*#[[:space:]]*tls internal/    tls internal/' Caddyfile
    fi
  fi
}

# Request through the Caddy proxy on this host, the way browsers and devices reach it.
proxy_request() {
  local path="$1"
  local domain="${CADDY_DOMAIN:-localhost}"
  if [ "${BEHIND_PROXY:-false}" = "true" ]; then
    curl -fsS -o /dev/null -H "Host: ${domain}" "http://127.0.0.1:${PROXY_HTTP_PORT:-80}${path}"
  else
    curl -fsSk -o /dev/null --resolve "${domain}:${PROXY_HTTPS_PORT:-443}:127.0.0.1" "https://${domain}:${PROXY_HTTPS_PORT:-443}${path}"
  fi
}

smoke_check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} ${label}"
  else
    echo -e "  ${RED}✗${NC} ${label}"
    SMOKE_FAILED=true
  fi
}

run_smoke_checks() {
  SMOKE_FAILED=false
  echo -e "${BLUE}▶ Smoke checks${NC}"
  for _ in $(seq 1 30); do
    proxy_request /api/health >/dev/null 2>&1 && break
    sleep 2
  done
  smoke_check "API health (/api/health)" proxy_request /api/health
  smoke_check "Client version (/api/client/version)" docker compose exec -T api wget -qO- http://127.0.0.1:3001/client/version
  smoke_check "Sign-in page (/sign-in)" proxy_request /sign-in
  smoke_check "Better Auth (/auth/get-session)" proxy_request /auth/get-session
  [ "$SMOKE_FAILED" = false ]
}

psql_exec() {
  docker compose exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" $*"
}

show_banner() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "                 Fleetctrl Hub    "
  echo "    ╔════════════════════════════════════════╗"
  echo "    ║          DOCKER ENVIRONMENT            ║"
  echo "    ╚════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_summary() {
  local title="$1"
  echo -e "\n${GREEN}${BOLD} ${title}${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Hub Dashboard:     ${NC} ${CYAN}${SITE_URL}${NC}"
  echo -e "${BOLD}  Device API:        ${NC} ${CYAN}${API_URL}${NC}"
  echo -e "${BOLD}  HTTP Port:         ${NC} ${YELLOW}${PROXY_HTTP_PORT}${NC}"
  if [[ "$BEHIND_PROXY" == "true" ]]; then
    echo -e "${BOLD}  Mode:              ${NC} ${YELLOW}Behind reverse proxy${NC}"
  else
    echo -e "${BOLD}  HTTPS Port:        ${NC} ${YELLOW}${PROXY_HTTPS_PORT}${NC}"
  fi
  echo -e "${BOLD}  Postgres Dir:      ${NC} ${YELLOW}${POSTGRES_DATA_DIR}${NC}"
  echo -e "${BOLD}  RustFS Dir:        ${NC} ${YELLOW}${RUSTFS_DATA_DIR}${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
}

# ─────────────────────────────────────────────────────────
# BACKUP (Postgres dump + bucket copy)
# ─────────────────────────────────────────────────────────
# Runs an aws-cli script against the bucket; the optional first argument is a volume mount.
s3_shell() {
  local mount=()
  if [ $# -gt 1 ]; then
    mount=(-v "$1")
    shift
  fi
  docker compose run --rm --no-deps "${mount[@]}" rustfs-init \
    "aws configure set default.s3.addressing_style path && $1"
}

cmd_backup() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Backup ===${NC}\n"
  require_env_file
  require_v3_install
  load_env

  local name
  name="backup-$(date +%Y-%m-%d_%H-%M-%S)"
  local dir="backups/${name}"
  mkdir -p "$dir"

  echo -e "${BLUE}▶ Dumping the fleetctrl database...${NC}"
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d fleetctrl -Fc' > "${dir}/fleetctrl.dump"

  echo -e "${BLUE}▶ Copying stored files (${S3_BUCKET:-fleetctrl-files})...${NC}"
  s3_shell "$(pwd)/${dir}:/backup" "aws s3 sync s3://${S3_BUCKET:-fleetctrl-files} /backup/files --only-show-errors"

  echo -e "\n${GREEN}${BOLD}✓ Backup successful!${NC}"
  echo -e "Saved to: ${CYAN}$(pwd)/${dir}${NC}"
}

cmd_restore() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Restore ===${NC}\n"
  require_env_file
  require_v3_install
  load_env

  local backups=()
  mapfile -t backups < <(ls -1d backups/backup-*/ 2>/dev/null | sed 's|/$||' || true)
  if [ ${#backups[@]} -eq 0 ]; then
    echo -e "${YELLOW}No backups found in $(pwd)/backups.${NC}"
    exit 1
  fi

  echo -e "Available backups:"
  for i in "${!backups[@]}"; do
    echo -e "  [${CYAN}$i${NC}] $(basename "${backups[$i]}") (${YELLOW}$(du -sh "${backups[$i]}" | cut -f1)${NC})"
  done
  echo ""
  read -p "$(echo -e ${BOLD}"Select backup to restore [0-$(((${#backups[@]}-1)))]": ${NC})" SELECTION
  if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -ge ${#backups[@]} ]; then
    echo -e "${RED}Invalid selection.${NC}"
    exit 1
  fi
  local dir="${backups[$SELECTION]}"

  echo -e "\n${RED}⚠️  WARNING: the current database and stored files are replaced by the backup.${NC}"
  confirm "Restore '$(basename "$dir")'?" || { echo -e "${YELLOW}Restore cancelled.${NC}"; exit 0; }

  docker compose stop api hub
  echo -e "${BLUE}▶ Restoring the fleetctrl database...${NC}"
  docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force fleetctrl && createdb -U "$POSTGRES_USER" fleetctrl'
  docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d fleetctrl --no-owner' < "${dir}/fleetctrl.dump"
  echo -e "${BLUE}▶ Restoring stored files...${NC}"
  s3_shell "$(pwd)/${dir}:/backup:ro" "aws s3 sync /backup/files s3://${S3_BUCKET:-fleetctrl-files} --delete --only-show-errors"
  docker compose up -d api hub
  wait_for_service api
  echo -e "\n${GREEN}${BOLD}✓ Restore completed successfully!${NC}"
}

# ─────────────────────────────────────────────────────────
# SETUP
# ─────────────────────────────────────────────────────────
cmd_setup() {
  if [ -f .env ]; then
    echo -e "${YELLOW}Error: .env already exists. Setup should only be run once.${NC}"
    echo -e "${YELLOW}If you need to change configuration, edit .env directly or delete it to rerun setup.${NC}"
    exit 1
  fi

  for tool in curl openssl; do
    if ! command -v "$tool" &> /dev/null; then
      echo -e "${YELLOW}Error: '${tool}' is required but not installed.${NC}"
      exit 1
    fi
  done

  echo -e "${BLUE}▶ Starting setup process...${NC}"
  cp .env.example .env

  echo -e "${YELLOW}⚓ Network Configuration${NC}"
  read -p "$(echo -e ${BOLD}"  Enter HTTP Port [80]: "${NC})" PORT_HTTP_INPUT
  PROXY_HTTP_PORT=${PORT_HTTP_INPUT:-80}
  read -p "$(echo -e ${BOLD}"  Enter HTTPS Port [443]: "${NC})" PORT_HTTPS_INPUT
  PROXY_HTTPS_PORT=${PORT_HTTPS_INPUT:-443}
  read -p "$(echo -e ${BOLD}"  Enter Site URL [https://localhost]: "${NC})" SITE_URL_INPUT
  SITE_URL=${SITE_URL_INPUT:-https://localhost}
  SITE_URL=${SITE_URL%/}
  CADDY_DOMAIN=$(echo "$SITE_URL" | sed -E 's|^https?://||' | sed 's|/.*||')

  read -p "$(echo -e ${BOLD} Allow user registration? [Y/n]: ${NC})" ALLOW_REGISTRATION_INPUT
  if [[ "${ALLOW_REGISTRATION_INPUT}" =~ ^[Nn]$ ]]; then
    ALLOW_REGISTRATION=false
  else
    ALLOW_REGISTRATION=true
  fi

  echo -e "\n${YELLOW}💾 Storage Configuration${NC}"
  read -p "$(echo -e ${BOLD}"  Enter Postgres Data Directory [postgres_data]: "${NC})" POSTGRES_DATA_DIR_INPUT
  POSTGRES_DATA_DIR=${POSTGRES_DATA_DIR_INPUT:-postgres_data}
  read -p "$(echo -e ${BOLD}"  Enter RustFS Data Directory [rustfs-data]: "${NC})" RUSTFS_DATA_DIR_INPUT
  RUSTFS_DATA_DIR=${RUSTFS_DATA_DIR_INPUT:-rustfs-data}
  confirm_empty_dir "Postgres data" "$POSTGRES_DATA_DIR"
  confirm_empty_dir "RustFS data" "$RUSTFS_DATA_DIR"

  read -p "$(echo -e ${BOLD}"  Rebuild Docker images? if you changed NEXT_PUBLIC_* env vars [y/N]: "${NC})" REBUILD_INPUT
  if [[ "$REBUILD_INPUT" =~ ^[Yy]$ ]]; then
    REBUILD_FLAG="--build"
  else
    REBUILD_FLAG=""
  fi

  upsert_env "SITE_URL" "$SITE_URL" .env
  upsert_env "NEXT_PUBLIC_SITE_URL" "$SITE_URL" .env
  upsert_env "API_URL" "${SITE_URL}/api" .env
  upsert_env "ALLOW_REGISTRATION" "$ALLOW_REGISTRATION" .env
  upsert_env "NEXT_PUBLIC_ALLOW_REGISTRATION" "$ALLOW_REGISTRATION" .env
  upsert_env "PROXY_HTTP_PORT" "$PROXY_HTTP_PORT" .env
  upsert_env "PROXY_HTTPS_PORT" "$PROXY_HTTPS_PORT" .env
  upsert_env "CADDY_DOMAIN" "$CADDY_DOMAIN" .env
  upsert_env "POSTGRES_USER" "fleetctrl" .env
  upsert_env "POSTGRES_DB" "fleetctrl" .env
  upsert_env "POSTGRES_PASSWORD" "$(openssl rand -hex 24)" .env
  upsert_env "POSTGRES_DATA_DIR" "$POSTGRES_DATA_DIR" .env
  upsert_env "RUSTFS_SECRET_KEY" "$(openssl rand -hex 24)" .env
  upsert_env "RUSTFS_SERVER_DOMAINS" "${CADDY_DOMAIN:-localhost},rustfs" .env
  upsert_env "RUSTFS_DATA_DIR" "$RUSTFS_DATA_DIR" .env
  upsert_env "BETTER_AUTH_SECRET" "$(openssl rand -hex 32)" .env
  upsert_env "JWT_SECRET" "$(openssl rand -hex 32)" .env

  echo -e "${YELLOW}🔄 Reverse Proxy Configuration${NC}"
  echo -e "  ${BOLD}Are you running behind an external reverse proxy?${NC}"
  echo -e "  ${CYAN}Yes${NC} = External proxy (e.g., Nginx Proxy Manager, Traefik) handles HTTPS"
  echo -e "  ${CYAN}No${NC}  = Caddy handles HTTPS directly"
  read -p "$(echo -e ${BOLD}"  Behind reverse proxy? [y/N]: "${NC})" BEHIND_PROXY_INPUT
  if [[ "$BEHIND_PROXY_INPUT" =~ ^[Yy]$ ]]; then
    BEHIND_PROXY="true"
    TLS_INTERNAL="false"
    echo -e "  ${GREEN}✓ Configured for external reverse proxy (HTTP only)${NC}"
  else
    BEHIND_PROXY="false"
    echo -e "\n${YELLOW}🔒 SSL Configuration${NC}"
    echo -e "  ${BOLD}Is your domain publicly accessible?${NC}"
    echo -e "  ${CYAN}Yes${NC} = Use Let's Encrypt (requires public DNS pointing to this server)"
    echo -e "  ${CYAN}No${NC}  = Use self-signed certificates (for internal/dev environments)"
    read -p "$(echo -e ${BOLD}"  Is domain public? [y/N]: "${NC})" PUBLIC_DOMAIN_INPUT
    if [[ "$PUBLIC_DOMAIN_INPUT" =~ ^[Yy]$ ]]; then
      TLS_INTERNAL="false"
      echo -e "  ${GREEN}✓ Using Let's Encrypt certificates${NC}"
    else
      TLS_INTERNAL="true"
      echo -e "  ${GREEN}✓ Using self-signed certificates${NC}"
    fi
  fi
  configure_caddyfile "$BEHIND_PROXY" "$TLS_INTERNAL"
  upsert_env "BEHIND_PROXY" "$BEHIND_PROXY" .env
  upsert_env "TLS_INTERNAL" "$TLS_INTERNAL" .env

  load_env

  echo -e "${BLUE}▶ Starting services (migrations run automatically)...${NC}"
  docker compose up -d $REBUILD_FLAG
  wait_for_service api

  print_summary "Setup Complete!"
}

# ─────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────
cmd_update_manager() {
  if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Error: 'curl' is required but not installed.${NC}"
    exit 1
  fi

  if ! command -v mktemp &> /dev/null; then
    echo -e "${YELLOW}Error: 'mktemp' is required but not installed.${NC}"
    exit 1
  fi

  local script_name
  local temp_file
  script_name=$(basename "$0")
  temp_file=$(mktemp)
  trap 'rm -f "$temp_file"' RETURN

  echo -e "${BLUE}▶ Downloading latest ${script_name}...${NC}"
  curl -fsSL "${BASE_URL}/manage.sh" -o "$temp_file"

  if ! head -n 1 "$temp_file" | grep -q '^#!/bin/bash'; then
    echo -e "${RED}Downloaded file does not look like manage.sh. Aborting.${NC}"
    exit 1
  fi

  chmod +x "$temp_file"
  mv "$temp_file" "./${script_name}"
  trap - RETURN

  echo -e "\n${GREEN}${BOLD}Manager script updated successfully!${NC}"
  echo -e "${YELLOW}Run ./${script_name} again to use the updated version.${NC}\n"
}

cmd_update() {
  if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Error: 'curl' is required but not installed.${NC}"
    exit 1
  fi

  require_env_file
  if is_v2_install; then
    echo -e "${YELLOW}This installation runs FleetCtrl v2 (Convex). Version 3 replaces Convex with Postgres.${NC}"
    echo -e "Upgrade with: ${CYAN}$0 migrate-from-convex${NC}"
    exit 1
  fi

  echo -e "${BLUE}▶ Starting update process...${NC}"
  ensure_env_value "POSTGRES_USER" "fleetctrl" .env
  ensure_env_value "POSTGRES_DB" "fleetctrl" .env
  ensure_env_value "S3_BUCKET" "fleetctrl-files" .env
  load_env

  echo -e "\n${BLUE}▶ Creating automatic backup before update...${NC}"
  cmd_backup || echo -e "${YELLOW}Backup encountered an issue, but continuing update...${NC}"

  check_compose_image_updates "docker-compose.yml"

  echo -e "\n${BLUE}▶ Starting Docker services (migrations run automatically)...${NC}"
  docker compose up -d --build
  wait_for_service api

  print_summary "Update Complete!"
}

# ─────────────────────────────────────────────────────────
# MIGRATE FROM CONVEX (v2 → v3)
# ─────────────────────────────────────────────────────────
V2_BACKUP_DIR="../convex/backups"

convex_admin_key() {
  get_env_value "CONVEX_DEPLOY_KEY" .env | tr -d ' '
}

wait_for_convex() {
  echo -e "${BLUE}▶ Waiting for the Convex backend...${NC}"
  for _ in $(seq 1 100); do
    if [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" = "healthy" ]; then
      echo -e "  ${GREEN}✓ Convex is healthy${NC}"
      return 0
    fi
    sleep 3
  done
  echo -e "${RED}Convex did not become healthy. Check: docker compose logs convex${NC}"
  return 1
}

require_convex_running() {
  if [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" != "healthy" ]; then
    echo -e "${RED}Error: the Convex backend (fleetctrl-convex) is not running or is not healthy.${NC}"
    echo -e "Start v2 first with: ${CYAN}docker compose up -d${NC}"
    exit 1
  fi
}

# Exports Convex with file storage through the v2 convex-migration service (sets EXPORT_FILE).
convex_export() {
  local admin_key
  admin_key=$(convex_admin_key)
  if [ -z "$admin_key" ]; then
    echo -e "${RED}Error: CONVEX_DEPLOY_KEY not found in .env.${NC}"
    exit 1
  fi
  mkdir -p "$V2_BACKUP_DIR"
  EXPORT_FILE="backup-$(date +%Y-%m-%d_%H-%M-%S).zip"
  echo -e "${BLUE}▶ Exporting Convex data with files to ${V2_BACKUP_DIR}/${EXPORT_FILE}...${NC}"
  docker compose run --rm --no-deps \
    -v "$(cd "$V2_BACKUP_DIR" && pwd):/app/convex/backups" \
    convex-migration npx convex export \
    --url "http://convex:3210" \
    --admin-key "$admin_key" \
    --include-file-storage \
    --path "/app/convex/backups/${EXPORT_FILE}"
}

run_importer() {
  docker compose run --rm --no-deps --user root \
    -v "$(cd "$V2_BACKUP_DIR" && pwd):/backups" \
    api node import-convex.js \
    --zip "/backups/${EXPORT_FILE}" \
    --report "/backups/${EXPORT_FILE%.zip}.import-report.json" \
    "$@"
}

cmd_migrate_from_convex() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Upgrade v2 (Convex) → v3 (Postgres) ===${NC}\n"
  require_env_file
  if ! is_v2_install; then
    echo -e "${YELLOW}This installation does not run Convex any more.${NC}"
    if [ -f docker-compose.yml.v2.bak ]; then
      echo -e "To retry the upgrade, run ${CYAN}$0 rollback-to-convex${NC} first."
    fi
    exit 1
  fi
  load_env

  echo -e "This upgrade:"
  echo -e "  1. exports Convex (data and files) while v2 is still running,"
  echo -e "  2. stops the dashboard and proxy (devices back off and retry),"
  echo -e "  3. switches docker-compose.yml, Caddyfile and .env to v3 (v2 copies kept as *.v2.bak),"
  echo -e "  4. imports the export into Postgres and RustFS, after showing a dry-run report,"
  echo -e "  5. starts v3 and checks it, then stops Convex (its data is kept for rollback)."
  echo -e "Admins sign in again after the upgrade. Devices keep their IDs and tokens.\n"
  confirm "Start the upgrade?" || { echo -e "${YELLOW}Upgrade cancelled.${NC}"; exit 0; }

  require_convex_running
  convex_export

  echo -e "${BLUE}▶ Stopping hub and proxy...${NC}"
  docker compose stop hub proxy

  echo -e "${BLUE}▶ Switching configuration to v3...${NC}"
  cp docker-compose.yml docker-compose.yml.v2.bak
  cp Caddyfile Caddyfile.v2.bak
  cp .env .env.v2.bak
  local caddy_source="."
  if [ -n "${V3_SOURCE_DIR:-}" ]; then
    # Local checkout (testing): take the v3 files from there instead of GitHub.
    cp "${V3_SOURCE_DIR}/docker-compose.production.yml" docker-compose.yml
    caddy_source="$V3_SOURCE_DIR"
  else
    download_file "docker-compose.production.yml" docker-compose.yml
    download_file "Caddyfile.standalone" Caddyfile.standalone
    download_file "Caddyfile.proxy" Caddyfile.proxy
    download_file ".env.example" .env.example
  fi
  configure_caddyfile "${BEHIND_PROXY:-false}" "${TLS_INTERNAL:-true}" "$caddy_source"
  # The existing Postgres volume was created with the v2 superuser and database.
  upsert_env "POSTGRES_USER" "${POSTGRES_USER:-convex}" .env
  upsert_env "POSTGRES_DB" "${POSTGRES_DB:-convex_self_hosted}" .env
  ensure_env_value "NEXT_PUBLIC_SITE_URL" "$SITE_URL" .env
  ensure_env_value "API_URL" "${SITE_URL}/api" .env
  ensure_env_value "S3_BUCKET" "fleetctrl-files" .env
  load_env

  echo -e "${BLUE}▶ Starting Postgres and RustFS...${NC}"
  docker compose up -d postgres rustfs rustfs-init
  wait_for_service postgres

  if psql_exec -tAc "\"select 1 from pg_database where datname = 'fleetctrl'\"" | grep -q 1; then
    echo -e "${YELLOW}A fleetctrl database already exists (from an earlier attempt).${NC}"
    confirm "Drop it and import again?" || { echo -e "Run ${CYAN}$0 rollback-to-convex${NC} to return to v2."; exit 1; }
    psql_exec -c "\"drop database fleetctrl with (force)\""
  fi
  psql_exec -c "\"create database fleetctrl\""
  docker compose run --rm db-migrate

  echo -e "\n${BLUE}▶ Dry run of the import...${NC}"
  local dry_status=0
  run_importer --dry-run || dry_status=$?
  local auto_resolve=""
  if [ "$dry_status" -eq 2 ]; then
    echo -e "\n${YELLOW}Some conflicts need a decision (listed above under NEEDS A DECISION).${NC}"
    echo -e "The default resolution keeps the listed record and drops or clears the others."
    if confirm "Apply the default resolutions?"; then
      auto_resolve="--auto-resolve"
    else
      echo -e "Fix the data in v2, then run ${CYAN}$0 rollback-to-convex${NC} and upgrade again."
      exit 1
    fi
  elif [ "$dry_status" -ne 0 ]; then
    echo -e "${RED}The dry run failed. Nothing was imported.${NC} Return to v2 with ${CYAN}$0 rollback-to-convex${NC}."
    exit 1
  fi

  confirm "Import now?" || { echo -e "Return to v2 with ${CYAN}$0 rollback-to-convex${NC}."; exit 1; }
  if ! run_importer $auto_resolve; then
    echo -e "${RED}The import failed.${NC} Return to v2 with ${CYAN}$0 rollback-to-convex${NC}."
    exit 1
  fi

  echo -e "${BLUE}▶ Starting v3...${NC}"
  local started_at
  started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  docker compose up -d api hub proxy
  wait_for_service api
  if ! run_smoke_checks; then
    echo -e "${RED}Some smoke checks failed.${NC} Inspect with ${CYAN}docker compose logs api hub proxy${NC},"
    echo -e "or return to v2 with ${CYAN}$0 rollback-to-convex${NC}."
    exit 1
  fi

  echo -e "${BLUE}▶ Waiting up to 2 minutes for an existing device to check in...${NC}"
  local seen=0
  for _ in $(seq 1 24); do
    seen=$(psql_exec -d fleetctrl -tAc "\"select count(*) from computers where last_connection > '${started_at}'\"" 2>/dev/null | tr -d '[:space:]' || echo 0)
    [ "${seen:-0}" -gt 0 ] && break
    sleep 5
  done
  if [ "${seen:-0}" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} ${seen} device(s) authenticated against v3"
  else
    echo -e "  ${YELLOW}No device checked in yet (offline devices reconnect on their next start).${NC}"
  fi

  echo -e "${BLUE}▶ Stopping Convex (its data is kept for rollback)...${NC}"
  docker compose -f docker-compose.yml.v2.bak --env-file .env.v2.bak stop convex convex-dashboard || true

  print_summary "Upgrade to v3 Complete!"
  echo -e "${YELLOW}Until you confirm the upgrade, avoid enrolling devices and changing settings:${NC}"
  echo -e "${YELLOW}a rollback (${CYAN}$0 rollback-to-convex${YELLOW}) returns to the v2 data and loses them.${NC}"
  echo -e "When v3 works, remove Convex for good with ${CYAN}$0 cleanup-convex${NC}.\n"
}

cmd_rollback_to_convex() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Roll back to v2 (Convex) ===${NC}\n"
  for file in docker-compose.yml.v2.bak Caddyfile.v2.bak .env.v2.bak; do
    if [ ! -f "$file" ]; then
      echo -e "${RED}Error: ${file} not found; nothing to roll back to.${NC}"
      exit 1
    fi
  done
  echo -e "${RED}Everything written on v3 is lost: devices enrolled and admin changes made since the upgrade.${NC}"
  echo -e "Device state repopulates within about an hour."
  confirm "Roll back to v2?" || { echo -e "${YELLOW}Rollback cancelled.${NC}"; exit 0; }

  if ! is_v2_install; then
    docker compose stop api hub proxy || true
    mv docker-compose.yml docker-compose.yml.v3
    mv Caddyfile Caddyfile.v3
    mv .env .env.v3
  fi
  mv docker-compose.yml.v2.bak docker-compose.yml
  mv Caddyfile.v2.bak Caddyfile
  mv .env.v2.bak .env

  echo -e "${BLUE}▶ Starting v2...${NC}"
  docker compose up -d --remove-orphans
  wait_for_convex || true
  echo -e "\n${GREEN}${BOLD}✓ Rolled back to v2.${NC}"
  echo -e "The v3 configuration is kept as *.v3, and the fleetctrl database stays in Postgres;"
  echo -e "${CYAN}$0 migrate-from-convex${NC} replaces it on the next attempt."
}

cmd_cleanup_convex() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Remove Convex ===${NC}\n"
  require_env_file
  require_v3_install
  load_env

  echo -e "${RED}This permanently removes Convex: its container, data volume, database and buckets.${NC}"
  echo -e "${RED}After this, rollback to v2 is no longer possible.${NC}"
  confirm "Remove Convex?" || { echo -e "${YELLOW}Cleanup cancelled.${NC}"; exit 0; }

  if [ -f docker-compose.yml.v2.bak ]; then
    docker compose -f docker-compose.yml.v2.bak --env-file .env.v2.bak rm -f -s convex convex-dashboard convex-migration || true
  fi
  docker rm -f fleetctrl-convex fleetctrl-convex-migration >/dev/null 2>&1 || true

  local convex_data_dir
  convex_data_dir=$(get_env_value "CONVEX_DATA_DIR" .env.v2.bak 2>/dev/null)
  convex_data_dir=${convex_data_dir:-convex-data}
  if [[ "$convex_data_dir" == */* || "$convex_data_dir" == .* ]]; then
    echo -e "${YELLOW}Convex data is in the directory ${convex_data_dir}; delete it manually.${NC}"
  else
    docker volume rm "fleetctrl_${convex_data_dir}" >/dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} removed volume fleetctrl_${convex_data_dir}" || true
  fi

  if [ "${POSTGRES_DB:-fleetctrl}" != "fleetctrl" ]; then
    local old_db="$POSTGRES_DB"
    upsert_env "POSTGRES_DB" "fleetctrl" .env
    load_env
    docker compose up -d postgres
    wait_for_service postgres
    psql_exec -c "\"drop database if exists ${old_db} with (force)\""
    echo -e "  ${GREEN}✓${NC} dropped database ${old_db}"
  fi

  s3_shell 'for bucket in convex-snapshot-exports convex-snapshot-imports convex-modules convex-user-files convex-search-indexes; do aws s3 rb "s3://$bucket" --force >/dev/null 2>&1 && echo "  removed bucket $bucket"; done; true'

  rm -f docker-compose.yml.v2.bak Caddyfile.v2.bak .env.v2.bak docker-compose.yml.v3 Caddyfile.v3 .env.v3
  sedi '/^CONVEX_/d; /^NEXT_PUBLIC_CONVEX_/d' .env
  echo -e "\n${GREEN}${BOLD}✓ Convex removed.${NC} Convex exports in ${V2_BACKUP_DIR} were kept."
}

# ─────────────────────────────────────────────────────────
# MAIN MENU / ARGUMENT PARSING
# ─────────────────────────────────────────────────────────
run_choice() {
  case "$1" in
    1|setup)   cmd_setup ;;
    2|update)  cmd_update ;;
    3|backup)  cmd_backup ;;
    4|restore) cmd_restore ;;
    5|migrate-from-convex) cmd_migrate_from_convex ;;
    6|rollback-to-convex)  cmd_rollback_to_convex ;;
    7|cleanup-convex)      cmd_cleanup_convex ;;
    8|self-update|update-manager|manager-update) cmd_update_manager ;;
    q|Q|quit)
      echo -e "${YELLOW}Bye!${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid option '$1'.${NC}"
      echo -e "Usage: $0 [--option <1-8>] [setup|update|backup|restore|migrate-from-convex|rollback-to-convex|cleanup-convex|self-update]"
      exit 1
      ;;
  esac
}

# Parse --option / -o flag or a plain positional argument
if [ $# -gt 0 ]; then
  case "$1" in
    --option|-o)
      if [ -z "$2" ]; then
        echo -e "${RED}Error: --option requires a value.${NC}"
        exit 1
      fi
      show_banner
      run_choice "$2"
      ;;
    *)
      show_banner
      run_choice "$1"
      ;;
  esac
else
  show_banner
  echo -e "${BOLD}What would you like to do?${NC}\n"
  echo -e "  [${CYAN}1${NC}] Setup               — First-time installation and configuration"
  echo -e "  [${CYAN}2${NC}] Update              — Pull latest images and redeploy"
  echo -e "  [${CYAN}3${NC}] Backup              — Dump the database and stored files"
  echo -e "  [${CYAN}4${NC}] Restore             — Restore a backup"
  echo -e "  [${CYAN}5${NC}] Migrate from Convex — Upgrade a v2 installation to v3"
  echo -e "  [${CYAN}6${NC}] Roll back to Convex — Undo the upgrade (loses changes made on v3)"
  echo -e "  [${CYAN}7${NC}] Cleanup Convex      — Remove Convex data after a confirmed upgrade"
  echo -e "  [${CYAN}8${NC}] Self-update         — Update this management script"
  echo -e "  [${CYAN}q${NC}] Quit\n"

  read -p "$(echo -e ${BOLD}"Select an option: "${NC})" CHOICE
  echo ""
  run_choice "$CHOICE"
fi
