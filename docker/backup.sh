#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Convex Backup ===${NC}\n"

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found. Have you run setup.sh?${NC}"
  exit 1
fi

# Load Admin Key
ADMIN_KEY=$(grep -m 1 "^CONVEX_DEPLOY_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')

if [ -z "$ADMIN_KEY" ]; then
  echo -e "${RED}Error: CONVEX_DEPLOY_KEY not found in .env.${NC}"
  exit 1
fi

# Generate backup filename
BACKUP_FILENAME="backup-$(date +%Y-%m-%d_%H-%M-%S).zip"
BACKUP_PATH="/app/convex/backups/$BACKUP_FILENAME"
LOCAL_BACKUP_PATH="../convex/backups/$BACKUP_FILENAME"

echo -e "${BLUE}▶ Starting export process...${NC}"
echo -e "Target file: ${CYAN}$LOCAL_BACKUP_PATH${NC}\n"

# Check if convex-cli container is running
if ! docker compose ps convex-cli | grep -q "Up"; then
  echo -e "${YELLOW}convex-cli container is not running. Attempting to start...${NC}"
  docker compose up -d convex-cli
  sleep 3
fi

# Ensure backups directory exists inside container context
docker compose exec convex-cli mkdir -p /app/convex/backups

# Run export
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
