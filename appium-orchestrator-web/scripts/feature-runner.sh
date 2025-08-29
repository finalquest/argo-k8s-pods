#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# Desactivar buffering para que los logs salgan línea por línea en Node.js
export STDBUF_O=0

header "🚀 Appium Feature Runner - Inicio"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"
APPIUM_BRANCH="${2:?Debe especificar la branch}"
CLIENT="${3:?Debe especificar el cliente (bind, nbch, bpn)}"
FEATURE_NAME="${4:?Debe especificar el nombre del feature}"

# === CONFIGURACIÓN (desde variables de entorno) ===
APK_REGISTRY="${APK_REGISTRY:?Debe definir APK_REGISTRY}"
APK_PATH="${APK_PATH:?Debe definir APK_PATH}"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"

# Variable opcional para override local
LOCAL_ADB_HOST="${LOCAL_ADB_HOST:-}"

APPIUM_DIR="${WORKSPACE_DIR}/appium"

# Puertos base para Appium y servicios relacionados
PORT_BASE=${PORT_BASE:-4724}
SYS_PORT_BASE=${SYS_PORT_BASE:-8200}

# === INICIO DE EJECUCIÓN ===
cd "$WORKSPACE_DIR"

header "🔎 Paso 1: Validar Workspace"

# Validar que el directorio de Appium existe
if [ ! -d "$APPIUM_DIR" ]; then
    error "El directorio de trabajo de Appium no existe: $APPIUM_DIR"
    error "Asegúrate de que el script 'setup-workspace.sh' se haya ejecutado correctamente."
    exit 1
fi

success "Workspace validado en $APPIUM_DIR"


header "📦 Paso 2: Descargar APK desde Harbor"

TAG=$(echo "$APK_PATH" | cut -d':' -f2)
REPO=$(echo "$APK_PATH" | cut -d':' -f1)
FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
# Usamos un subdirectorio dentro del workspace para los APKs
APK_DOWNLOAD_DIR="${WORKSPACE_DIR}/downloads"
APK_FILENAME="${APK_DOWNLOAD_DIR}/${TAG}/"

mkdir -p "$APK_DOWNLOAD_DIR"

debug "🔗 Descargando APK: $FULL_REF"
if ! oras pull --plain-http "$FULL_REF" -o "$APK_FILENAME"; then
  error "Error al descargar el APK desde $FULL_REF"
  exit 1
fi
APK_FILE="${APK_FILENAME}/apk.apk"
success "APK descargado en ${APK_FILE}"

header "🧬 Paso 3: Validar Redis y Determinar ADB Host"

# Siempre intentar buscar en Redis para validar la conexión
debug "Buscando un emulador 'idle' en Redis para validación..."
REDIS_ADB_HOST=""
EMULATOR_ID_FROM_REDIS=""

EMULATORS=()
while IFS= read -r line; do
    EMULATORS+=("$line")
done < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")

for EMU_KEY in "${EMULATORS[@]}"; do
  STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" state)
  HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU_KEY" adb_host)
  if [[ "$STATE" == "idle" && -n "$HOST" ]]; then
    REDIS_ADB_HOST=$HOST
    EMULATOR_ID_FROM_REDIS=$EMU_KEY
    break
  fi
done

if [[ -z "$REDIS_ADB_HOST" ]]; then
    warn "Validación Redis: No se encontraron emuladores 'idle' disponibles."
else
    success "Validación Redis: Se encontró el emulador $EMULATOR_ID_FROM_REDIS en $REDIS_ADB_HOST."
fi

# Ahora, decidir qué host usar para la ejecución real
ADB_HOST=""
if [[ -n "$LOCAL_ADB_HOST" ]]; then
    warn "Se usará el ADB host local definido en la variable de entorno LOCAL_ADB_HOST."
    ADB_HOST="$LOCAL_ADB_HOST"
else
    debug "Se usará el ADB host encontrado en Redis."
    if [[ -z "$REDIS_ADB_HOST" ]]; then
        error "No hay un host de Redis disponible y no se ha definido un LOCAL_ADB_HOST."
        exit 1
    fi
    ADB_HOST="$REDIS_ADB_HOST"
    
    # Solo marcar como ocupado si vamos a usar el emulador de Redis
    debug "Marcando $EMULATOR_ID_FROM_REDIS como 'busy' en Redis..."
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID_FROM_REDIS" state busy
fi

success "ADB Host para la ejecución: $ADB_HOST"

