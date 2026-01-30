#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Change directory to the script's location (docker directory)
cd "$(dirname "$0")"

clear
echo -e "${CYAN}${BOLD}"
echo "                 Fleetctrl Hub    "
echo "    ╔════════════════════════════════════════╗"
echo "    ║          DOCKER ENVIRONMENT            ║"
echo "    ╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check for curl
if ! command -v curl &> /dev/null; then
  echo -e "${YELLOW}Error: 'curl' is required but not installed.${NC}"
  exit 1
fi

# Check for git
if ! command -v git &> /dev/null; then
  echo -e "${YELLOW}Error: 'git' is required but not installed.${NC}"
  exit 1
fi

# Git pull
if [ -d .git ]; then
  echo -e "${BLUE}▶ Pulling latest changes...${NC}"
  git pull
fi

# If no changes, exit
if [ -z "$(git status --porcelain)" ]; then
  echo -e "${GREEN}No changes detected.${NC}"
  exit 0
fi

echo -e "${BLUE}▶ Starting update process...${NC}"

# 1. Create .env if missing
if [ ! -f .env ]; then
  echo -e "${YELLOW}▶ .env file not found. Please run setup.sh first.${NC}"
  exit 1
fi

REBUILD_FLAG="--build"

# Load .env variables
set -a
source .env
set +a

# 3. Start services
echo -e "${BLUE}▶ Starting Docker services...${NC}"
docker compose up -d $REBUILD_FLAG

# 4. Wait for Convex to be ready
echo -e "${BLUE}▶ Waiting for Convex backend...${NC}"
until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
  echo -e "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}"
  sleep 3
done
echo -e "  ${GREEN}✓ Convex is healthy!${NC}"

# 6. Set Environment Variables on Convex Backend
echo -e "${BLUE}▶ Syncing Convex environment variables...${NC}"
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}

for var in "SITE_URL=$SITE_URL" "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" "ALLOW_REGISTRATION=$ALLOW_REGISTRATION"; do
  docker compose exec convex-cli npx convex env set "$var" \
    --url "http://convex:3210" \
    --admin-key "$ADMIN_KEY" > /dev/null
done

# 7. Deploy Schema
echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

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
