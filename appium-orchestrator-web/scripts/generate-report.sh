#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"

APPIUM_DIR="${WORKSPACE_DIR}/appium"

header "📊 Generando Reporte de Allure Unificado"

if [ -d "${APPIUM_DIR}/allure-results" ] && [ "$(ls -A ${APPIUM_DIR}/allure-results)" ]; then
    debug "Generando reporte desde ${APPIUM_DIR}/allure-results..."
    env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG \
    yarn --cwd "$APPIUM_DIR" allure generate "${APPIUM_DIR}/allure-results" -o "${APPIUM_DIR}/allure-report" --clean
    
    if [ $? -eq 0 ]; then
        success "Reporte de Allure generado en allure-report."
        exit 0
    else
        error "Falló la generación del reporte de Allure."
        exit 1
    fi
else
    warn "No se encontró el directorio allure-results o está vacío. No se generará reporte."
    exit 0 # Salir sin error si no hay nada que reportar
fi
