#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# Desactivar buffering para que los logs salgan línea por línea en Node.js
export STDBUF_O=0

header "🚀 Worker Workspace Setup - Inicio"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"
APPIUM_BRANCH="${2:?Debe especificar la branch}"

# === CONFIGURACIÓN (desde variables de entorno) ===
GIT_USER="${GIT_USER:?Debe definir GIT_USER}"
GIT_PAT="${GIT_PAT:?Debe definir GIT_PAT}"
GIT_REPO_URL="${GIT_REPO_URL:?Debe definir GIT_REPO_URL}"

# === INICIO DE EJECUCIÓN ===
mkdir -p "$WORKSPACE_DIR"
cd "$WORKSPACE_DIR"

header "🧹 Paso 1: Clonar y preparar repositorio de Appium"

CLONE_URL=$(echo "$GIT_REPO_URL" | sed "s|://|://${GIT_USER}:${GIT_PAT}@|")
APPIUM_DIR="${WORKSPACE_DIR}/appium"

debug "🔧 Clonando branch '${APPIUM_BRANCH}' desde '${GIT_REPO_URL}' en ${APPIUM_DIR}"
# Limpiar por si quedó algo de una ejecución anterior fallida
rm -rf "$APPIUM_DIR"
git clone --depth 1 --branch "$APPIUM_BRANCH" "$CLONE_URL" "$APPIUM_DIR"
if [ $? -ne 0 ]; then
    error "Error al clonar el repositorio."
    exit 1
fi

debug "📂 Instalando dependencias con yarn..."
if ! env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn install --cwd "$APPIUM_DIR"; then
    error "Error al instalar dependencias en $APPIUM_DIR"
    exit 1
fi

success "✅ Workspace para la branch '${APPIUM_BRANCH}' creado y listo en ${APPIUM_DIR}"

exit 0
