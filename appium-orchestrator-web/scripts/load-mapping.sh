#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
MAPPING_FILE_NAME="${1:?Debe especificar el nombre del archivo de mapping a cargar}"

# === CONFIGURACIÓN ===
# Usar la variable de entorno del proceso padre o un valor por defecto
WIREMOCK_ADMIN_URL="${WIREMOCK_ADMIN_URL:-http://localhost:8081}"
MAPPINGS_DIR="$(dirname "$0")/../wiremock/mappings"
MAPPING_FILE_PATH="${MAPPINGS_DIR}/${MAPPING_FILE_NAME}"

header "📼 Cargando Mapping Específico: ${MAPPING_FILE_NAME}"

# --- 1. Validar que el archivo de mapping existe ---
if [[ ! -f "$MAPPING_FILE_PATH" ]]; then
    error "El archivo de mapping especificado no existe: ${MAPPING_FILE_PATH}"
    exit 1
fi
debug "Archivo de mapping encontrado: ${MAPPING_FILE_PATH}"

# --- 2. Resetear todos los mappings existentes en Wiremock ---
info "Reseteando todos los mappings en Wiremock..."
RESPONSE_BODY_FILE_RESET=$(mktemp)
HTTP_STATUS_RESET=$(curl -k --write-out "%{http_code}" -X POST "${WIREMOCK_ADMIN_URL}/__admin/mappings/reset" -o "$RESPONSE_BODY_FILE_RESET")
RESPONSE_BODY_RESET=$(cat "$RESPONSE_BODY_FILE_RESET")
rm "$RESPONSE_BODY_FILE_RESET"

debug "URL de Reset: ${WIREMOCK_ADMIN_URL}/__admin/mappings/reset"
debug "Status de Reset: ${HTTP_STATUS_RESET}"
debug "Body de Reset: ${RESPONSE_BODY_RESET}"

if [[ "$HTTP_STATUS_RESET" -lt 200 || "$HTTP_STATUS_RESET" -ge 300 ]]; then
    error "Falló el reseteo de mappings en Wiremock. Código de estado: ${HTTP_STATUS_RESET}"
    exit 1
fi
success "Mappings reseteados."

# --- 3. Importar el nuevo mapping ---
info "Importando el mapping ${MAPPING_FILE_NAME}..."

RESPONSE_BODY_FILE_IMPORT=$(mktemp)
HTTP_STATUS_IMPORT=$(curl -k --write-out "%{http_code}" -X POST --data-binary "@${MAPPING_FILE_PATH}" -H "Content-Type: application/json" "${WIREMOCK_ADMIN_URL}/__admin/mappings/import" -o "$RESPONSE_BODY_FILE_IMPORT")
RESPONSE_BODY_IMPORT=$(cat "$RESPONSE_BODY_FILE_IMPORT")
rm "$RESPONSE_BODY_FILE_IMPORT"

debug "URL de Import: ${WIREMOCK_ADMIN_URL}/__admin/mappings/import"
debug "Status de Import: ${HTTP_STATUS_IMPORT}"
debug "Body de Import: ${RESPONSE_BODY_IMPORT}"

if [[ "$HTTP_STATUS_IMPORT" -lt 200 || "$HTTP_STATUS_IMPORT" -ge 300 ]]; then
    error "Falló la importación del mapping ${MAPPING_FILE_NAME} a Wiremock. Código de estado: ${HTTP_STATUS_IMPORT}"
    exit 1
fi

success "✅ Mapping ${MAPPING_FILE_NAME} cargado y listo para el test de verificación."

exit 0