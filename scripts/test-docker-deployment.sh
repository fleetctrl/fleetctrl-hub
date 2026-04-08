#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_COMPOSE_FILE="${ROOT_DIR}/docker/docker-compose.smoke.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH" >&2
  exit 1
fi

RUNNER_PROJECT_NAME="${RUNNER_PROJECT_NAME:-fleetctrl-smoke-runner-$RANDOM}"
INNER_PROJECT_NAME="${PROJECT_NAME:-fleetctrl-smoke-$RANDOM}"

compose() {
  PROJECT_NAME="${INNER_PROJECT_NAME}" \
  KEEP_TEST_ENV="${KEEP_TEST_ENV:-false}" \
  TEST_DOCKER_HTTP_PORT="${TEST_DOCKER_HTTP_PORT:-18080}" \
  TEST_DOCKER_HTTPS_PORT="${TEST_DOCKER_HTTPS_PORT:-18443}" \
  TEST_DOCKER_RUSTFS_API_PORT="${TEST_DOCKER_RUSTFS_API_PORT:-19000}" \
  TEST_DOCKER_RUSTFS_CONSOLE_PORT="${TEST_DOCKER_RUSTFS_CONSOLE_PORT:-19001}" \
  TEST_DOCKER_BASE_URL="${TEST_DOCKER_BASE_URL:-https://localhost:${TEST_DOCKER_HTTPS_PORT:-18443}}" \
  docker compose \
    --project-name "${RUNNER_PROJECT_NAME}" \
    -f "${SMOKE_COMPOSE_FILE}" \
    "$@"
}

cleanup() {
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo "Nested Docker Compose smoke runner failed. Printing runner state..." >&2
    compose ps || true
    compose logs --tail=200 || true
  fi

  if [[ "${KEEP_TEST_ENV:-false}" != "true" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "Keeping nested Docker Compose runner because KEEP_TEST_ENV=true" >&2
    echo "Runner project: ${RUNNER_PROJECT_NAME}" >&2
    echo "Inner project: ${INNER_PROJECT_NAME}" >&2
  fi

  exit "$exit_code"
}
trap cleanup EXIT

echo "Starting nested Docker Compose smoke runner..."
compose up --abort-on-container-exit --exit-code-from smoke-test smoke-test