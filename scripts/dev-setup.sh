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

LOCAL_CONVEX_URL="http://localhost:3210"       # API port
LOCAL_CONVEX_SITE_URL="http://localhost:3211"  # HTTP actions / better-auth site port

cd "$(dirname "$0")/.."

# ─────────────────────────────────────────────────────────
# CHECKS
# ─────────────────────────────────────────────────────────
for cmd in node pnpm npx openssl; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not installed.${NC}"
    exit 1
  fi
done

# ─────────────────────────────────────────────────────────
# BANNER
# ─────────────────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
echo "    ╔════════════════════════════════════════╗"
echo "    ║    Fleetctrl Hub — Dev Setup           ║"
echo "    ╚════════════════════════════════════════╝"
echo -e "${NC}"

# ─────────────────────────────────────────────────────────
# MODE SELECTION
# ─────────────────────────────────────────────────────────
echo -e "${BOLD}Kde bude běžet Convex backend?${NC}"
echo -e "  ${CYAN}1)${NC} Cloud  — deployment na Convex cloud (vyžaduje účet)"
echo -e "  ${CYAN}2)${NC} Lokálně — lokální backend v Dockeru (${LOCAL_CONVEX_URL})"
echo ""
read -p "$(echo -e ${BOLD}"Výběr [1/2]: "${NC})" MODE_CHOICE

case "$MODE_CHOICE" in
  1) MODE="cloud" ;;
  2) MODE="local" ;;
  *)
    echo -e "${RED}Neplatná volba. Ukončuji.${NC}"
    exit 1
    ;;
esac

echo ""

# ─────────────────────────────────────────────────────────
# .env / .env.local
# ─────────────────────────────────────────────────────────
if [ -f .env ] || [ -f .env.local ]; then
  echo -e "${YELLOW}⚠️  .env nebo .env.local already exists.${NC}"
  read -p "$(echo -e ${BOLD}"Přepsat a spustit setup znovu? [y/N]: "${NC})" OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Setup zrušen.${NC}"
    exit 0
  fi
  rm -f .env .env.local
fi

echo -e "${BLUE}▶ Instaluji závislosti...${NC}"
pnpm install

# ─────────────────────────────────────────────────────────
# CONVEX DEPLOY
# ─────────────────────────────────────────────────────────
append_if_missing() {
  local key="$1"
  local value="$2"
  for envfile in .env .env.local; do
    if ! grep -q "^${key}=" "$envfile" 2>/dev/null; then
      echo "${key}=${value}" >> "$envfile"
    fi
  done
}

if [ "$MODE" = "cloud" ]; then
  echo -e "${BLUE}▶ Konfiguruji Convex cloud deployment...${NC}"
  echo -e "  ${CYAN}Pokud nejsi přihlášen, otevře se prohlížeč.${NC}\n"

  npx convex dev --once

  if [ ! -f .env.local ]; then
    echo -e "${RED}Error: .env.local nebylo vytvořeno. Aborting.${NC}"
    exit 1
  fi
  # Mirror what convex dev --once wrote into .env.local also into .env
  cp .env.local .env

  CONVEX_URL=$(grep -m 1 "^NEXT_PUBLIC_CONVEX_URL=" .env.local | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ' | tr -d '\r')
  if [ -z "$CONVEX_URL" ]; then
    echo -e "${RED}Error: NEXT_PUBLIC_CONVEX_URL nenalezeno v .env.local.${NC}"
    exit 1
  fi

  # Derive .site URL from .cloud URL
  CONVEX_SITE_URL=$(echo "$CONVEX_URL" | sed 's/\.cloud$/.site/')

  echo -e "${BLUE}▶ Zapisuji env vars do .env a .env.local...${NC}"
  append_if_missing "CONVEX_SITE_URL"             "$CONVEX_SITE_URL"
  append_if_missing "NEXT_PUBLIC_CONVEX_SITE_URL" "$CONVEX_SITE_URL"
  append_if_missing "NEXT_PUBLIC_SITE_URL"        "http://localhost:3000"
  append_if_missing "NEXT_PUBLIC_ALLOW_REGISTRATION" "true"

  echo -e "${BLUE}▶ Nastavuji Convex backend env vars...${NC}"
  BA_SECRET=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  npx convex env set BETTER_AUTH_SECRET  "$BA_SECRET"            > /dev/null
  npx convex env set JWT_SECRET          "$JWT_SECRET"           > /dev/null
  npx convex env set SITE_URL            "http://localhost:3000" > /dev/null
  npx convex env set API_URL             "$CONVEX_SITE_URL"      > /dev/null
  npx convex env set ALLOW_REGISTRATION  "true"                  > /dev/null

  DISPLAY_URL="$CONVEX_URL"
  DEV_CMD="npx convex dev"

else
  echo -e "${BLUE}▶ Spouštím lokální Convex backend a deployuji funkce...${NC}"
  echo -e "  ${CYAN}Backend poběží na ${LOCAL_CONVEX_URL}${NC}\n"

  npx convex dev --local --once

  echo -e "${BLUE}▶ Zapisuji env vars do .env a .env.local...${NC}"
  touch .env .env.local
  append_if_missing "NEXT_PUBLIC_CONVEX_URL"         "$LOCAL_CONVEX_URL"
  append_if_missing "CONVEX_SITE_URL"                "$LOCAL_CONVEX_SITE_URL"
  append_if_missing "NEXT_PUBLIC_CONVEX_SITE_URL"    "$LOCAL_CONVEX_SITE_URL"
  append_if_missing "NEXT_PUBLIC_SITE_URL"           "http://localhost:3000"
  append_if_missing "NEXT_PUBLIC_ALLOW_REGISTRATION" "true"

  echo -e "${BLUE}▶ Nastavuji Convex backend env vars...${NC}"
  BA_SECRET=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  npx convex env set BETTER_AUTH_SECRET  "$BA_SECRET"             > /dev/null
  npx convex env set JWT_SECRET          "$JWT_SECRET"            > /dev/null
  npx convex env set SITE_URL            "http://localhost:3000"  > /dev/null
  npx convex env set API_URL             "$LOCAL_CONVEX_SITE_URL" > /dev/null
  npx convex env set ALLOW_REGISTRATION  "true"                   > /dev/null

  DISPLAY_URL="$LOCAL_CONVEX_URL"
  DEV_CMD="npx convex dev --local"
fi

echo -e "  ${GREEN}✓ Backend env vars nastaveny.${NC}"

# ─────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD} Dev Setup Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Convex:  ${NC}${CYAN}${DISPLAY_URL}${NC}"
echo -e "${BOLD}  App:     ${NC}${CYAN}http://localhost:3000${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "\n${BOLD}Spusť dev servery (každý v samostatném terminálu):${NC}"
echo -e "  ${CYAN}${DEV_CMD}${NC}   — Convex backend (hot reload)"
echo -e "  ${CYAN}pnpm run dev${NC}             — Next.js frontend\n"
echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
