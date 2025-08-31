#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

header "🏁 Worker Teardown - Inicio"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"

APPIUM_DIR="${WORKSPACE_DIR}/appium"

header "📊 Generando reporte de Allure unificado..."
if [ -d "${APPIUM_DIR}/allure-results" ] && [ "$(ls -A ${APPIUM_DIR}/allure-results)" ]; then
    env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG \
    yarn --cwd "$APPIUM_DIR" allure generate "${APPIUM_DIR}/allure-results" -o "${APPIUM_DIR}/allure-report" --clean
    success "Reporte de Allure generado en allure-report."
else
    warn "No se encontró el directorio allure-results o está vacío. No se generará reporte."
fi

header "🛑 Limpieza de procesos y recursos"

# Detener el servidor Appium
if [ -f "${WORKSPACE_DIR}/appium.pid" ]; then
    APPIUM_PID=$(cat "${WORKSPACE_DIR}/appium.pid")
    if ps -p $APPIUM_PID > /dev/null;
    then
        debug "🔪 Deteniendo servidor Appium (PID: $APPIUM_PID)..."
        kill $APPIUM_PID
        sleep 2
        success "Servidor Appium detenido."
    else
        warn "El proceso de Appium con PID $APPIUM_PID ya no existía."
    fi
    rm "${WORKSPACE_DIR}/appium.pid"
else
    warn "No se encontró el archivo appium.pid."
fi

# Liberar el emulador en Redis
if [ -f "${WORKSPACE_DIR}/emulator_id.txt" ]; then
    EMULATOR_ID_FROM_REDIS=$(cat "${WORKSPACE_DIR}/emulator_id.txt")
    REDIS_HOST="${RHOST:-redis}"
    REDIS_PORT="${RPORT:-6379}"
    
    if [ -n "$EMULATOR_ID_FROM_REDIS" ]; then
        debug "Liberando emulador $EMULATOR_ID_FROM_REDIS en Redis..."
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID_FROM_REDIS" state idle
        success "Emulador de Redis liberado."
    fi
    rm "${WORKSPACE_DIR}/emulator_id.txt"
fi

# Desconectar ADB
if [ -f "${WORKSPACE_DIR}/adb_host.txt" ]; then
    ADB_HOST=$(cat "${WORKSPACE_DIR}/adb_host.txt")
    if [ -n "$ADB_HOST" ]; then
        debug "🔌 Desconectando de $ADB_HOST..."
        adb disconnect "$ADB_HOST" > /dev/null
        success "ADB desconectado."
    fi
    rm "${WORKSPACE_DIR}/adb_host.txt"
fi

header "✅ Teardown finalizado."
exit 0
