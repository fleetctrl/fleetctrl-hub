#!/bin/sh
set -eu

REPO_OWNER=${REPO_OWNER:-fleetctrl}
REPO_NAME=${REPO_NAME:-fleetctrl-hub}
REPO_REF=${REPO_REF:-main}
INSTALL_DIR=${INSTALL_DIR:-fleetctrl-hub-docker}
BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_REF}/docker"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' is not installed." >&2
    exit 1
  fi
}

download_file() {
  source_path="$1"
  target_path="$2"

  echo "Downloading ${target_path}..."
  curl -fsSL "${BASE_URL}/${source_path}" -o "${target_path}"
}

require_command curl
require_command chmod
require_command mkdir

if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR" ]; then
  echo "Error: ${INSTALL_DIR} exists and is not a directory." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

download_file "docker-compose.production.yml" "docker-compose.yml"
download_file "manage.sh" "manage.sh"
download_file "Caddyfile.proxy" "Caddyfile.proxy"
download_file "Caddyfile.standalone" "Caddyfile.standalone"
download_file ".env.example" ".env.example"

chmod +x manage.sh

echo "Starting FleetCtrl setup..."
exec ./manage.sh setup