#!/bin/bash
set -e

# Change directory to the script's location (docker directory)
cd "$(dirname "$0")"

# Check for curl
if ! command -v curl &> /dev/null; then
  echo "Error: 'curl' is required but not installed."
  exit 1
fi

echo "Setting up local Docker environment..."

# 1. Create .env if missing
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# Load .env variables (using set -a to export all, handling special chars)
set -a
source .env
set +a

# 2. Start services
echo "Starting services..."
docker compose up -d

# 3. Wait for Convex to be ready (using healthcheck status)
echo "Waiting for Convex backend..."
until [ "$(docker inspect --format='{{.State.Health.Status}}' fleetctrl-convex 2>/dev/null)" == "healthy" ]; do
  echo "  Waiting for Convex to become healthy..."
  sleep 3
done
echo "Convex is healthy!"

# 4. Generate Admin Key
echo "Generating Convex Admin Key..."
# The backend image provides this script to generate a key for the current instance
ADMIN_KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')

if [ -z "$ADMIN_KEY" ]; then
  echo "Failed to generate Admin Key"
  exit 1
fi

echo "Admin Key generated: $ADMIN_KEY"

# Save Admin Key to .env if not present or replace it
if grep -q "CONVEX_DEPLOY_KEY=" .env; then
  # sed -i "s/^CONVEX_DEPLOY_KEY=.*/CONVEX_DEPLOY_KEY=$ADMIN_KEY/" .env
  # For safety, let's just append or inform user. But user asked to write it.
  # Let's use a simpler approach: append it if not present, otherwise warn/replace.
  # Actually, replacing is better for re-runs.
  sed -i "/^CONVEX_DEPLOY_KEY=/d" .env
fi
echo "CONVEX_DEPLOY_KEY=\"$ADMIN_KEY\"" >> .env


# 5. Set Environment Variables on Convex Backend
echo "Setting Convex environment variables..."
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-fleetctrl_secret_123456}
ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}

docker compose exec convex-cli npx convex env set \
  SITE_URL "$SITE_URL" \
  BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET" \
  ALLOW_REGISTRATION "$ALLOW_REGISTRATION" \
  --url "http://convex:3210" \
  --admin-key "$ADMIN_KEY"
# Note: CONVEX_SITE_URL is a built-in that Convex sets automatically

# 6. Deploy Schema
echo "Deploying Convex Schema and Functions..."
# We run the deployment from the convex-cli container which has the source code and dev dependencies
docker compose exec convex-cli npx convex deploy --url "http://convex:3210" --admin-key "$ADMIN_KEY" --yes

echo "---------------------------------------------------"
echo "Setup Complete!"
echo "Hub URL: $SITE_URL (via Proxy)"
echo "Convex API: $NEXT_PUBLIC_CONVEX_URL"
echo "---------------------------------------------------"
