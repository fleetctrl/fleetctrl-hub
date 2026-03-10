#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

echo -e "${CYAN}${BOLD}=== Fleetctrl Hub - Convex Restore ===${NC}\n"

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

# List available backups in ../convex/backups directory
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

# Check if convex-cli container is running
if ! docker compose ps convex-cli | grep -q "Up"; then
  echo -e "${YELLOW}convex-cli container is not running. Attempting to start...${NC}"
  docker compose up -d convex-cli
  sleep 3
fi

# Run import
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
