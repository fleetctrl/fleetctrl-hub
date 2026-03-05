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

# Check for docker
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Error: 'docker' is required but not installed.${NC}"
  exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}▶ .env file not found. Please run setup.sh first.${NC}"
  exit 1
fi

# Load .env variables
set -a
source .env
set +a

ADMIN_KEY=${CONVEX_DEPLOY_KEY}

# Generate admin key if missing
if [ -z "$ADMIN_KEY" ]; then
  echo -e "${BLUE}▶ Generating Convex Admin Key...${NC}"
  ADMIN_KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')
  if [ -z "$ADMIN_KEY" ]; then
    echo -e "${YELLOW}Failed to generate Admin Key${NC}"
    exit 1
  fi
  if grep -q "CONVEX_DEPLOY_KEY=" .env; then
    if sed --version >/dev/null 2>&1; then
      sed -i -e "/^CONVEX_DEPLOY_KEY=/d" .env
    else
      sed -i '' -e "/^CONVEX_DEPLOY_KEY=/d" .env
    fi
  fi
  echo "CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"" >> .env
fi

# Wait for Convex to be ready
echo -e "${BLUE}▶ Waiting for Convex backend...${NC}"
until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
  echo -e "  ${YELLOW}⌛ Waiting for Convex to become healthy...${NC}"
  sleep 3
done
echo -e "  ${GREEN}✓ Convex is healthy!${NC}"

# Deploy Schema
echo -e "${BLUE}▶ Pushing Convex schema and functions...${NC}"
docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

echo -e "\n${GREEN}${BOLD} Push Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Convex API:    ${NC} ${CYAN}${NEXT_PUBLIC_CONVEX_URL}/api${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
