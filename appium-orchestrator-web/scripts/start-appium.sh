#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"

# Puertos base para Appium y servicios relacionados
PORT_BASE=${PORT_BASE:-4724}

APPIUM_DIR="${WORKSPACE_DIR}/appium"

# Calcular puertos únicos para esta ejecución
APPIUM_PORT=$((PORT_BASE + (RANDOM % 100)))

header "🚀 Iniciando Appium de Larga Duración"

debug "Iniciando Appium en puerto ${APPIUM_PORT}..."

# Iniciar Appium en segundo plano
env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn --cwd "$APPIUM_DIR" run appium --port "$APPIUM_PORT" --base-path /wd/hub --log-timestamp > "${WORKSPACE_DIR}/appium.log" 2>&1 &
APPIUM_PID=$!

# Esperar un poco para que el servidor inicie
sleep 8

if ps -p $APPIUM_PID > /dev/null; then
    success "Servidor Appium iniciado con PID ${APPIUM_PID} en el puerto ${APPIUM_PORT}"
    # Devolver el PID y el Puerto para que el worker los capture
    echo "APPIUM_PID=${APPIUM_PID}"
    echo "APPIUM_PORT=${APPIUM_PORT}"
else
    error "Falló el inicio del servidor Appium. Revisa los logs en ${WORKSPACE_DIR}/appium.log"
    exit 1
fi

exit 0
