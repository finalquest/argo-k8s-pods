#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
EMULATOR_ID="${1:?Debe especificar el ID del emulador de Redis}"
ADB_HOST="${2:?Debe especificar el ADB_HOST}"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"

header "ազ Liberando Emulador"

debug "🔌 Desconectando de $ADB_HOST..."
adb disconnect "$ADB_HOST" > /dev/null

if [[ -n "$EMULATOR_ID" ]]; then
    debug "Liberando emulador $EMULATOR_ID en Redis..."
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state idle
    success "Emulador de Redis liberado."
else
    warn "No se proporcionó un EMULATOR_ID, no se puede liberar en Redis."
fi

exit 0
