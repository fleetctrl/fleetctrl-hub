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

  if ! docker compose ps convex-cli | grep -q "Up"; then
    echo -e "${YELLOW}convex-cli container is not running. Attempting to start...${NC}"
    docker compose up -d --no-build convex-cli
    sleep 3
  fi

  docker compose exec convex-cli mkdir -p /app/convex/backups

  if docker compose exec convex-cli npx convex export \
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

  if ! docker compose ps convex-cli | grep -q "Up"; then
    echo -e "${YELLOW}convex-cli container is not running. Attempting to start...${NC}"
    docker compose up -d --no-build convex-cli
    sleep 3
  fi

  if docker compose exec convex-cli npx convex import \
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
    ADMIN_KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')
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
  docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "${BLUE}▶ Running Convex data migrations...${NC}"
  docker compose exec convex-cli npx convex run convex/migrations.ts:runInstallAggregateBackfill --url "http://convex:3210" --admin-key "$ADMIN_KEY" > /dev/null

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

  NEXT_PUBLIC_CONVEX_URL="${SITE_URL}"
  NEXT_PUBLIC_CONVEX_SITE_URL="${SITE_URL}"
  NEXT_PUBLIC_SITE_URL="${SITE_URL}"
  CONVEX_SITE_URL="${SITE_URL}"
  CONVEX_SITE_INTERNAL_URL="http://convex:3211"

  read -p "$(echo -e ${BOLD}\"  Allow user registration? [Y/n]: \"${NC})" ALLOW_REGISTRATION_INPUT
  if [[ "${ALLOW_REGISTRATION_INPUT}" =~ ^[Nn]$ ]]; then
    ALLOW_REGISTRATION=false
  else
    ALLOW_REGISTRATION=true
  fi
  NEXT_PUBLIC_ALLOW_REGISTRATION=$ALLOW_REGISTRATION

  HAS_CONVEX_KEY=false
  EXISTING_DATA_DIR=""
  CURRENT_KEY=$(grep -m 1 "^CONVEX_DEPLOY_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')
  if [ -n "$CURRENT_KEY" ]; then
    HAS_CONVEX_KEY=true
  fi
  EXISTING_DATA_DIR=$(grep -m 1 "^CONVEX_DATA_DIR=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')

  echo -e "\n${YELLOW}💾 Storage Configuration${NC}"

  if [ "$HAS_CONVEX_KEY" = true ]; then
    echo -e "  ${GREEN}ℹ️  Existing configuration (CONVEX_DEPLOY_KEY) found in .env.${NC}"
    echo -e "  ${GREEN}Convex key generation and setup will be skipped to protect your instance.${NC}"
    SKIP_CONVEX_SETUP=true
    CONVEX_DATA_DIR=${EXISTING_DATA_DIR:-convex-data}
    echo -e "  ${BOLD}Using existing Data Directory:${NC} ${CYAN}$CONVEX_DATA_DIR${NC}"

    echo -e "\n${BLUE}▶ Creating automatic backup before proceeding...${NC}"
    cmd_backup || echo -e "${YELLOW}Backup encountered an issue, but continuing setup...${NC}"
  else
    read -p "$(echo -e ${BOLD}"  Enter Convex Data Directory [convex-data]: "${NC})" CONVEX_DATA_DIR_INPUT
    CONVEX_DATA_DIR=${CONVEX_DATA_DIR_INPUT:-convex-data}

    if [ -d "$CONVEX_DATA_DIR" ] && [ "$(ls -A "$CONVEX_DATA_DIR" 2>/dev/null)" ]; then
      echo -e "\n${RED}⚠️  WARNING: Data directory '$CONVEX_DATA_DIR' already exists and is not empty.${NC}"
      echo -e "${RED}Continuing might overwrite or corrupt your existing Convex data!${NC}"
      read -p "$(echo -e ${BOLD}"  Are you sure you want to continue and risk overwriting data? (y/N): "${NC})" OVERWRITE_INPUT
      if [[ ! "$OVERWRITE_INPUT" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Setup cancelled to protect existing data.${NC}"
        exit 1
      fi
    fi
    SKIP_CONVEX_SETUP=false
  fi

  read -p "$(echo -e ${BOLD}"  Rebuild Docker images? if you changed NEXT_PUBLIC_* env vars [y/N]: "${NC})" REBUILD_INPUT
  if [[ "$REBUILD_INPUT" =~ ^[Yy]$ ]]; then
    REBUILD_FLAG="--build"
  else
    REBUILD_FLAG=""
  fi

  sedi "s|^SITE_URL=.*|SITE_URL=$SITE_URL|" .env
  sedi "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL|" .env
  sedi "s|^NEXT_PUBLIC_CONVEX_URL=.*|NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL|" .env

  if grep -q "^NEXT_PUBLIC_CONVEX_SITE_URL=" .env; then
    sedi "s|^NEXT_PUBLIC_CONVEX_SITE_URL=.*|NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL|" .env
  else
    echo "NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL" >> .env
  fi

  if grep -q "^CONVEX_SITE_URL=" .env; then
    sedi "s|^CONVEX_SITE_URL=.*|CONVEX_SITE_URL=$CONVEX_SITE_URL|" .env
  else
    echo "CONVEX_SITE_URL=$CONVEX_SITE_URL" >> .env
  fi

  if grep -q "^CONVEX_SITE_INTERNAL_URL=" .env; then
    sedi "s|^CONVEX_SITE_INTERNAL_URL=.*|CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL|" .env
  else
    echo "CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL" >> .env
  fi

  if grep -q "^API_URL=" .env; then
    sedi "s|^API_URL=.*|API_URL=${SITE_URL}/api|" .env
  else
    echo "API_URL=${SITE_URL}/api" >> .env
  fi

  if grep -q "^ALLOW_REGISTRATION=" .env; then
    sedi "s|^ALLOW_REGISTRATION=.*|ALLOW_REGISTRATION=$ALLOW_REGISTRATION|" .env
  else
    echo "ALLOW_REGISTRATION=$ALLOW_REGISTRATION" >> .env
  fi

  if grep -q "^NEXT_PUBLIC_ALLOW_REGISTRATION=" .env; then
    sedi "s|^NEXT_PUBLIC_ALLOW_REGISTRATION=.*|NEXT_PUBLIC_ALLOW_REGISTRATION=$NEXT_PUBLIC_ALLOW_REGISTRATION|" .env
  else
    echo "NEXT_PUBLIC_ALLOW_REGISTRATION=$NEXT_PUBLIC_ALLOW_REGISTRATION" >> .env
  fi

  sedi "s/^PROXY_HTTP_PORT=.*/PROXY_HTTP_PORT=$PROXY_HTTP_PORT/" .env
  sedi "s/^PROXY_HTTPS_PORT=.*/PROXY_HTTPS_PORT=$PROXY_HTTPS_PORT/" .env
  sedi "s|^CONVEX_DATA_DIR=.*|CONVEX_DATA_DIR=$CONVEX_DATA_DIR|" .env

  CADDY_DOMAIN=$(echo "$SITE_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
  sedi "s/^CADDY_DOMAIN=.*/CADDY_DOMAIN=$CADDY_DOMAIN/" .env

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
    sedi "s/^TLS_INTERNAL=.*/TLS_INTERNAL=$TLS_INTERNAL/" .env
  fi

  if grep -q "^BEHIND_PROXY=" .env; then
    sedi "s/^BEHIND_PROXY=.*/BEHIND_PROXY=$BEHIND_PROXY/" .env
  else
    echo "BEHIND_PROXY=$BEHIND_PROXY" >> .env
  fi

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
  docker compose up -d convex $REBUILD_FLAG

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
    ADMIN_KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')

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
  docker compose up -d $REBUILD_FLAG

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
    docker compose exec convex-cli npx convex env set "$var" \
      --url "http://convex:3210" \
      --admin-key "$ADMIN_KEY" > /dev/null
  done

  echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
  docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "${BLUE}▶ Running Convex data migrations...${NC}"
  docker compose exec convex-cli npx convex run convex/migrations.ts:runInstallAggregateBackfill --url "http://convex:3210" --admin-key "$ADMIN_KEY" > /dev/null

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
  docker compose up -d $REBUILD_FLAG

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
    docker compose exec convex-cli npx convex env set "$var" \
      --url "http://convex:3210" \
      --admin-key "$ADMIN_KEY" > /dev/null
  done

  docker compose exec convex-cli npx convex env set "CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL_FOR_CONVEX" \
    --url "http://convex:3210" \
    --admin-key "$ADMIN_KEY" > /dev/null

  echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
  docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

  echo -e "${BLUE}▶ Running Convex data migrations...${NC}"
  docker compose exec convex-cli npx convex run convex/migrations.ts:runInstallAggregateBackfill --url "http://convex:3210" --admin-key "$ADMIN_KEY" > /dev/null

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
