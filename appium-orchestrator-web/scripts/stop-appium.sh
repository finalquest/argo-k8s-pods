#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
APPIUM_PID="${1:?Debe especificar el PID del proceso de Appium}"

header "🛑 Deteniendo Servidor Appium"

if ps -p $APPIUM_PID > /dev/null; then
    debug "Deteniendo servidor Appium (PID: $APPIUM_PID)..."
    kill $APPIUM_PID
    sleep 2
    success "Servidor Appium detenido."
else
    warn "El proceso de Appium con PID ${APPIUM_PID} no fue encontrado. Puede que ya haya terminado."
fi

exit 0
