#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMPOSE_FILE="${ROOT_DIR}/inventory/config/docker-compose.db.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run the inventory database stack" >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" up -d "$@"
