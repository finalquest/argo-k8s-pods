#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-keycloak}"
SECRET_NAME="${SECRET_NAME:-keycloak-db}"
LABEL_SELECTOR="${LABEL_SELECTOR:-app=keycloak-postgres}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

read_secret() {
  local key="$1"
  kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o "jsonpath={.data.$key}" | base64 --decode
}

POSTGRES_DB="${POSTGRES_DB:-$(read_secret POSTGRES_DB)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_secret POSTGRES_USER)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(read_secret POSTGRES_PASSWORD)}"

POD="$(kubectl -n "$NAMESPACE" get pod -l "$LABEL_SELECTOR" -o jsonpath='{.items[0].metadata.name}')"

mkdir -p "$BACKUP_DIR"
OUTPUT_FILE="${BACKUP_DIR}/keycloak-db-${TIMESTAMP}.sql"

echo "Dumping database '$POSTGRES_DB' from pod $POD into $OUTPUT_FILE"
kubectl -n "$NAMESPACE" exec "$POD" -- env PGPASSWORD="$POSTGRES_PASSWORD" \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$OUTPUT_FILE"

echo "Backup completed."
