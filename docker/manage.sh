#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

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

run_convex_migration() {
  docker compose run --rm --no-deps convex-migration "$@"
}

run_convex_migration_with_backups() {
  mkdir -p ../convex/backups
  docker compose run --rm --no-deps \
    -v "$(pwd)/../convex/backups:/app/convex/backups" \
    convex-migration "$@"
}

generate_convex_admin_key() {
  docker compose exec -T convex ./generate_admin_key.sh \
    | tr -d '\r' \
    | awk '/^convex-self-hosted\|/ { key=$0 } END { print key }'
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

# ─────────────────────────────────────────────────────────
# BACKUP
# ─────────────────────────────────────────────────────────
cmd_backup() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Convex Backup ===${NC}\n"

  if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found. Have you run setup?${NC}"
    exit 1
  fi

  ADMIN_KEY=$(grep -m 1 "^CONVEX_DEPLOY_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')

  if [ -z "$ADMIN_KEY" ]; then
    echo -e "${RED}Error: CONVEX_DEPLOY_KEY not found in .env.${NC}"
    exit 1
  fi

  BACKUP_FILENAME="backup-$(date +%Y-%m-%d_%H-%M-%S).zip"
  BACKUP_PATH="/app/convex/backups/$BACKUP_FILENAME"
  LOCAL_BACKUP_PATH="../convex/backups/$BACKUP_FILENAME"

  echo -e "${BLUE}▶ Starting export process...${NC}"
  echo -e "Target file: ${CYAN}$LOCAL_BACKUP_PATH${NC}\n"

  if run_convex_migration_with_backups npx convex export \
    --url "http://convex:3210" \
    --admin-key "$ADMIN_KEY" \
    --include-file-storage \
    --path "$BACKUP_PATH"; then

    echo -e "\n${GREEN}${BOLD}✓ Backup successful!${NC}"
    echo -e "Saved to: ${CYAN}fleetctrl-hub/convex/backups/$BACKUP_FILENAME${NC}"
  else
    echo -e "\n${RED}✗ Backup failed.${NC}"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────
# RESTORE
# ─────────────────────────────────────────────────────────
cmd_restore() {
  echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Convex Restore ===${NC}\n"

  if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found. Have you run setup?${NC}"
    exit 1
  fi

  ADMIN_KEY=$(grep -m 1 "^CONVEX_DEPLOY_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')

  if [ -z "$ADMIN_KEY" ]; then
    echo -e "${RED}Error: CONVEX_DEPLOY_KEY not found in .env.${NC}"
    exit 1
  fi

  BACKUP_DIR="../convex/backups"
  BACKUPS=($(ls -1 $BACKUP_DIR/backup-*.zip 2>/dev/null || true))

  if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No backup files (backup-*.zip) found in the 'convex/backups' directory.${NC}"
    echo -e "Please place your backup ZIP file in the 'fleetctrl-hub/convex/backups' folder."
    exit 1
  fi

  echo -e "Available backups:"
  for i in "${!BACKUPS[@]}"; do
    FILENAME=$(basename "${BACKUPS[$i]}")
    SIZE=$(du -h "${BACKUPS[$i]}" | cut -f1)
    echo -e "  [${CYAN}$i${NC}] $FILENAME (${YELLOW}$SIZE${NC})"
  done

  echo ""
  read -p "$(echo -e ${BOLD}"Select backup to restore [0-$(((${#BACKUPS[@]}-1)))]": ${NC})" SELECTION

  if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 0 ] || [ "$SELECTION" -ge ${#BACKUPS[@]} ]; then
    echo -e "${RED}Invalid selection.${NC}"
    exit 1
  fi

  SELECTED_FILE=$(basename "${BACKUPS[$SELECTION]}")
  DOCKER_BACKUP_PATH="/app/convex/backups/$SELECTED_FILE"

  echo -e "\n${RED}⚠️  WARNING: Restoring a backup will import data into your database.${NC}"
  echo -e "Existing documents with the same IDs may be overwritten."
  read -p "$(echo -e ${BOLD}"Are you sure you want to restore '$SELECTED_FILE'? (y/N): "${NC})" CONFIRM

  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
  fi

  echo -e "\n${BLUE}▶ Starting import process...${NC}"

  if run_convex_migration_with_backups npx convex import \
    --url "http://convex:3210" \
    --admin-key "$ADMIN_KEY" \
    --replace-all --yes \
    "$DOCKER_BACKUP_PATH"; then

    echo -e "\n${GREEN}${BOLD}✓ Restore completed successfully!${NC}"
  else
    echo -e "\n${RED}✗ Restore failed.${NC}"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────
# CONVEX PUSH
# ─────────────────────────────────────────────────────────
cmd_convex_push() {
  if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Error: 'docker' is required but not installed.${NC}"
    exit 1
  fi

  if [ ! -f .env ]; then
    echo -e "${YELLOW}▶ .env file not found. Please run setup first.${NC}"
    exit 1
  fi

  set -a
  source .env
  set +a

  ADMIN_KEY=${CONVEX_DEPLOY_KEY}

  if [ -z "$ADMIN_KEY" ]; then
    echo -e "${BLUE}▶ Generating Convex Admin Key...${NC}"
    ADMIN_KEY=$(generate_convex_admin_key)
    if [ -z "$ADMIN_KEY" ]; then
      echo -e "${YELLOW}Failed to generate Admin Key${NC}"
      exit 1
    fi
    if grep -q "CONVEX_DEPLOY_KEY=" .env; then
      sedi "/^CONVEX_DEPLOY_KEY=/d" .env
    fi
    echo "CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"" >> .env
  fi

  echo -e "${BLUE}▶ Waiting for Convex backend...${NC}"
  until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
    echo -e "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}"
    sleep 3
  done
  echo -e "  ${GREEN}✓ Convex is healthy!${NC}"

  echo -e "${BLUE}▶ Pushing Convex schema and functions...${NC}"
  run_convex_migration npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "\n${GREEN}${BOLD} Push Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Convex API:    ${NC} ${CYAN}${NEXT_PUBLIC_CONVEX_URL}/api${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
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

  if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Error: 'curl' is required but not installed.${NC}"
    exit 1
  fi

  echo -e "${BLUE}▶ Starting setup process...${NC}"

  echo -e "${BLUE}▶ Creating .env from .env.example...${NC}"
  cp .env.example .env

  echo -e "${BLUE}▶ Configuring environment...${NC}"

  echo -e "${YELLOW}⚓ Network Configuration${NC}"
  read -p "$(echo -e ${BOLD}"  Enter HTTP Port [80]: "${NC})" PORT_HTTP_INPUT
  PROXY_HTTP_PORT=${PORT_HTTP_INPUT:-80}

  read -p "$(echo -e ${BOLD}"  Enter HTTPS Port [443]: "${NC})" PORT_HTTPS_INPUT
  PROXY_HTTPS_PORT=${PORT_HTTPS_INPUT:-443}

  read -p "$(echo -e ${BOLD}"  Enter Site URL [https://localhost]: "${NC})" SITE_URL_INPUT
  SITE_URL=${SITE_URL_INPUT:-https://localhost}
  CADDY_DOMAIN=$(echo "$SITE_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  RUSTFS_SERVER_DOMAINS_DEFAULT="${CADDY_DOMAIN:-localhost},rustfs"

  NEXT_PUBLIC_CONVEX_URL="${SITE_URL}"
  NEXT_PUBLIC_CONVEX_SITE_URL="${SITE_URL}"
  NEXT_PUBLIC_SITE_URL="${SITE_URL}"
  CONVEX_SITE_URL="${SITE_URL}"
  CONVEX_SITE_INTERNAL_URL="http://convex:3211"

  read -p "$(echo -e ${BOLD} Allow user registration? [Y/n]: ${NC})" ALLOW_REGISTRATION_INPUT
  if [[ "${ALLOW_REGISTRATION_INPUT}" =~ ^[Nn]$ ]]; then
    ALLOW_REGISTRATION=false
  else
    ALLOW_REGISTRATION=true
  fi
  NEXT_PUBLIC_ALLOW_REGISTRATION=$ALLOW_REGISTRATION

  HAS_CONVEX_KEY=false
  EXISTING_DATA_DIR=""
  CURRENT_KEY=$(get_env_value "CONVEX_DEPLOY_KEY" .env | tr -d ' ')
  if [ -n "$CURRENT_KEY" ]; then
    HAS_CONVEX_KEY=true
  fi
  EXISTING_DATA_DIR=$(get_env_value "CONVEX_DATA_DIR" .env | tr -d ' ')
  EXISTING_POSTGRES_PASSWORD=$(get_env_value "POSTGRES_PASSWORD" .env | tr -d ' ')
  EXISTING_POSTGRES_DATA_DIR=$(get_env_value "POSTGRES_DATA_DIR" .env | tr -d ' ')
  EXISTING_RUSTFS_ACCESS_KEY=$(get_env_value "RUSTFS_ACCESS_KEY" .env | tr -d ' ')
  EXISTING_RUSTFS_SECRET_KEY=$(get_env_value "RUSTFS_SECRET_KEY" .env | tr -d ' ')
  EXISTING_RUSTFS_SERVER_DOMAINS=$(get_env_value "RUSTFS_SERVER_DOMAINS" .env | tr -d ' ')
  EXISTING_RUSTFS_DATA_DIR=$(get_env_value "RUSTFS_DATA_DIR" .env | tr -d ' ')

  echo -e "\n${YELLOW}💾 Storage Configuration${NC}"

  if [ "$HAS_CONVEX_KEY" = true ]; then
    echo -e "  ${GREEN}ℹ️  Existing configuration (CONVEX_DEPLOY_KEY) found in .env.${NC}"
    echo -e "  ${GREEN}Convex key generation and setup will be skipped to protect your instance.${NC}"
    SKIP_CONVEX_SETUP=true
    CONVEX_DATA_DIR=${EXISTING_DATA_DIR:-convex-data}
    POSTGRES_PASSWORD=${EXISTING_POSTGRES_PASSWORD:-changeme}
    POSTGRES_DATA_DIR=${EXISTING_POSTGRES_DATA_DIR:-postgres_data}
    RUSTFS_ACCESS_KEY=${EXISTING_RUSTFS_ACCESS_KEY:-rustfsadmin}
    RUSTFS_SECRET_KEY=${EXISTING_RUSTFS_SECRET_KEY:-rustfsadmin}
    RUSTFS_SERVER_DOMAINS=${EXISTING_RUSTFS_SERVER_DOMAINS:-$RUSTFS_SERVER_DOMAINS_DEFAULT}
    RUSTFS_DATA_DIR=${EXISTING_RUSTFS_DATA_DIR:-rustfs-data}
    echo -e "  ${BOLD}Using existing Data Directory:${NC} ${CYAN}$CONVEX_DATA_DIR${NC}"

    echo -e "\n${BLUE}▶ Creating automatic backup before proceeding...${NC}"
    cmd_backup || echo -e "${YELLOW}Backup encountered an issue, but continuing setup...${NC}"
  else
    read -p "$(echo -e ${BOLD}"  Enter Convex Data Directory [convex-data]: "${NC})" CONVEX_DATA_DIR_INPUT
    CONVEX_DATA_DIR=${CONVEX_DATA_DIR_INPUT:-convex-data}
    read -p "$(echo -e ${BOLD}"  Enter Postgres Data Directory [postgres_data]: "${NC})" POSTGRES_DATA_DIR_INPUT
    POSTGRES_DATA_DIR=${POSTGRES_DATA_DIR_INPUT:-postgres_data}
    read -p "$(echo -e ${BOLD}"  Enter RustFS Data Directory [rustfs-data]: "${NC})" RUSTFS_DATA_DIR_INPUT
    RUSTFS_DATA_DIR=${RUSTFS_DATA_DIR_INPUT:-rustfs-data}

    confirm_empty_dir "Convex data" "$CONVEX_DATA_DIR"
    confirm_empty_dir "Postgres data" "$POSTGRES_DATA_DIR"
    confirm_empty_dir "RustFS data" "$RUSTFS_DATA_DIR"

    POSTGRES_PASSWORD=${EXISTING_POSTGRES_PASSWORD:-}
    RUSTFS_ACCESS_KEY=${EXISTING_RUSTFS_ACCESS_KEY:-rustfsadmin}
    RUSTFS_SECRET_KEY=${EXISTING_RUSTFS_SECRET_KEY:-}
    RUSTFS_SERVER_DOMAINS=${EXISTING_RUSTFS_SERVER_DOMAINS:-$RUSTFS_SERVER_DOMAINS_DEFAULT}

    if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "changeme" ]; then
      echo -e "${BLUE}▶ Generating random POSTGRES_PASSWORD...${NC}"
      POSTGRES_PASSWORD=$(openssl rand -hex 24)
    fi

    if [ -z "$RUSTFS_SECRET_KEY" ] || [ "$RUSTFS_SECRET_KEY" = "rustfsadmin" ]; then
      echo -e "${BLUE}▶ Generating random RUSTFS_SECRET_KEY...${NC}"
      RUSTFS_SECRET_KEY=$(openssl rand -hex 24)
    fi

    SKIP_CONVEX_SETUP=false
  fi

  read -p "$(echo -e ${BOLD}"  Rebuild Docker images? if you changed NEXT_PUBLIC_* env vars [y/N]: "${NC})" REBUILD_INPUT
  if [[ "$REBUILD_INPUT" =~ ^[Yy]$ ]]; then
    REBUILD_FLAG="--build"
  else
    REBUILD_FLAG=""
  fi

  upsert_env "SITE_URL" "$SITE_URL" .env
  upsert_env "NEXT_PUBLIC_SITE_URL" "$NEXT_PUBLIC_SITE_URL" .env
  upsert_env "NEXT_PUBLIC_CONVEX_URL" "$NEXT_PUBLIC_CONVEX_URL" .env
  upsert_env "NEXT_PUBLIC_CONVEX_SITE_URL" "$NEXT_PUBLIC_CONVEX_SITE_URL" .env
  upsert_env "CONVEX_SITE_URL" "$CONVEX_SITE_URL" .env
  upsert_env "CONVEX_SITE_INTERNAL_URL" "$CONVEX_SITE_INTERNAL_URL" .env
  upsert_env "API_URL" "${SITE_URL}/api" .env
  upsert_env "ALLOW_REGISTRATION" "$ALLOW_REGISTRATION" .env
  upsert_env "NEXT_PUBLIC_ALLOW_REGISTRATION" "$NEXT_PUBLIC_ALLOW_REGISTRATION" .env
  upsert_env "PROXY_HTTP_PORT" "$PROXY_HTTP_PORT" .env
  upsert_env "PROXY_HTTPS_PORT" "$PROXY_HTTPS_PORT" .env
  upsert_env "CONVEX_DATA_DIR" "$CONVEX_DATA_DIR" .env
  upsert_env "CADDY_DOMAIN" "$CADDY_DOMAIN" .env
  upsert_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD" .env
  upsert_env "POSTGRES_DATA_DIR" "$POSTGRES_DATA_DIR" .env
  upsert_env "RUSTFS_ACCESS_KEY" "$RUSTFS_ACCESS_KEY" .env
  upsert_env "RUSTFS_SECRET_KEY" "$RUSTFS_SECRET_KEY" .env
  upsert_env "RUSTFS_SERVER_DOMAINS" "$RUSTFS_SERVER_DOMAINS" .env
  upsert_env "RUSTFS_DATA_DIR" "$RUSTFS_DATA_DIR" .env

  echo -e "${YELLOW}🔄 Reverse Proxy Configuration${NC}"
  echo -e "  ${BOLD}Are you running behind an external reverse proxy?${NC}"
  echo -e "  ${CYAN}Yes${NC} = External proxy (e.g., Nginx Proxy Manager, Traefik) handles HTTPS"
  echo -e "  ${CYAN}No${NC}  = Caddy handles HTTPS directly"
  read -p "$(echo -e ${BOLD}"  Behind reverse proxy? [y/N]: "${NC})" BEHIND_PROXY_INPUT

  if [[ "$BEHIND_PROXY_INPUT" =~ ^[Yy]$ ]]; then
    BEHIND_PROXY="true"
    echo -e "  ${GREEN}✓ Configured for external reverse proxy (HTTP only)${NC}"
    cp Caddyfile.proxy Caddyfile
  else
    BEHIND_PROXY="false"
    cp Caddyfile.standalone Caddyfile

    echo -e "\n${YELLOW}🔒 SSL Configuration${NC}"
    echo -e "  ${BOLD}Is your domain publicly accessible?${NC}"
    echo -e "  ${CYAN}Yes${NC} = Use Let's Encrypt (requires public DNS pointing to this server)"
    echo -e "  ${CYAN}No${NC}  = Use self-signed certificates (for internal/dev environments)"
    read -p "$(echo -e ${BOLD}"  Is domain public? [y/N]: "${NC})" PUBLIC_DOMAIN_INPUT

    if [[ "$PUBLIC_DOMAIN_INPUT" =~ ^[Yy]$ ]]; then
      TLS_INTERNAL="false"
      echo -e "  ${GREEN}✓ Using Let's Encrypt certificates${NC}"
      sedi 's/^[[:space:]]*tls internal/    # tls internal/' Caddyfile
    else
      TLS_INTERNAL="true"
      echo -e "  ${GREEN}✓ Using self-signed certificates${NC}"
      sedi 's/^[[:space:]]*#[[:space:]]*tls internal/    tls internal/' Caddyfile
    fi
    upsert_env "TLS_INTERNAL" "$TLS_INTERNAL" .env
  fi

  upsert_env "BEHIND_PROXY" "$BEHIND_PROXY" .env

  DEFAULT_SECRET="fleetctrl_secret_123456"
  if grep -q "^BETTER_AUTH_SECRET=$DEFAULT_SECRET" .env; then
    echo -e "${BLUE}▶ Generating random BETTER_AUTH_SECRET...${NC}"
    BA_SECRET=$(openssl rand -hex 32)
    sedi "s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$BA_SECRET/" .env
  fi

  if ! grep -q "^JWT_SECRET=.." .env; then
    echo -e "${BLUE}▶ Generating random JWT_SECRET...${NC}"
    J_SECRET=$(openssl rand -hex 32)
    if grep -q "^JWT_SECRET=" .env; then
      sedi "s/^JWT_SECRET=.*/JWT_SECRET=$J_SECRET/" .env
    else
      echo "JWT_SECRET=$J_SECRET" >> .env
    fi
  fi

  set -a
  source .env
  set +a

  echo -e "${BLUE}▶ Starting Convex backend...${NC}"
  docker compose up -d rustfs rustfs-init convex $REBUILD_FLAG

  echo -e "${BLUE}▶ Waiting for Convex backend...${NC}"
  until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
    echo -ne "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}\r"
    sleep 2
  done
  echo -e "  ${GREEN}✓ Convex is healthy!${NC}                                "
  echo -e "  ${GREEN}✓ Convex is healthy!${NC}"

  if [ "$SKIP_CONVEX_SETUP" = true ]; then
    echo -e "${BLUE}▶ Skipping Convex key generation (already configured)...${NC}"
    ADMIN_KEY=$CURRENT_KEY
  else
    echo -e "${BLUE}▶ Generating Convex Admin Key...${NC}"
    ADMIN_KEY=$(generate_convex_admin_key)

    if [ -z "$ADMIN_KEY" ]; then
      echo -e "${YELLOW}Failed to generate Admin Key${NC}"
      exit 1
    fi

    if grep -q "^CONVEX_DEPLOY_KEY=" .env; then
      sedi "s@^CONVEX_DEPLOY_KEY=.*@CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"@" .env
    else
      if grep -q "# CONVEX_DEPLOY_KEY=" .env; then
        sedi "s@# CONVEX_DEPLOY_KEY=.*@CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"@" .env
      else
        echo "CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"" >> .env
      fi
    fi
  fi

  echo -e "${BLUE}▶ Starting remaining services...${NC}"
  docker compose up -d rustfs rustfs-init convex $REBUILD_FLAG
  docker compose up -d hub convex-migration convex-dashboard proxy $REBUILD_FLAG

  echo -e "${BLUE}▶ Syncing Convex environment variables...${NC}"
  BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
  JWT_SECRET=${JWT_SECRET}
  API_URL=${API_URL:-${SITE_URL}/api}
  ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}
  CONVEX_SITE_INTERNAL_URL_FOR_CONVEX=${CONVEX_SITE_INTERNAL_URL_FOR_CONVEX:-http://127.0.0.1:3211}

  for var in \
    "SITE_URL=$SITE_URL" \
    "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" \
    "JWT_SECRET=$JWT_SECRET" \
    "API_URL=$API_URL" \
    "ALLOW_REGISTRATION=$ALLOW_REGISTRATION" \
    "CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL_FOR_CONVEX"; do
    run_convex_migration npx convex env set "$var" \
      --url "http://convex:3210" \
      --admin-key "$ADMIN_KEY" > /dev/null
  done

  echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
  run_convex_migration npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "\n${GREEN}${BOLD} Setup Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Hub Dashboard:     ${NC} ${CYAN}${SITE_URL}${NC}"
  echo -e "${BOLD}  Convex API:        ${NC} ${CYAN}${NEXT_PUBLIC_CONVEX_URL}/api${NC}"
  echo -e "${BOLD}  HTTP Port:         ${NC} ${YELLOW}${PROXY_HTTP_PORT}${NC}"
  if [[ "$BEHIND_PROXY" == "true" ]]; then
    echo -e "${BOLD}  Mode:              ${NC} ${YELLOW}Behind reverse proxy${NC}"
  else
    echo -e "${BOLD}  HTTPS Port:        ${NC} ${YELLOW}${PROXY_HTTPS_PORT}${NC}"
  fi
  echo -e "${BOLD}  Data Dir:          ${NC} ${YELLOW}${CONVEX_DATA_DIR}${NC}"
  echo -e "${BOLD}  Postgres Dir:      ${NC} ${YELLOW}${POSTGRES_DATA_DIR}${NC}"
  echo -e "${BOLD}  RustFS Dir:        ${NC} ${YELLOW}${RUSTFS_DATA_DIR}${NC}"
  echo -e "${BOLD}  Convex Admin Key:  ${NC} ${YELLOW}${ADMIN_KEY}${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
}

# ─────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────
cmd_update() {
  if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}Error: 'curl' is required but not installed.${NC}"
    exit 1
  fi

  if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Error: 'git' is required but not installed.${NC}"
    exit 1
  fi

  if [ -d ../.git ]; then
    echo -e "${BLUE}▶ Pulling latest changes...${NC}"
    if ! (cd .. && git pull); then
      echo -e "${YELLOW}Warning: git pull failed (you may have local changes or merge conflicts).${NC}"
      echo -ne "${YELLOW}Do you want to continue anyway? [y/N] ${NC}"
      read -r continue_update
      if [[ ! "$continue_update" =~ ^[Yy]$ ]]; then
        exit 1
      fi
    fi
  fi

  if [ -d ../.git ] && [ -z "$(cd .. && git status --porcelain)" ]; then
    echo -e "${GREEN}No changes detected.${NC}"
    echo -ne "${YELLOW}Do you want to continue anyway? [y/N] ${NC}"
    read -r continue_update
    if [[ ! "$continue_update" =~ ^[Yy]$ ]]; then
      exit 0
    fi
  fi

  echo -e "${BLUE}▶ Starting update process...${NC}"

  if [ ! -f .env ]; then
    echo -e "${YELLOW}▶ .env file not found. Please run setup first.${NC}"
    exit 1
  fi

  SITE_URL=$(get_env_value "SITE_URL" .env)
  CADDY_DOMAIN=$(get_env_value "CADDY_DOMAIN" .env)
  if [ -z "$CADDY_DOMAIN" ] && [ -n "$SITE_URL" ]; then
    CADDY_DOMAIN=$(echo "$SITE_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  fi

  ensure_env_value "POSTGRES_PASSWORD" "changeme" .env
  ensure_env_value "POSTGRES_DATA_DIR" "postgres_data" .env
  ensure_env_value "RUSTFS_ACCESS_KEY" "rustfsadmin" .env
  ensure_env_value "RUSTFS_SECRET_KEY" "rustfsadmin" .env
  ensure_env_value "RUSTFS_SERVER_DOMAINS" "${CADDY_DOMAIN:-localhost},rustfs" .env
  ensure_env_value "RUSTFS_DATA_DIR" "rustfs-data" .env

  REBUILD_FLAG="--build"

  set -a
  source .env
  set +a

  ADMIN_KEY=${CONVEX_DEPLOY_KEY}
  CONVEX_SITE_INTERNAL_URL_FOR_CONVEX=${CONVEX_SITE_INTERNAL_URL_FOR_CONVEX:-http://127.0.0.1:3211}

  echo -e "\n${BLUE}▶ Creating automatic backup before update...${NC}"
  if [ -n "$ADMIN_KEY" ]; then
    cmd_backup || echo -e "${YELLOW}Backup encountered an issue, but continuing update...${NC}"
  else
    echo -e "${YELLOW}No Convex key found, skipping backup.${NC}"
  fi

  echo -e "\n${BLUE}▶ Starting Docker services...${NC}"
  docker compose up -d rustfs rustfs-init convex hub convex-migration convex-dashboard proxy $REBUILD_FLAG

  echo -e "${BLUE}▶ Waiting for Convex backend...${NC}"
  until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
    echo -e "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}"
    sleep 3
  done
  echo -e "  ${GREEN}✓ Convex is healthy!${NC}"

  echo -e "${BLUE}▶ Syncing Convex environment variables...${NC}"
  API_URL=${API_URL:-${SITE_URL}/api}
  ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}

  for var in "SITE_URL=$SITE_URL" "API_URL=$API_URL" "ALLOW_REGISTRATION=$ALLOW_REGISTRATION"; do
    run_convex_migration npx convex env set "$var" \
      --url "http://convex:3210" \
      --admin-key "$ADMIN_KEY" > /dev/null
  done

  run_convex_migration npx convex env set "CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL_FOR_CONVEX" \
    --url "http://convex:3210" \
    --admin-key "$ADMIN_KEY" > /dev/null

  echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
  run_convex_migration npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "\n${GREEN}${BOLD} Update Complete!${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Hub Dashboard: ${NC} ${CYAN}${SITE_URL}${NC}"
  echo -e "${BOLD}  Convex API:    ${NC} ${CYAN}${NEXT_PUBLIC_CONVEX_URL}${NC}"
  echo -e "${BOLD}  HTTP Port:     ${NC} ${YELLOW}${PROXY_HTTP_PORT}${NC}"
  if [[ "$BEHIND_PROXY" == "true" ]]; then
    echo -e "${BOLD}  Mode:          ${NC} ${YELLOW}Behind reverse proxy${NC}"
  else
    echo -e "${BOLD}  HTTPS Port:    ${NC} ${YELLOW}${PROXY_HTTPS_PORT}${NC}"
  fi
  echo -e "${BOLD}  Data Dir:      ${NC} ${YELLOW}${CONVEX_DATA_DIR}${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
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
    5|push)    cmd_convex_push ;;
    q|Q|quit)
      echo -e "${YELLOW}Bye!${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid option '$1'.${NC}"
      echo -e "Usage: $0 [--option <1-5>] [setup|update|backup|restore|push]"
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
  echo -e "  [${CYAN}1${NC}] Setup      — First-time installation and configuration"
  echo -e "  [${CYAN}2${NC}] Update     — Pull latest changes and redeploy"
  echo -e "  [${CYAN}3${NC}] Backup     — Export Convex data to a ZIP file"
  echo -e "  [${CYAN}4${NC}] Restore    — Import Convex data from a backup"
  echo -e "  [${CYAN}5${NC}] Push       — Redeploy Convex schema and functions only"
  echo -e "  [${CYAN}q${NC}] Quit\n"

  read -p "$(echo -e ${BOLD}"Select an option: "${NC})" CHOICE
  echo ""
  run_choice "$CHOICE"
fi
