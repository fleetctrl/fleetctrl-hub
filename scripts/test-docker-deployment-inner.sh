#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOCKER_DIR="${ROOT_DIR}/docker"
TMP_ROOT="${ROOT_DIR}/.tmp"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:latest}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH" >&2
  exit 1
fi

mkdir -p "${TMP_ROOT}"

PORT_SEED="$(date +%s)"
PROJECT_NAME="${PROJECT_NAME:-fleetctrl-smoke-${PORT_SEED}-$$}"
DEFAULT_HTTP_PORT=$((20000 + PORT_SEED % 10000))
DEFAULT_HTTPS_PORT=$((30000 + PORT_SEED % 10000))
DEFAULT_RUSTFS_API_PORT=$((40000 + PORT_SEED % 10000))
DEFAULT_RUSTFS_CONSOLE_PORT=$((50000 + PORT_SEED % 10000))
HTTP_PORT="${TEST_DOCKER_HTTP_PORT:-${DEFAULT_HTTP_PORT}}"
HTTPS_PORT="${TEST_DOCKER_HTTPS_PORT:-${DEFAULT_HTTPS_PORT}}"
RUSTFS_API_PORT="${TEST_DOCKER_RUSTFS_API_PORT:-${DEFAULT_RUSTFS_API_PORT}}"
RUSTFS_CONSOLE_PORT="${TEST_DOCKER_RUSTFS_CONSOLE_PORT:-${DEFAULT_RUSTFS_CONSOLE_PORT}}"
BASE_URL="${TEST_DOCKER_BASE_URL:-https://localhost:${HTTPS_PORT}}"

CONVEX_CONTAINER_NAME="${CONVEX_CONTAINER_NAME:-${PROJECT_NAME}-convex}"
HUB_CONTAINER_NAME="${HUB_CONTAINER_NAME:-${PROJECT_NAME}-hub}"
MIGRATION_CONTAINER_NAME="${MIGRATION_CONTAINER_NAME:-${PROJECT_NAME}-convex-migration}"
PROXY_CONTAINER_NAME="${PROXY_CONTAINER_NAME:-${PROJECT_NAME}-proxy}"

RUN_DIR="$(mktemp -d "${TMP_ROOT}/${PROJECT_NAME}.XXXXXX")"
ENV_FILE="${RUN_DIR}/docker.env"
CADDYFILE_PATH="${RUN_DIR}/Caddyfile"
SIGNUP_HEADERS="${RUN_DIR}/signup.headers"
SIGNUP_BODY="${RUN_DIR}/signup.body"
SIGNIN_HEADERS="${RUN_DIR}/signin.headers"
SIGNIN_BODY="${RUN_DIR}/signin.body"
ADMIN_HEADERS="${RUN_DIR}/admin.headers"
ANON_HEADERS="${RUN_DIR}/anon.headers"
PAGE_HEADERS="${RUN_DIR}/page.headers"
PAGE_BODY="${RUN_DIR}/page.body"
COOKIE_JAR="${RUN_DIR}/cookies.txt"

ESC=$(printf '\033')
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
CYAN="${ESC}[36m"
GREEN="${ESC}[32m"

STEP_DEPENDENCIES="[ ]"
STEP_BUILD="[ ]"
STEP_DEPLOY="[ ]"
STEP_SIGNIN_PAGE="[ ]"
STEP_ANON_REDIRECT="[ ]"
STEP_SIGNUP="[ ]"
STEP_SIGNIN="[ ]"
STEP_AUTH_ADMIN="[ ]"

# The ephemeral curl container may run as a non-root user, so make the mounted
# artifact directory writable before using -D/-o with bind-mounted paths.
chmod 0777 "${RUN_DIR}"
touch \
  "${SIGNUP_HEADERS}" \
  "${SIGNUP_BODY}" \
  "${SIGNIN_HEADERS}" \
  "${SIGNIN_BODY}" \
  "${ADMIN_HEADERS}" \
  "${ANON_HEADERS}" \
  "${PAGE_HEADERS}" \
  "${PAGE_BODY}" \
  "${COOKIE_JAR}"
