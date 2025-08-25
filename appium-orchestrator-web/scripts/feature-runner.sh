#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# Desactivar buffering para que los logs salgan línea por línea en Node.js
export STDBUF_O=0

header "🚀 Appium Feature Runner - Inicio"

# === ARGUMENTOS ===
APPIUM_BRANCH="${1:?Debe especificar la branch}"
CLIENT="${2:?Debe especificar el cliente (bind, nbch, bpn)}"
FEATURE_NAME="${3:?Debe especificar el nombre del feature}"

# === CONFIGURACIÓN (desde variables de entorno) ===
GIT_USER="${GIT_USER:?Debe definir GIT_USER}"
GIT_PAT="${GIT_PAT:?Debe definir GIT_PAT}"
GIT_REPO_URL="${GIT_REPO_URL:?Debe definir GIT_REPO_URL}"

APK_REGISTRY="${APK_REGISTRY:?Debe definir APK_REGISTRY}"
APK_PATH="${APK_PATH:?Debe definir APK_PATH}"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"

BUILD_DIR="/tmp/build-$(date +%s)"
APPIUM_DIR="${BUILD_DIR}/appium"

# Puertos base para Appium y servicios relacionados
PORT_BASE=${PORT_BASE:-4724}
SYS_PORT_BASE=${SYS_PORT_BASE:-8200}
ADB_PORT_BASE=${ADB_PORT_BASE:-5037}

# === INICIO DE EJECUCIÓN ===
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

header "🧹 Paso 1: Clonar y preparar repositorio de Appium"

CLONE_URL=$(echo "$GIT_REPO_URL" | sed "s|://|://${GIT_USER}:${GIT_PAT}@|")

debug "🔧 Clonando branch '${APPIUM_BRANCH}' desde '${GIT_REPO_URL}'"
rm -rf "$APPIUM_DIR"
git clone --depth 1 --branch "$APPIUM_BRANCH" "$CLONE_URL" "$APPIUM_DIR"

debug "📂 Instalando dependencias con yarn..."
yarn install --cwd "$APPIUM_DIR" || {
    error "Error al instalar dependencias en $APPIUM_DIR"
    exit 1
}
success "Repo clonado y dependencias instaladas en $APPIUM_DIR"

header "📦 Paso 2: Descargar APK desde Harbor"

TAG=$(echo "$APK_PATH" | cut -d':' -f2)
REPO=$(echo "$APK_PATH" | cut -d':' -f1)
FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
APK_FILENAME="builds/${TAG}/"

mkdir -p builds

debug "🔗 Descargando APK: $FULL_REF"
oras pull --plain-http "$FULL_REF" -o "$APK_FILENAME" || {
  error "Error al descargar el APK desde $FULL_REF"
  exit 1
}
APK_FILE="${APK_FILENAME}/apk.apk"
success "APK descargado en ${APK_FILE}"

header "🧬 Paso 3: Buscar un emulador 'idle' en Redis"

ADB_HOST=""
EMULATOR_ID=""

mapfile -t EMULATORS < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")

for EMU_KEY in "${EMULATORS[@]}"; do
  STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" state)
  HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" adb_host)
  if [[ "$STATE" == "idle" && -n "$HOST" ]]; then
    debug "   Emulador encontrado: $EMU_KEY ($HOST)"
    ADB_HOST=$HOST
    EMULATOR_ID=$EMU_KEY
    break
  fi
done

if [[ -z "$ADB_HOST" ]]; then
  error "No se encontraron emuladores 'idle' disponibles."
  exit 1
fi

# Marcar el emulador como ocupado en Redis
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state busy
success "Emulador ($ADB_HOST) reservado y marcado como 'busy'."

header "📱 Paso 4: Preparar emulador"

debug "🔗 Conectando a $ADB_HOST..."
adb connect "$ADB_HOST" > /dev/null

PACKAGE_NAME=$(grep "APP_PACKAGE_${CLIENT^^}" "${APPIUM_DIR}/.env" | cut -d'=' -f2 | tr -d '\r')
if [[ -z "$PACKAGE_NAME" ]]; then
    error "No se pudo determinar el PACKAGE_NAME para el cliente $CLIENT"
    exit 1
}
debug "Package name detectado: $PACKAGE_NAME"

debug "🗑️  Desinstalando APK anterior (si existe)..."
adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || warn "No estaba instalado."

debug "📲 Instalando nuevo APK..."
adb -s "$ADB_HOST" install -r "$APK_FILE" || {
    error "Falló la instalación del APK en $ADB_HOST"
    exit 1
}
success "Emulador preparado."

header "🎯 Paso 5: Ejecutar el feature con Appium"

# Calcular puertos únicos para esta ejecución
APPIUM_PORT=$((PORT_BASE + (RANDOM % 100)))
SYSTEM_PORT=$((SYS_PORT_BASE + (RANDOM % 100)))

debug "🚀 Iniciando Appium en puerto ${APPIUM_PORT}..."

# Iniciar Appium en segundo plano
appium --port "$APPIUM_PORT" --base-path /wd/hub --log-timestamp > "appium.log" 2>&1 &
APPIUM_PID=$!

# Esperar a que Appium esté listo
sleep 5

# Crear archivo de configuración de WDIO al vuelo
CONFIG_FILE="wdio.conf.js"
FEATURE_PATH="test/features/${FEATURE_NAME}"

cat > "$CONFIG_FILE" <<- EOM
require('dotenv').config({ path: './.env' });
const { config } = require('./config/wdio.local.shared');

config.hostname = 'localhost';
config.port = ${APPIUM_PORT};
config.path = '/wd/hub';

config.specs = ['./${FEATURE_PATH}'];

config.capabilities = [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': '${ADB_HOST}',
    'appium:systemPort': ${SYSTEM_PORT},
    'appium:appPackage': '${PACKAGE_NAME}',
    'appium:appActivity': 'com.poincenot.doit.MainActivity',
    // ... otras capabilities ...
}];

exports.config = config;
EOM

success "Configuración de WDIO generada para ${FEATURE_NAME}"

debug "🎬 Ejecutando test..."

# Ejecutar WDIO
cd "$APPIUM_DIR"
yarn run wdio "../${CONFIG_FILE}"
EXIT_CODE=$?
cd ..

if [ $EXIT_CODE -ne 0 ]; then
    error "La ejecución de WDIO falló con código de salida $EXIT_CODE"
else
    success "Ejecución de WDIO completada."
fi

header "🛑 Paso 6: Limpieza"

debug "🔪 Deteniendo servidor Appium (PID: $APPIUM_PID)..."
kill $APPIUM_PID
sleep 2

debug "🔌 Desconectando de $ADB_HOST..."
adb disconnect "$ADB_HOST" > /dev/null

# Marcar el emulador como disponible de nuevo
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state idle
success "Emulador ($ADB_HOST) liberado y marcado como 'idle'."

header "✅ Fin de la ejecución."

exit $EXIT_CODE