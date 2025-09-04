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

APPIUM_DIR="${WORKSPACE_DIR}/appium"
YARN_FLAG_FILE="${APPIUM_DIR}/.yarn_ok"

# --- Paso 1: Lógica del Repositorio ---
header "🔎 Paso 1: Verificando Repositorio de Appium"

if [ -d "$APPIUM_DIR/.git" ]; then
    success "✅ Repositorio ya existe en ${APPIUM_DIR}. Omitiendo clonado."
    # Opcional: Podríamos añadir 'git pull' aquí en el futuro si es necesario
else
    info "🔧 Repositorio no encontrado. Clonando branch '${APPIUM_BRANCH}'..."
    CLONE_URL=$(echo "$GIT_REPO_URL" | sed "s|://|://${GIT_USER}:${GIT_PAT}@|")
    
    # Limpiar por si quedó algo de una ejecución anterior fallida
    rm -rf "$APPIUM_DIR"
    
    if git clone --depth 1 --branch "$APPIUM_BRANCH" "$CLONE_URL" "$APPIUM_DIR"; then
        success "✅ Repositorio clonado exitosamente."
        # Si clonamos de nuevo, las dependencias viejas no son válidas.
        rm -f "$YARN_FLAG_FILE"
    else
        error "❌ Error al clonar el repositorio."
        exit 1
    fi
fi

# --- Paso 2: Lógica de Dependencias ---
header "📦 Paso 2: Verificando Dependencias (Yarn)"

if [ -f "$YARN_FLAG_FILE" ]; then
    success "✅ Dependencias ya instaladas (encontrado .yarn_ok). Omitiendo instalación."
else
    info "🔧 Instalando dependencias con yarn..."
    # Usamos 'env' para limpiar variables de entorno que puedan interferir con los colores de yarn
    if env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn install --cwd "$APPIUM_DIR"; then
        success "✅ Dependencias instaladas correctamente."
        touch "$YARN_FLAG_FILE"
    else
        error "❌ Error al instalar dependencias en $APPIUM_DIR"
        exit 1
    fi
fi

header "🏁 Workspace para la branch '${APPIUM_BRANCH}' listo en ${APPIUM_DIR}"

exit 0