chmod 0666 \
  "${SIGNUP_HEADERS}" \
  "${SIGNUP_BODY}" \
  "${SIGNIN_HEADERS}" \
  "${SIGNIN_BODY}" \
  "${ADMIN_HEADERS}" \
  "${ANON_HEADERS}" \
  "${PAGE_HEADERS}" \
  "${PAGE_BODY}" \
  "${COOKIE_JAR}"

cleanup() {
  exit_code=$?

  if [ "$exit_code" -ne 0 ]; then
    echo "Docker deployment smoke test failed. Printing recent compose state..." >&2
    compose ps || true
    compose logs --tail=200 || true
  fi

  if [ "${KEEP_TEST_ENV:-false}" != "true" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "${RUN_DIR}"
  else
    echo "Keeping test environment because KEEP_TEST_ENV=true" >&2
    echo "Run dir: ${RUN_DIR}" >&2
  fi

  exit "$exit_code"
}
trap cleanup EXIT HUP INT TERM

compose() {
  DOCKER_ENV_FILE="${ENV_FILE}" \
  CADDYFILE_PATH="${CADDYFILE_PATH}" \
  CONVEX_CONTAINER_NAME="${CONVEX_CONTAINER_NAME}" \
  HUB_CONTAINER_NAME="${HUB_CONTAINER_NAME}" \
  MIGRATION_CONTAINER_NAME="${MIGRATION_CONTAINER_NAME}" \
  PROXY_CONTAINER_NAME="${PROXY_CONTAINER_NAME}" \
  docker compose \
    --project-name "${PROJECT_NAME}" \
    --env-file "${ENV_FILE}" \
    -f "${DOCKER_DIR}/docker-compose.yml" \
    "$@"
}

curl_run() {
  docker run --rm \
    --network host \
    -v "${RUN_DIR}:${RUN_DIR}" \
    "${CURL_IMAGE}" \
    "$@"
}

write_env_file() {
  cat > "${ENV_FILE}" <<EOF
CONVEX_URL=http://convex:3210
CONVEX_DATA_DIR=convex-data
NEXT_PUBLIC_CONVEX_URL=${BASE_URL}
NEXT_PUBLIC_CONVEX_SITE_URL=${BASE_URL}
CONVEX_SITE_URL=${BASE_URL}
CONVEX_SITE_INTERNAL_URL=http://convex:3211
SITE_URL=${BASE_URL}
NEXT_PUBLIC_SITE_URL=${BASE_URL}
PROXY_HTTP_PORT=${HTTP_PORT}
PROXY_HTTPS_PORT=${HTTPS_PORT}
RUSTFS_API_PORT=${RUSTFS_API_PORT}
RUSTFS_CONSOLE_PORT=${RUSTFS_CONSOLE_PORT}
CADDY_DOMAIN=localhost
TLS_INTERNAL=true
BEHIND_PROXY=false
BETTER_AUTH_SECRET=test-better-auth-secret-0123456789abcdef
JWT_SECRET=test-jwt-secret-0123456789abcdef
API_URL=${BASE_URL}/api
ALLOW_REGISTRATION=true
NEXT_PUBLIC_ALLOW_REGISTRATION=true
CONVEX_DEPLOY_KEY=placeholder-admin-key
POSTGRES_PASSWORD=test-postgres-password
POSTGRES_DATA_DIR=postgres_data
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=rustfs-secret-key
RUSTFS_SERVER_DOMAINS=localhost,rustfs
RUSTFS_DATA_DIR=rustfs-data
RUSTFS_CONSOLE_ENABLE=true
EOF
}

copy_caddyfile() {
  cp "${DOCKER_DIR}/Caddyfile.standalone" "${CADDYFILE_PATH}"
}

wait_for_health() {
  container_name="$1"
  label="$2"

  for _ in $(seq 1 90); do
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_name}" 2>/dev/null || true)"
    if [ "${status}" = "healthy" ]; then
      return 0
    fi
    sleep 2
  done

  echo "${label} did not become healthy in time" >&2
  return 1
}

wait_for_https() {
  for _ in $(seq 1 90); do
    if curl_run -ksS -o /dev/null "${BASE_URL}/sign-in" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Proxy did not start responding on ${BASE_URL}" >&2
  return 1
}