header "📱 Paso 4: Preparar emulador"

debug "🔗 Conectando a $ADB_HOST..."
adb connect "$ADB_HOST" > /dev/null

# Convertir cliente a mayúsculas de forma portable
CLIENT_UPPER=$(echo "$CLIENT" | tr 'a-z' 'A-Z')
PACKAGE_NAME=$(grep "APP_PACKAGE_${CLIENT_UPPER}" "${APPIUM_DIR}/.env" | cut -d'=' -f2 | tr -d '\r')
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
success "Emulador preparado."

header "🎯 Paso 5: Ejecutar el feature con Appium"

# Calcular puertos únicos para esta ejecución
APPIUM_PORT=$((PORT_BASE + (RANDOM % 100)))
SYSTEM_PORT=$((SYS_PORT_BASE + (RANDOM % 100)))

debug "🚀 Iniciando Appium en puerto ${APPIUM_PORT}..."

# Iniciar Appium en segundo plano
env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn --cwd "$APPIUM_DIR" run appium --port "$APPIUM_PORT" --base-path /wd/hub --log-timestamp > "appium.log" 2>&1 &
APPIUM_PID=$!

# Esperar a que Appium esté listo
sleep 5

# Crear archivo de configuración de WDIO al vuelo
CONFIG_FILE="${APPIUM_DIR}/config/wdio.conf.ts"

cat > "$CONFIG_FILE" <<- EOM
import { config } from './wdio.local.shared';

config.hostname = 'localhost';
config.port = ${APPIUM_PORT};
config.path = '/wd/hub';

config.capabilities = [{
    "appium:waitForIdleTimeout": 300,
    "appium:allowDelayAdb": true,
    "appium:isHeadless": true,
    platformName: 'Android',
     "appium:deviceReadyTimeout": 60000,
    "appium:androidInstallTimeout": 90000,
     "appium:ignoreHiddenApiPolicyError": true,
    "appium:avdReadyTimeout": 180000,
    "appium:skipDeviceInitialization": false,
    "appium:automationName": 'UiAutomator2',
    'appium:udid': '${ADB_HOST}',
    'appium:systemPort': ${SYSTEM_PORT},
    'appium:appPackage': ${PACKAGE_NAME},
    'appium:appActivity': 'com.poincenot.doit.MainActivity',
    'appium:noReset': false,
    'appium:adbExecTimeout': 120000,
    'appium:uiautomator2ServerLaunchTimeout': 120000,
    'appium:disableWindowAnimation': true,
    'appium:skipLogcatCapture': true,
    'appium:autoAcceptAlerts': true,
    'appium:autoDismissAlerts': true,
    "appium:unicodeKeyboard": true,
    "appium:resetKeyboard": true,
    "appium:autoGrantPermissions": true,
    "appium:hideKeyboard": true
}];

export { config };
EOM

success "Configuración de WDIO generada para ${FEATURE_NAME}"

debug "🎬 Ejecutando test..."

# Ejecutar WDIO
cd "$APPIUM_DIR"
FEATURE_ARG="${CLIENT}/feature/${FEATURE_NAME}"
if ! env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn run env-cmd -f ./.env -- wdio "${CONFIG_FILE}" "${FEATURE_ARG}"; then
    EXIT_CODE=$?
    error "La ejecución de WDIO falló con código de salida $EXIT_CODE"
else
    EXIT_CODE=0
    success "Ejecución de WDIO completada."
fi

header "📊 Generando reporte de Allure..."
if [ -d "allure-results" ]; then
    env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn allure generate ./allure-results -o ./allure-report --clean
    success "Reporte de Allure generado en allure-report."
else
    warn "No se encontró el directorio allure-results. No se generará reporte."
fi

cd ..

header "🛑 Paso 6: Limpieza"

debug "🔪 Deteniendo servidor Appium (PID: $APPIUM_PID)..."
kill $APPIUM_PID
sleep 2

debug "🔌 Desconectando de $ADB_HOST..."
adb disconnect "$ADB_HOST" > /dev/null

# Solo liberar el emulador si lo usamos desde Redis
if [[ -z "$LOCAL_ADB_HOST" && -n "$EMULATOR_ID_FROM_REDIS" ]]; then
    debug "Liberando emulador $EMULATOR_ID_FROM_REDIS en Redis..."
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID_FROM_REDIS" state idle
    success "Emulador de Redis liberado."
fi

header "✅ Fin de la ejecución."

exit $EXIT_CODE
