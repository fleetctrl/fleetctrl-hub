#!/bin/bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)
ACTION="${1:-up}"
BUILD_FLAG=""
SYNC_CONVEX="false"
LOG_SERVICE="hub"

print_usage() {
  echo "Usage:"
  echo "  ./dev.sh up [--build] [--sync-convex]"
  echo "  ./dev.sh down"
  echo "  ./dev.sh restart [--build] [--sync-convex]"
  echo "  ./dev.sh logs [service]"
  echo "  ./dev.sh sync-convex"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${YELLOW}Error: 'docker' is required but not installed.${NC}"
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo -e "${YELLOW}Error: Docker Compose plugin is not available.${NC}"
    exit 1
  fi
}

ensure_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      echo -e "${BLUE}▶ .env not found, creating from .env.example...${NC}"
      cp .env.example .env
    else
      echo -e "${YELLOW}Error: .env and .env.example are missing in docker/.${NC}"
      exit 1
    fi
  fi
}

ensure_caddyfile() {
  if [ -f Caddyfile ]; then
    return
  fi

  # shellcheck disable=SC1091
  source .env
  if [ "${BEHIND_PROXY:-false}" = "true" ]; then
    cp Caddyfile.proxy Caddyfile
  else
    cp Caddyfile.standalone Caddyfile
  fi
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { updated = 0 }
    $0 ~ "^" k "=" {
      print k "=" v
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print k "=" v
      }
    }
  ' .env > "$tmp_file"
  mv "$tmp_file" .env
}

sync_convex() {
  echo -e "${BLUE}▶ Syncing Convex env and schema...${NC}"

  docker compose "${COMPOSE_FILES[@]}" up -d convex convex-cli >/dev/null

  until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" = "healthy" ]; do
    echo -e "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}"
    sleep 3
  done

  # shellcheck disable=SC1091
  source .env
  local admin_key="${CONVEX_DEPLOY_KEY:-}"
  if [ -z "$admin_key" ]; then
    echo -e "${BLUE}▶ Generating Convex Admin Key...${NC}"
    admin_key="$(docker compose "${COMPOSE_FILES[@]}" exec -T convex ./generate_admin_key.sh | tr -d '\r')"
    if [ -z "$admin_key" ]; then
      echo -e "${YELLOW}Error: failed to generate CONVEX_DEPLOY_KEY.${NC}"
      exit 1
    fi
    upsert_env_var "CONVEX_DEPLOY_KEY" "\"$admin_key\""
  fi

  # Validate key; if stale (e.g. new Convex data volume/instance), regenerate once.
  if ! docker compose "${COMPOSE_FILES[@]}" exec -T convex-cli npx convex env list \
    --url "http://convex:3210" \
    --admin-key "$admin_key" >/dev/null 2>&1; then
    echo -e "${YELLOW}▶ Existing CONVEX_DEPLOY_KEY is invalid, generating a new one...${NC}"
    admin_key="$(docker compose "${COMPOSE_FILES[@]}" exec -T convex ./generate_admin_key.sh | tr -d '\r')"
    if [ -z "$admin_key" ]; then
      echo -e "${YELLOW}Error: failed to refresh CONVEX_DEPLOY_KEY.${NC}"
      exit 1
    fi
    upsert_env_var "CONVEX_DEPLOY_KEY" "\"$admin_key\""
  fi

  # shellcheck disable=SC1091
  source .env
  local site_url="${SITE_URL:-https://localhost}"
  local better_auth_secret="${BETTER_AUTH_SECRET:-}"
  local jwt_secret="${JWT_SECRET:-}"
  local api_url="${API_URL:-${site_url}/api}"
  local allow_registration="${ALLOW_REGISTRATION:-true}"
  local convex_site_internal_url_for_convex="${CONVEX_SITE_INTERNAL_URL_FOR_CONVEX:-http://127.0.0.1:3211}"

  for var in \
    "SITE_URL=$site_url" \
    "BETTER_AUTH_SECRET=$better_auth_secret" \
    "JWT_SECRET=$jwt_secret" \
    "API_URL=$api_url" \
    "ALLOW_REGISTRATION=$allow_registration" \
    "CONVEX_SITE_INTERNAL_URL=$convex_site_internal_url_for_convex"; do
    docker compose "${COMPOSE_FILES[@]}" exec -T convex-cli npx convex env set "$var" \
      --url "http://convex:3210" \
      --admin-key "$admin_key" >/dev/null
  done

  docker compose "${COMPOSE_FILES[@]}" exec -T convex-cli npx convex deploy \
    --url "http://convex:3210" \
    --admin-key "$admin_key" \
    --yes >/dev/null

  echo -e "${GREEN}${BOLD} Convex sync complete.${NC}"
}

run_up() {
  echo -e "${BLUE}▶ Starting local dev stack...${NC}"
  docker compose "${COMPOSE_FILES[@]}" up -d ${BUILD_FLAG}

  # shellcheck disable=SC1091
  source .env
  echo -e "${GREEN}${BOLD} Dev stack is running.${NC}"
  echo -e "${CYAN}Hub:${NC} ${SITE_URL:-https://localhost}"
  echo -e "${CYAN}Logs:${NC} ./dev.sh logs hub"
}

run_down() {
  echo -e "${BLUE}▶ Stopping local dev stack...${NC}"
  docker compose "${COMPOSE_FILES[@]}" down
  echo -e "${GREEN}${BOLD} Dev stack stopped.${NC}"
}

run_logs() {
  local service="${1:-hub}"
  docker compose "${COMPOSE_FILES[@]}" logs -f "$service"
}

if [ $# -gt 0 ] && [[ "$1" != -* ]]; then
  ACTION="$1"
  shift
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --build)
      BUILD_FLAG="--build"
      ;;
    --sync-convex)
      SYNC_CONVEX="true"
      ;;
    -h|--help|help)
      print_usage
      exit 0
      ;;
    *)
      if [ "$ACTION" = "logs" ] && [ "$LOG_SERVICE" = "hub" ]; then
        LOG_SERVICE="$1"
      else
        echo -e "${YELLOW}Unknown argument: $1${NC}"
        print_usage
        exit 1
      fi
      ;;
  esac
  shift
done

ensure_docker
ensure_env
ensure_caddyfile

case "$ACTION" in
  up)
    run_up
    if [ "$SYNC_CONVEX" = "true" ]; then
      sync_convex
    fi
    ;;
  restart)
    run_down
    run_up
    if [ "$SYNC_CONVEX" = "true" ]; then
      sync_convex
    fi
    ;;
  down)
    run_down
    ;;
  logs)
    run_logs "$LOG_SERVICE"
    ;;
  sync-convex)
    sync_convex
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    echo -e "${YELLOW}Unknown action: ${ACTION}${NC}"
    print_usage
    exit 1
    ;;
esac
