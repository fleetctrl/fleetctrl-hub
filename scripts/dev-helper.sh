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
    echo "                  Fleetctrl Hub    "
    echo "    ╔════════════════════════════════════════╗"
    echo "    ║             HELPER SCRIPT              ║"
    echo "    ╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

convex_env_set() {
    local key="$1"
    local value="$2"
    npx convex env set "$key" "$value" > /dev/null
}

convex_env_set_if_missing() {
    local key="$1"
    local value="$2"
    if npx convex env get "$key" > /dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠️  ${key} already set on server, skipping.${NC}"
    else
        npx convex env set "$key" "$value" > /dev/null
    fi
}

# ─────────────────────────────────────────────────────────
# MAIN MENU / ARGUMENT PARSING
# ─────────────────────────────────────────────────────────
run_choice() {
    case "$1" in
        1|sync\ convex\ env)   cmd_convex_env_sync;;
        q|Q|quit)
            echo -e "${YELLOW}Bye!${NC}"
            exit 0
        ;;
        *)
            echo -e "${RED}Invalid option '$1'.${NC}"
            echo -e "Usage: $0 [--option <1-5>] [sync convex env|q|quit]"
            exit 1
        ;;
    esac
}


# ─────────────────────────────────────────────────────────
# CMD: Sync Convex environment
# ─────────────────────────────────────────────────────────
cmd_convex_env_sync() {
    show_banner
    echo -e "${GREEN}Syncing Convex environment...${NC}"
    
    if [ ! -f .env ]; then
        echo -e "${YELLOW}▶ .env file not found. Please copy .env.example to .env. and run npx convex dev --local${NC}"
        exit 1
    fi
    
    if [ ! -f .env.local ]; then
        echo -e "${YELLOW}▶ .env local file not found. Please copy .env.example to .env.local. and run npx convex dev --local${NC}"
        exit 1
    fi
    
    set -a
    source .env
    set +a
    
    echo -e "${BLUE}▶ Syncing Convex environment variables...${NC}"
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
    JWT_SECRET=${JWT_SECRET}
    API_URL=${API_URL:-${CONVEX_SITE_URL}}
    SITE_URL=${SITE_URL:-${CONVEX_SITE_URL}}
    CONVEX_SITE_INTERNAL_URL=${CONVEX_SITE_INTERNAL_URL:-${LOCAL_CONVEX_SITE_URL}}
    ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-false}
    
    convex_env_set_if_missing BETTER_AUTH_SECRET       "$BETTER_AUTH_SECRET"
    convex_env_set_if_missing JWT_SECRET               "$JWT_SECRET"
    convex_env_set SITE_URL                 "$SITE_URL" > /dev/null
    convex_env_set API_URL                  "$API_URL" > /dev/null
    convex_env_set CONVEX_SITE_INTERNAL_URL      "$CONVEX_SITE_INTERNAL_URL" > /dev/null
    convex_env_set ALLOW_REGISTRATION       "$ALLOW_REGISTRATION" > /dev/null
    
    
    sleep 1
    echo -e "${GREEN}Convex environment synced successfully!${NC}"
}

show_banner
echo -e "${BOLD}What would you like to do?${NC}\n"
echo -e "  [${CYAN}1${NC}] Sync Convex environment variables from .env files"
echo -e "  [${CYAN}q${NC}] Quit\n"

read -p "$(echo -e ${BOLD}"Select an option: "${NC})" CHOICE
echo ""
run_choice "$CHOICE"