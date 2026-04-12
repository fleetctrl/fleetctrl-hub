#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH" >&2
  exit 1
fi

APP_IMAGE_TAG="${APP_IMAGE_TAG:-fleetctrl-hub:test-build}"
MIGRATION_IMAGE_TAG="${MIGRATION_IMAGE_TAG:-fleetctrl-convex-migration:test-build}"

NEXT_PUBLIC_CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-https://localhost}"
NEXT_PUBLIC_CONVEX_SITE_URL="${NEXT_PUBLIC_CONVEX_SITE_URL:-https://localhost}"
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://localhost}"
NEXT_PUBLIC_ALLOW_REGISTRATION="${NEXT_PUBLIC_ALLOW_REGISTRATION:-true}"
CONVEX_SITE_URL="${CONVEX_SITE_URL:-https://localhost}"

echo "Building app runner image: ${APP_IMAGE_TAG}"
docker build \
  --no-cache \
  --pull \
  --file "${ROOT_DIR}/Dockerfile" \
  --target runner \
  --build-arg "CONVEX_SITE_URL=${CONVEX_SITE_URL}" \
  --build-arg "NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}" \
  --build-arg "NEXT_PUBLIC_CONVEX_SITE_URL=${NEXT_PUBLIC_CONVEX_SITE_URL}" \
  --build-arg "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}" \
  --build-arg "NEXT_PUBLIC_ALLOW_REGISTRATION=${NEXT_PUBLIC_ALLOW_REGISTRATION}" \
  --tag "${APP_IMAGE_TAG}" \
  "${ROOT_DIR}"

echo "Building convex migration image: ${MIGRATION_IMAGE_TAG}"
docker build \
  --no-cache \
  --pull \
  --file "${ROOT_DIR}/Dockerfile.convex-migration" \
  --tag "${MIGRATION_IMAGE_TAG}" \
  "${ROOT_DIR}"

echo "Docker build smoke test passed."