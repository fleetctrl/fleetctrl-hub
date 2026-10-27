#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH" >&2
  exit 1
fi

APP_IMAGE_TAG="${APP_IMAGE_TAG:-fleetctrl-hub:test-build}"
API_IMAGE_TAG="${API_IMAGE_TAG:-fleetctrl-api:test-build}"

echo "Building app runner image: ${APP_IMAGE_TAG}"
docker build \
  --no-cache \
  --pull \
  --file "${ROOT_DIR}/Dockerfile" \
  --target runner \
  --tag "${APP_IMAGE_TAG}" \
  "${ROOT_DIR}"

echo "Building API image: ${API_IMAGE_TAG}"
docker build \
  --no-cache \
  --pull \
  --file "${ROOT_DIR}/Dockerfile.api" \
  --tag "${API_IMAGE_TAG}" \
  "${ROOT_DIR}"

echo "Docker build smoke test passed."