generate_admin_key() {
  compose exec -T convex ./generate_admin_key.sh \
    | tr -d '\r' \
    | awk '/^convex-self-hosted\|/ { key=$0 } END { print key }'
}

set_convex_env() {
  assignment="$1"
  compose run --rm --no-deps convex-migration \
    npx convex env set "${assignment}" \
    --url "http://convex:3210" \
    --admin-key "${ADMIN_KEY}" >/dev/null
}

deploy_convex() {
  compose run --rm --no-deps convex-migration \
    npx convex deploy \
    --url "http://convex:3210" \
    --admin-key "${ADMIN_KEY}" \
    --yes >/dev/null
}

assert_http_code() {
  actual="$1"
  expected="$2"
  label="$3"

  if [ "${actual}" != "${expected}" ]; then
    echo "${label} returned HTTP ${actual}, expected ${expected}" >&2
    return 1
  fi
}

assert_contains() {
  file_path="$1"
  pattern="$2"
  label="$3"

  if ! grep -qi "${pattern}" "${file_path}"; then
    echo "${label} did not contain expected pattern: ${pattern}" >&2
    return 1
  fi
}

print_success_summary() {
  printf '\n'
  printf '%s+======================================================+%s\n' "${CYAN}${BOLD}" "${RESET}"
  printf '%s|           FleetCtrl Docker Smoke Test Passed         |%s\n' "${CYAN}${BOLD}" "${RESET}"
  printf '%s+======================================================+%s\n' "${CYAN}${BOLD}" "${RESET}"
  printf '%s  ____ _               _      ____ _        _        %s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '%s / ___| |__   ___  ___| | __ / ___| |_ __ _| |_ _   _%s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '%s| |   | ._ \\ / _ \\/ __| |/ /| |   | __/ _` | __| | | |%s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '%s| |___| | | |  __/ (__|   < | |___| || (_| | |_| |_| |%s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '%s \\____|_| |_|\\___|\\___|_|\\_\\ \\____|\\__\\__,_|\\__|\\__, |%s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '%s                                                    |___/ %s\n' "${GREEN}${BOLD}" "${RESET}"
  printf '\n'
  printf '%sSummary%s\n' "${BOLD}" "${RESET}"
  printf '  %sProject:%s %s\n' "${DIM}" "${RESET}" "${PROJECT_NAME}"
  printf '  %sBase URL:%s %s\n' "${DIM}" "${RESET}" "${BASE_URL}"
  printf '  %sTest user:%s %s\n' "${DIM}" "${RESET}" "${TEST_EMAIL}"
  printf '\n'
  printf '%sChecklist%s\n' "${BOLD}" "${RESET}"
  printf '  %s %s Convex dependencies started\n' "${GREEN}" "${STEP_DEPENDENCIES}${RESET}"
  printf '  %s %s Hub and migration images built\n' "${GREEN}" "${STEP_BUILD}${RESET}"
  printf '  %s %s Convex environment synced and deployed\n' "${GREEN}" "${STEP_DEPLOY}${RESET}"
  printf '  %s %s Public sign-in page reachable\n' "${GREEN}" "${STEP_SIGNIN_PAGE}${RESET}"
  printf '  %s %s Anonymous access redirected\n' "${GREEN}" "${STEP_ANON_REDIRECT}${RESET}"
  printf '  %s %s User registration works\n' "${GREEN}" "${STEP_SIGNUP}${RESET}"
  printf '  %s %s Sign-in persists session cookie\n' "${GREEN}" "${STEP_SIGNIN}${RESET}"
  printf '  %s %s Authenticated admin access works\n' "${GREEN}" "${STEP_AUTH_ADMIN}${RESET}"
  printf '\n'
}

write_env_file
copy_caddyfile

echo "Starting Convex dependencies for Docker deployment smoke test..."
compose up -d rustfs rustfs-init convex
wait_for_health "${CONVEX_CONTAINER_NAME}" "Convex backend"
STEP_DEPENDENCIES="[x]"

ADMIN_KEY="$(generate_admin_key)"
if [ -z "${ADMIN_KEY}" ]; then
  echo "Failed to generate a Convex admin key" >&2
  exit 1
fi
sed -i "s/^CONVEX_DEPLOY_KEY=.*/CONVEX_DEPLOY_KEY=${ADMIN_KEY}/" "${ENV_FILE}"

echo "Building and starting the remaining Docker deployment services..."
compose build hub convex-migration
compose up -d hub proxy
STEP_BUILD="[x]"

echo "Syncing Convex environment and deploying functions..."
set_convex_env "SITE_URL=${BASE_URL}"
set_convex_env "BETTER_AUTH_SECRET=test-better-auth-secret-0123456789abcdef"
set_convex_env "JWT_SECRET=test-jwt-secret-0123456789abcdef"
set_convex_env "API_URL=${BASE_URL}/api"
set_convex_env "ALLOW_REGISTRATION=true"
set_convex_env "CONVEX_SITE_INTERNAL_URL=http://127.0.0.1:3211"
deploy_convex
STEP_DEPLOY="[x]"

wait_for_https

echo "Checking public sign-in page..."
page_code="$(curl_run -ksS -D "${PAGE_HEADERS}" -o "${PAGE_BODY}" -w '%{http_code}' "${BASE_URL}/sign-in")"
assert_http_code "${page_code}" "200" "Sign-in page"
assert_contains "${PAGE_HEADERS}" "content-type: text/html" "Sign-in response headers"
STEP_SIGNIN_PAGE="[x]"

echo "Checking anonymous access redirects away from protected routes..."
anon_code="$(curl_run -ksS -D "${ANON_HEADERS}" -o /dev/null -w '%{http_code}' "${BASE_URL}/admin")"
if [ "${anon_code}" != "302" ] && [ "${anon_code}" != "303" ] && [ "${anon_code}" != "307" ]; then
  echo "Anonymous access to /admin should redirect, got HTTP ${anon_code}" >&2
  exit 1
fi
assert_contains "${ANON_HEADERS}" "sign-in" "Anonymous admin redirect"
STEP_ANON_REDIRECT="[x]"

TEST_EMAIL="docker-smoke-${PROJECT_NAME}@example.com"
TEST_PASSWORD='smoke-test-password'

echo "Creating a user through the deployed auth endpoint..."
signup_code="$(curl_run -ksS \
  -D "${SIGNUP_HEADERS}" \
  -o "${SIGNUP_BODY}" \
  -H "Content-Type: application/json" \
  -H "Origin: ${BASE_URL}" \
  --data "{\"name\":\"Docker Smoke\",\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
  -w '%{http_code}' \
  "${BASE_URL}/auth/sign-up/email")"
assert_http_code "${signup_code}" "200" "Sign-up request"
assert_contains "${SIGNUP_BODY}" "\"user\"" "Sign-up response"
assert_contains "${SIGNUP_BODY}" "${TEST_EMAIL}" "Sign-up response"
STEP_SIGNUP="[x]"

echo "Signing in with the created user..."
signin_code="$(curl_run -ksS \
  -c "${COOKIE_JAR}" \
  -D "${SIGNIN_HEADERS}" \
  -o "${SIGNIN_BODY}" \
  -H "Content-Type: application/json" \
  -H "Origin: ${BASE_URL}" \
  --data "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
  -w '%{http_code}' \
  "${BASE_URL}/auth/sign-in/email")"
assert_http_code "${signin_code}" "200" "Sign-in request"
assert_contains "${SIGNIN_BODY}" "\"user\"" "Sign-in response"

if ! grep -Fq 'better-auth.session_token' "${COOKIE_JAR}"; then
  echo "Sign-in response did not persist a Better Auth session cookie" >&2
  exit 1
fi
STEP_SIGNIN="[x]"

echo "Checking authenticated access to protected routes..."
admin_code="$(curl_run -ksS \
  -b "${COOKIE_JAR}" \
  -D "${ADMIN_HEADERS}" \
  -o /dev/null \
  -H "Origin: ${BASE_URL}" \
  -w '%{http_code}' \
  "${BASE_URL}/admin")"
assert_http_code "${admin_code}" "200" "Authenticated admin request"
STEP_AUTH_ADMIN="[x]"

print_success_summary