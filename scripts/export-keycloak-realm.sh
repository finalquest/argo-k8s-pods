#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-keycloak}"
ADMIN_SECRET="${ADMIN_SECRET:-keycloak-admin}"
REALM="${REALM:-homelab}"
LABEL_SELECTOR="${LABEL_SELECTOR:-app=keycloak}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

ADMIN_USER="${KEYCLOAK_ADMIN:-$(kubectl -n "$NAMESPACE" get secret "$ADMIN_SECRET" -o 'jsonpath={.data.KEYCLOAK_ADMIN}' | base64 --decode)}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(kubectl -n "$NAMESPACE" get secret "$ADMIN_SECRET" -o 'jsonpath={.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 --decode)}"

POD="$(kubectl -n "$NAMESPACE" get pod -l "$LABEL_SELECTOR" -o jsonpath='{.items[0].metadata.name}')"

mkdir -p "$BACKUP_DIR"
OUTPUT_FILE="${BACKUP_DIR}/keycloak-realm-${REALM}-${TIMESTAMP}.json"

printf -v ADMIN_PASSWORD_ESC '%q' "$ADMIN_PASSWORD"
KC_CMD="set -euo pipefail
/opt/keycloak/bin/kcadm.sh config credentials --server http://127.0.0.1:8080 --realm master --user '$ADMIN_USER' --password $ADMIN_PASSWORD_ESC >/tmp/kcadm.$REALM.log
/opt/keycloak/bin/kcadm.sh get realms/$REALM"

echo "Exporting realm '$REALM' from pod $POD into $OUTPUT_FILE"
kubectl -n "$NAMESPACE" exec "$POD" -- /bin/sh -c "$KC_CMD" > "$OUTPUT_FILE"

echo "Realm export completed."
