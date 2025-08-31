#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"
ADB_HOST="${2:?Se requiere el ADB_HOST del emulador}"
CLIENT="${3:?Debe especificar el cliente (bind, nbch, bpn)}"
APK_VERSION="${4:-}" # Argumento opcional para la versión del APK

# === CONFIGURACIÓN (desde variables de entorno) ===
APK_REGISTRY="${APK_REGISTRY:?Debe definir APK_REGISTRY}"
# APK_PATH ya no es obligatorio si se pasa APK_VERSION
APK_PATH="${APK_PATH:-}"

APPIUM_DIR="${WORKSPACE_DIR}/appium"

header "📦 Descargando e Instalando APK"

# --- Descarga ---

if [[ -n "$APK_VERSION" ]]; then
  info "Usando versión de APK especificada: $APK_VERSION"
  REPO="apks/${CLIENT}/int" # Asume la estructura del repo
  TAG="$APK_VERSION"
else
  if [[ -z "$APK_PATH" ]]; then
    error "Ni APK_VERSION (argumento) ni APK_PATH (entorno) fueron definidos. No se puede continuar."
    exit 1
  fi
  warn "No se especificó versión de APK. Usando APK_PATH de entorno: $APK_PATH"
  TAG=$(echo "$APK_PATH" | cut -d':' -f2)
  REPO=$(echo "$APK_PATH" | cut -d':' -f1)
fi


FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
APK_DOWNLOAD_DIR="${WORKSPACE_DIR}/downloads"

# Limpiar directorio de descargas anterior para evitar errores con oras
rm -rf "$APK_DOWNLOAD_DIR"
mkdir -p "$APK_DOWNLOAD_DIR"

debug "🔗 Descargando APK: $FULL_REF"
# Usamos un subdirectorio temporal para que oras no falle si el directorio principal ya existe
TEMP_DOWNLOAD_SUBDIR="${APK_DOWNLOAD_DIR}/${TAG}/"
mkdir -p "$TEMP_DOWNLOAD_SUBDIR"

if ! oras pull --plain-http "$FULL_REF" -o "$TEMP_DOWNLOAD_SUBDIR"; then
  error "Error al descargar el APK desde $FULL_REF"
  exit 1
fi
APK_FILE="${TEMP_DOWNLOAD_SUBDIR}/apk.apk"
success "APK descargado en ${APK_FILE}"

# --- Instalación ---
success "ADB Host para la instalación: $ADB_HOST"
debug "🔗 Conectando a $ADB_HOST..."
adb connect "$ADB_HOST" > /dev/null

CLIENT_UPPER=$(echo "$CLIENT" | tr 'a-z' 'A-Z')
PACKAGE_NAME=$(grep "APP_PACKAGE_${CLIENT_UPPER}" "${APPIUM_DIR}/.env" | cut -d'=' -f2 | tr -d '')

if [[ -z "$PACKAGE_NAME" ]]; then
    error "No se pudo determinar el PACKAGE_NAME para el cliente $CLIENT"
    exit 1
fi
debug "Package name detectado: $PACKAGE_NAME"

debug "🗑️  Desinstalando APK anterior (si existe)..."
adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || warn "No estaba instalado."

debug "💨 Desactivando animaciones..."
adb -s "$ADB_HOST" shell settings put global window_animation_scale 0
adb -s "$ADB_HOST" shell settings put global transition_animation_scale 0
adb -s "$ADB_HOST" shell settings put global animator_duration_scale 0

debug "📲 Instalando nuevo APK..."
if ! adb -s "$ADB_HOST" install -r "$APK_FILE"; then
    error "Falló la instalación del APK en $ADB_HOST"
    exit 1
fi

success "✅ APK instalado y emulador preparado."

exit 0
