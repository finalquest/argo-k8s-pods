#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"

# Variable de override para entorno local
LOCAL_ADB_HOST="${LOCAL_ADB_HOST:-}"

header "🔎 Buscando y Bloqueando Emulador"

# Si se define LOCAL_ADB_HOST, se salta toda la lógica de Redis
if [[ -n "$LOCAL_ADB_HOST" ]]; then
    warn "Se usará el ADB host local definido en LOCAL_ADB_HOST: ${LOCAL_ADB_HOST}"
    # Devolver el host local y un ID de emulador vacío
    echo "EMULATOR_ID="
    echo "ADB_HOST=${LOCAL_ADB_HOST}"
    exit 0
fi


debug "Buscando un emulador 'idle' en Redis..."

EMULATOR_ID=""
ADB_HOST=""

# Intentar durante 60 segundos encontrar un emulador
for i in {1..12}; do
    # Validar conexión a Redis primero
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING > /dev/null 2>&1; then
        error "No se pudo conectar a Redis en ${REDIS_HOST}:${REDIS_PORT}. Si es un entorno local, defina LOCAL_ADB_HOST."
        exit 1
    fi

    EMULATORS=()
    while IFS= read -r line; do
        EMULATORS+=("$line")
    done < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")

    for EMU_KEY in "${EMULATORS[@]}"; do
      STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" state)
      HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" adb_host)
      if [[ "$STATE" == "idle" && -n "$HOST" ]]; then
        ADB_HOST=$HOST
        EMULATOR_ID=$EMU_KEY
        break 2
      fi
    done
    debug "No se encontró emulador... reintentando en 5 segundos."
    sleep 5
done

if [[ -z "$EMULATOR_ID" ]]; then
    error "No se encontró ningún emulador 'idle' disponible después de 60 segundos."
    exit 1
fi

success "Emulador encontrado: ${EMULATOR_ID} en ${ADB_HOST}"
debug "Marcando ${EMULATOR_ID} como 'busy' en Redis..."

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state busy

# Devolver el ID y el Host para que el worker los capture
echo "EMULATOR_ID=${EMULATOR_ID}"
echo "ADB_HOST=${ADB_HOST}"

exit 0
