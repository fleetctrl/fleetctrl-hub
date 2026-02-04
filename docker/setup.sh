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

# Cross-platform in-place sed (GNU vs BSD/macOS)
sedi() {
  if sed --version >/dev/null 2>&1; then
    sed -i -e "$1" "${@:2}"
  else
    sed -i '' -e "$1" "${@:2}"
  fi
}

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

echo -e "${BLUE}▶ Starting setup process...${NC}"

# 1. Create .env if missing
if [ ! -f .env ]; then
  echo -e "${BLUE}▶ Creating .env from .env.example...${NC}"
  cp .env.example .env
fi

# 2. Configure Environment
echo -e "${BLUE}▶ Configuring environment...${NC}"

# Ask for ports
echo -e "${YELLOW}⚓ Network Configuration${NC}"
read -p "$(echo -e ${BOLD}"  Enter HTTP Port [80]: "${NC})" PORT_HTTP_INPUT
PROXY_HTTP_PORT=${PORT_HTTP_INPUT:-80}

read -p "$(echo -e ${BOLD}"  Enter HTTPS Port [443]: "${NC})" PORT_HTTPS_INPUT
PROXY_HTTPS_PORT=${PORT_HTTPS_INPUT:-443}

# Ask for Site URL
read -p "$(echo -e ${BOLD}"  Enter Site URL [https://localhost]: "${NC})" SITE_URL_INPUT
SITE_URL=${SITE_URL_INPUT:-https://localhost}
# Derive Convex URLs
# Convex client expects an origin without `/api` and will call `${NEXT_PUBLIC_CONVEX_URL}/api/...`.
NEXT_PUBLIC_CONVEX_URL="${SITE_URL}"
NEXT_PUBLIC_CONVEX_SITE_URL="${SITE_URL}"
CONVEX_SITE_URL="${SITE_URL}"
CONVEX_SITE_INTERNAL_URL="http://convex:3211"

# Ask for Data Directory
echo -e "\n${YELLOW}💾 Storage Configuration${NC}"
read -p "$(echo -e ${BOLD}"  Enter Convex Data Directory [convex-data]: "${NC})" CONVEX_DATA_DIR_INPUT
CONVEX_DATA_DIR=${CONVEX_DATA_DIR_INPUT:-convex-data}

# Ask for rebuild
read -p "$(echo -e ${BOLD}"  Rebuild Docker images? if you changed NEXT_PUBLIC_* env vars [y/N]: "${NC})" REBUILD_INPUT
if [[ "$REBUILD_INPUT" =~ ^[Yy]$ ]]; then
  REBUILD_FLAG="--build"
else
  REBUILD_FLAG=""
fi

# Update values in .env
sedi "s|^SITE_URL=.*|SITE_URL=$SITE_URL|" .env
sedi "s|^NEXT_PUBLIC_CONVEX_URL=.*|NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL|" .env
# Add NEXT_PUBLIC_CONVEX_SITE_URL if missing, otherwise update it
if grep -q "^NEXT_PUBLIC_CONVEX_SITE_URL=" .env; then
  sedi "s|^NEXT_PUBLIC_CONVEX_SITE_URL=.*|NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL|" .env
else
  echo "NEXT_PUBLIC_CONVEX_SITE_URL=$NEXT_PUBLIC_CONVEX_SITE_URL" >> .env
fi
# Add CONVEX_SITE_URL if missing, otherwise update it
if grep -q "^CONVEX_SITE_URL=" .env; then
  sedi "s|^CONVEX_SITE_URL=.*|CONVEX_SITE_URL=$CONVEX_SITE_URL|" .env
else
  echo "CONVEX_SITE_URL=$CONVEX_SITE_URL" >> .env
fi
# Add CONVEX_SITE_INTERNAL_URL if not present, otherwise update it
if grep -q "^CONVEX_SITE_INTERNAL_URL=" .env; then
  sedi "s|^CONVEX_SITE_INTERNAL_URL=.*|CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL|" .env
else
  echo "CONVEX_SITE_INTERNAL_URL=$CONVEX_SITE_INTERNAL_URL" >> .env
fi
# Add API_URL if not present, otherwise update it
if grep -q "^API_URL=" .env; then
  sedi "s|^API_URL=.*|API_URL=${SITE_URL}/api|" .env
else
  echo "API_URL=${SITE_URL}/api" >> .env
fi
sedi "s/^PROXY_HTTP_PORT=.*/PROXY_HTTP_PORT=$PROXY_HTTP_PORT/" .env
sedi "s/^PROXY_HTTPS_PORT=.*/PROXY_HTTPS_PORT=$PROXY_HTTPS_PORT/" .env
sedi "s|^CONVEX_DATA_DIR=.*|CONVEX_DATA_DIR=$CONVEX_DATA_DIR|" .env

# Extract domain from SITE_URL for Caddy (strip protocol and trailing path)
CADDY_DOMAIN=$(echo "$SITE_URL" | sed -E 's|^https?://||' | sed 's|/.*||')
sedi "s/^CADDY_DOMAIN=.*/CADDY_DOMAIN=$CADDY_DOMAIN/" .env

# Ask if running behind external reverse proxy
echo -e "${YELLOW}🔄 Reverse Proxy Configuration${NC}"
echo -e "  ${BOLD}Are you running behind an external reverse proxy?${NC}"
echo -e "  ${CYAN}Yes${NC} = External proxy (e.g., Nginx Proxy Manager, Traefik) handles HTTPS"
echo -e "  ${CYAN}No${NC}  = Caddy handles HTTPS directly"
read -p "$(echo -e ${BOLD}"  Behind reverse proxy? [y/N]: "${NC})" BEHIND_PROXY_INPUT

if [[ "$BEHIND_PROXY_INPUT" =~ ^[Yy]$ ]]; then
  BEHIND_PROXY="true"
  echo -e "  ${GREEN}✓ Configured for external reverse proxy (HTTP only)${NC}"
  # Copy proxy Caddyfile
  cp Caddyfile.proxy Caddyfile
else
  BEHIND_PROXY="false"
  # Copy standalone Caddyfile
  cp Caddyfile.standalone Caddyfile
  
  # Ask if domain is public (for Let's Encrypt) or internal (self-signed certs)
  echo -e "\n${YELLOW}🔒 SSL Configuration${NC}"
  echo -e "  ${BOLD}Is your domain publicly accessible?${NC}"
  echo -e "  ${CYAN}Yes${NC} = Use Let's Encrypt (requires public DNS pointing to this server)"
  echo -e "  ${CYAN}No${NC}  = Use self-signed certificates (for internal/dev environments)"
  read -p "$(echo -e ${BOLD}"  Is domain public? [y/N]: "${NC})" PUBLIC_DOMAIN_INPUT

	  if [[ "$PUBLIC_DOMAIN_INPUT" =~ ^[Yy]$ ]]; then
	    TLS_INTERNAL="false"
	    echo -e "  ${GREEN}✓ Using Let's Encrypt certificates${NC}"
	    # Disable tls internal (comment out)
	    sedi 's/^[[:space:]]*tls internal/    # tls internal/' Caddyfile
	  else
	    TLS_INTERNAL="true"
	    echo -e "  ${GREEN}✓ Using self-signed certificates${NC}"
	    # Enable tls internal (uncomment if commented)
	    sedi 's/^[[:space:]]*#[[:space:]]*tls internal/    tls internal/' Caddyfile
	  fi
	  sedi "s/^TLS_INTERNAL=.*/TLS_INTERNAL=$TLS_INTERNAL/" .env
	fi

# Update BEHIND_PROXY in .env
if grep -q "^BEHIND_PROXY=" .env; then
  sedi "s/^BEHIND_PROXY=.*/BEHIND_PROXY=$BEHIND_PROXY/" .env
else
  echo "BEHIND_PROXY=$BEHIND_PROXY" >> .env
fi

# Generate random BETTER_AUTH_SECRET and JWT_SECRET if they are defaults or missing
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

# 5. Generate Admin Key
echo -e "${BLUE}▶ Generating Convex Admin Key...${NC}"
ADMIN_KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')

if [ -z "$ADMIN_KEY" ]; then
  echo -e "${YELLOW}Failed to generate Admin Key${NC}"
  exit 1
fi

# Save Admin Key to .env
if grep -q "CONVEX_DEPLOY_KEY=" .env; then
  sedi "/^CONVEX_DEPLOY_KEY=/d" .env
fi
echo "CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"" >> .env

# 6. Set Environment Variables on Convex Backend
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

# 7. Deploy Schema
echo -e "${BLUE}▶ Deploying Convex Schema and Functions...${NC}"
docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes > /dev/null

echo -e "\n${GREEN}${BOLD} Setup Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Hub Dashboard: ${NC} ${CYAN}${SITE_URL}${NC}"
echo -e "${BOLD}  Convex API:    ${NC} ${CYAN}${NEXT_PUBLIC_CONVEX_URL}/api${NC}"
echo -e "${BOLD}  HTTP Port:     ${NC} ${YELLOW}${PROXY_HTTP_PORT}${NC}"
if [[ "$BEHIND_PROXY" == "true" ]]; then
  echo -e "${BOLD}  Mode:          ${NC} ${YELLOW}Behind reverse proxy${NC}"
else
  echo -e "${BOLD}  HTTPS Port:    ${NC} ${YELLOW}${PROXY_HTTPS_PORT}${NC}"
fi
echo -e "${BOLD}  Data Dir:      ${NC} ${YELLOW}${CONVEX_DATA_DIR}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Enjoy building with Fleetctrl!${NC}\n"
