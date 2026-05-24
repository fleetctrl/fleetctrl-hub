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
        2|seed\ mock\ computers) cmd_seed_mock_computers;;
        3|seed\ mock\ apps) cmd_seed_mock_apps;;
        4|seed\ all\ mock\ data) cmd_seed_all_mock_data;;
        5|reset\ convex\ db) cmd_reset_convex_db;;
        q|Q|quit)
            echo -e "${YELLOW}Bye!${NC}"
            exit 0
        ;;
        *)
            echo -e "${RED}Invalid option '$1'.${NC}"
            echo -e "Usage: $0 [sync convex env|seed mock computers|seed mock apps|seed all mock data|reset convex db|q|quit]"
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

# ─────────────────────────────────────────────────────────
# CMD: Seed mock computers
# ─────────────────────────────────────────────────────────
cmd_seed_mock_computers() {
    show_banner
    echo -e "${GREEN}Seeding mock computers...${NC}"
    echo -e "${BLUE}▶ Adding 500 mock computers to the current Convex deployment.${NC}"

    npx convex run mocks/mockComputers:add '{"confirm":"ADD_MOCK_COMPUTERS","count":500,"replaceExisting":true}'

    echo ""
    echo -e "${GREEN}Mock computers seeded successfully!${NC}"
}

# ─────────────────────────────────────────────────────────
# CMD: Seed mock apps and installs
# ─────────────────────────────────────────────────────────
cmd_seed_mock_apps() {
    show_banner
    echo -e "${GREEN}Seeding mock apps and installs...${NC}"
    echo -e "${BLUE}▶ Adding 12 mock apps and fake installs for existing computers.${NC}"

    npx convex run mocks/mockApps:add '{"confirm":"ADD_MOCK_APPS","appCount":12,"installCoveragePercent":80,"replaceExisting":true}'

    echo ""
    echo -e "${GREEN}Mock apps and installs seeded successfully!${NC}"
}

# ─────────────────────────────────────────────────────────
# CMD: Seed all mock data
# ─────────────────────────────────────────────────────────
cmd_seed_all_mock_data() {
    show_banner
    echo -e "${GREEN}Seeding all mock data...${NC}"
    echo -e "${BLUE}▶ Adding mock computers first, then mock apps and installs.${NC}"

    npx convex run mocks/mockComputers:add '{"confirm":"ADD_MOCK_COMPUTERS","count":500,"replaceExisting":true}'
    npx convex run mocks/mockApps:add '{"confirm":"ADD_MOCK_APPS","appCount":12,"installCoveragePercent":80,"replaceExisting":true}'

    echo ""
    echo -e "${GREEN}All mock data seeded successfully!${NC}"
}

# ─────────────────────────────────────────────────────────
# CMD: Reset Convex database
# ─────────────────────────────────────────────────────────
cmd_reset_convex_db() {
    show_banner
    echo -e "${RED}${BOLD}This will delete all data in the current Convex deployment.${NC}"
    echo -e "${YELLOW}This action uses 'npx convex import --replace-all' and cannot be undone.${NC}"
    echo ""
    read -p "$(echo -e ${BOLD}"Type RESET to continue: "${NC})" CONFIRM

    if [ "$CONFIRM" != "RESET" ]; then
        echo -e "${YELLOW}Reset cancelled.${NC}"
        return
    fi

    local tmp_file
    tmp_file="$(mktemp)"
    printf '[]\n' > "$tmp_file"

    echo -e "${BLUE}▶ Resetting Convex database...${NC}"
    set +e
    npx convex import --table computers --format jsonArray --replace-all --yes "$tmp_file"
    local status=$?
    set -e
    rm -f "$tmp_file"

    if [ "$status" -ne 0 ]; then
        echo -e "${RED}Convex database reset failed.${NC}"
        return "$status"
    fi

    echo ""
    echo -e "${GREEN}Convex database reset successfully!${NC}"
    echo -e "${YELLOW}Existing browser sessions are now invalid. Sign out/in again or clear localhost cookies before using the app.${NC}"
}

if [ "$#" -gt 0 ]; then
    run_choice "$*"
    exit 0
fi

show_banner
echo -e "${BOLD}What would you like to do?${NC}\n"
echo -e "  [${CYAN}1${NC}] Sync Convex environment variables from .env files"
echo -e "  [${CYAN}2${NC}] Seed 500 mock computers"
echo -e "  [${CYAN}3${NC}] Seed 12 mock apps and fake installs"
echo -e "  [${CYAN}4${NC}] Seed all mock data"
echo -e "  [${CYAN}5${NC}] Reset Convex database"
echo -e "  [${CYAN}q${NC}] Quit\n"

read -p "$(echo -e ${BOLD}"Select an option: "${NC})" CHOICE
echo ""
run_choice "$CHOICE"
