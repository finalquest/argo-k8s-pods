#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"
ADB_HOST="${2:?Se requiere el ADB_HOST del emulador}"
CLIENT="${3:?Debe especificar el cliente (bind, nbch, bpn)}"
APK_VERSION="${4:-}" # Argumento opcional para la versión del APK
LOCAL_APK_PATH="${5:-}" # Argumento opcional para la ruta a un APK local

# === CONFIGURACIÓN (desde variables de entorno) ===
APK_REGISTRY="${APK_REGISTRY:-}" # Opcional si se usa APK local
APK_PATH="${APK_PATH:-}"

APPIUM_DIR="${WORKSPACE_DIR}/appium"

header "📦 Descargando e Instalando APK"

APK_DOWNLOAD_DIR="${WORKSPACE_DIR}/downloads"
mkdir -p "$APK_DOWNLOAD_DIR"
APK_FILE="${APK_DOWNLOAD_DIR}/apk.apk"

# --- Lógica de obtención de APK ---

# Prioridad 1: Usar la ruta al APK local si se proporciona
if [[ -n "$LOCAL_APK_PATH" ]]; then
  info "Usando APK local desde la ruta: ${LOCAL_APK_PATH}"
  if [[ ! -f "$LOCAL_APK_PATH" ]]; then
    error "El archivo APK especificado en LOCAL_APK_PATH no existe: ${LOCAL_APK_PATH}"
    exit 1
  fi
  cp "$LOCAL_APK_PATH" "$APK_FILE"
  success "APK local copiado a ${APK_FILE}"

# Prioridad 2: Usar la versión de ORAS si se proporciona
elif [[ -n "$APK_VERSION" ]]; then
  info "Usando versión de APK de ORAS: $APK_VERSION"
  if [[ -z "$APK_REGISTRY" ]]; then
    error "Se especificó una versión de APK pero no se definió APK_REGISTRY en el entorno."
    exit 1
  fi
  REPO="apks/${CLIENT}/int" # Asume la estructura del repo
  TAG="$APK_VERSION"
  FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
  
  debug "🔗 Descargando APK: $FULL_REF"
  if ! oras pull --plain-http "$FULL_REF" -o "$APK_DOWNLOAD_DIR"; then
    error "Error al descargar el APK desde $FULL_REF"
    exit 1
  fi
  # oras descarga con un nombre aleatorio, lo movemos al nombre esperado
  DOWNLOADED_FILE=$(find "$APK_DOWNLOAD_DIR" -type f -name "*.apk")
  if [[ -n "$DOWNLOADED_FILE" ]]; then
    mv "$DOWNLOADED_FILE" "$APK_FILE"
  else
    error "No se encontró el archivo .apk descargado por oras."
    exit 1
  fi
  success "APK de ORAS descargado en ${APK_FILE}"

# Prioridad 3: Usar la variable de entorno APK_PATH como último recurso
elif [[ -n "$APK_PATH" ]]; then
  warn "Usando APK_PATH de entorno (legacy): $APK_PATH"
  if [[ -z "$APK_REGISTRY" ]]; then
    error "Se especificó APK_PATH pero no se definió APK_REGISTRY en el entorno."
    exit 1
  fi
  TAG=$(echo "$APK_PATH" | cut -d':' -f2)
  REPO=$(echo "$APK_PATH" | cut -d':' -f1)
  FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"

  debug "🔗 Descargando APK: $FULL_REF"
  if ! oras pull --plain-http "$FULL_REF" -o "$APK_DOWNLOAD_DIR"; then
    error "Error al descargar el APK desde $FULL_REF"
    exit 1
  fi
  DOWNLOADED_FILE=$(find "$APK_DOWNLOAD_DIR" -type f -name "*.apk")
  if [[ -n "$DOWNLOADED_FILE" ]]; then
    mv "$DOWNLOADED_FILE" "$APK_FILE"
  else
    error "No se encontró el archivo .apk descargado por oras."
    exit 1
  fi
  success "APK de ORAS (legacy) descargado en ${APK_FILE}"

else
  error "No se especificó un método para obtener el APK (ni ruta local, ni versión, ni APK_PATH)."
  exit 1
fi

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
