#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

header "🧠 Maestro Orquestador - Inicio"
debug "🕓 $(date)"
header "🚀 Paso extra: Iniciar adb server una sola vez"
adb start-server
sleep 1  # opcional, da tiempo a que levante bien
adb disconnect > /dev/null 2>&1 || true  # desconectar cualquier conexión previa
# === CONFIG ===
GIT_USER="${GIT_USER:-finalquest}"
GIT_APPIUM_PAT="${GIT_PAT:?Debe definir GIT_PAT (personal access token)}"
APPIUM_REPO_URL="https://${GIT_USER}:${GIT_APPIUM_PAT}@${GIT_APPIUM_URL}"
APPIUM_DIR="${APPIUM_DIR:-flows}"
ADB_PARALLELISM="${ADB_PARALLELISM:-4}"
REBOOT_EMULATORS="${REBOOT_EMULATORS:-true}"
BUILD_DIR="${BUILD_DIR:-/tmp/build}"
APPIUM_BRANCH="${APPIUM_BRANCH:-master}"
MAX_PARALLEL_WORKERS="${MAX_PARALLEL_WORKERS:-2}"
PORT_BASE=${PORT_BASE:-4724}      # Appium
SYS_PORT_BASE=${SYS_PORT_BASE:-8200}  # UiAutomator2 systemPort
ADB_PORT_BASE=${ADB_PORT_BASE:-5037}  # ADB_SERVER_PORT

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# === CLIENT & FEATURES LIST ===
CLIENT="${1:?Debe especificar el cliente (bind, nbch, bpn)}"

if [[ "$CLIENT" != "nbch" && "$CLIENT" != "bpn" && "$CLIENT" != "bind" ]]; then
  error "Cliente no válido: '$CLIENT'. Debe ser 'nbch', 'bpn' o 'bind'."
  exit 1
fi

FEATURES_LIST="features_${CLIENT}.txt"
export FEATURES_LIST

header "🧹 Paso 1: Reinicializar repo de appium"
debug "🔧 URL del repo: $APPIUM_REPO_URL"
debug "📁 Carpeta destino: $APPIUM_DIR"

rm -rf "$APPIUM_DIR"
git clone --depth 1 --branch "$APPIUM_BRANCH" "$APPIUM_REPO_URL" "$APPIUM_DIR"

debug "📂 Instalando dependencias $APPIUM_DIR:"

env -u DEBUG -u RESET -u HEADER -u ERROR -u WARN -u SUCCESS \
  yarn install --cwd "$APPIUM_DIR" || {
    error "Error al instalar dependencias en $APPIUM_DIR"
    exit 1
}

success "Repo clonado exitosamente"

header "📦 Paso 2: Descargar APK desde Harbor usando ORAS"

if [[ -z "${APK_REGISTRY:-}" || -z "${APK_PATH:-}" ]]; then
  error "Deben estar definidas las variables de entorno APK_REGISTRY y APK_PATH"
  exit 1
fi

TAG=$(echo "$APK_PATH" | cut -d':' -f2)
REPO=$(echo "$APK_PATH" | cut -d':' -f1)
FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
APK_FILENAME="builds/${TAG}/"

mkdir -p builds

debug "🔗 Descargando APK: $FULL_REF"
debug "📁 Guardando como: $APK_FILENAME"

oras pull --plain-http "$FULL_REF" -o "$APK_FILENAME" || {
  error "Error al descargar el APK desde $FULL_REF"
  exit 1
}

success "APK descargado como ${APK_FILENAME}"

header "🔍 Paso 4: Extraer packageName desde config base"

ENV_FILE="${APPIUM_DIR}/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # eliminar carriage returns y leer como shell
  sed 's/\r$//' "$ENV_FILE" > .tmp_env_cleaned
  source .tmp_env_cleaned
  rm .tmp_env_cleaned
  set +a
  success "Variables de entorno cargadas desde $ENV_FILE"
else
  warn "Archivo $ENV_FILE no encontrado, se omite carga de variables"
fi

PACKAGE_NAME="${APP_PACKAGE_NBCH}"

if [[ -z "$PACKAGE_NAME" ]]; then
  error "No se pudo extraer un appId válido"
  exit 1
fi

success "📦 packageName detectado: $PACKAGE_NAME"

header "🧬 Paso 5: Generar lista de adb_host de emuladores 'idle'"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"
ADB_LIST_FILE="adb_hosts.txt"

> "$ADB_LIST_FILE"

mapfile -t EMULATORS < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")

TOTAL=${#EMULATORS[@]}
FOUND=0

for EMULATOR_KEY in "${EMULATORS[@]}"; do
  STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMULATOR_KEY" state)
  ADB_HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMULATOR_KEY" adb_host)

  if [[ "$STATE" == "idle" && -n "$ADB_HOST" ]]; then
    echo "$ADB_HOST" >> "$ADB_LIST_FILE"
    debug "   ➕ $EMULATOR_KEY agregado"
    ((FOUND++))
  fi
done

success "$FOUND de $TOTAL emuladores están 'idle' con adb_host definido"
debug "📄 Lista generada en: $ADB_LIST_FILE"

header "🔁 Paso 6: Reiniciar emuladores y esperar disponibilidad"

# if [[ "${REBOOT_EMULATORS}" == "true" ]]; then
#   if [[ ! -f "$ADB_LIST_FILE" ]]; then
#     error "No se encontró el archivo $ADB_LIST_FILE"
#     exit 1
#   fi

#   reboot_emulator() {
#     local ADB_HOST="$1"
#     [[ -z "$ADB_HOST" ]] && return

#     debug "🔗 Conectando a $ADB_HOST para reiniciar..." >&2
#     adb connect "$ADB_HOST" > /dev/null

#     debug "🔄 Reiniciando emulador en $ADB_HOST" >&2
#     adb -s "$ADB_HOST" reboot

#     debug "⏳ Esperando a que vuelva a estar disponible $ADB_HOST" >&2
#     until adb -s "$ADB_HOST" wait-for-device; do
#       sleep 1
#     done
#   }

#   export -f reboot_emulator
#   cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'reboot_emulator "$@"' _ {}

#   success "Emuladores reiniciados y listos"
# else
#   warn "Reinicio de emuladores omitido (REBOOT_EMULATORS no es 'true')"
# fi

uninstall_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  debug "🔗 Conectando a $ADB_HOST..." >&2
  adb connect "$ADB_HOST" > /dev/null

  debug "🗑️  Desinstalando $PACKAGE_NAME en $ADB_HOST" >&2
  adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || warn "No estaba instalado" >&2
  debug "🗑️  Desactivando animaciones en $ADB_HOST" >&2
  adb -s "$ADB_HOST" shell settings put global window_animation_scale 0
  adb -s "$ADB_HOST" shell settings put global transition_animation_scale 0
  adb -s "$ADB_HOST" shell settings put global animator_duration_scale 0
}

install_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  debug "🔗 Conectando a $ADB_HOST..." >&2
  adb connect "$ADB_HOST" > /dev/null

  debug "📲 Instalando $APK_FILE en $ADB_HOST" >&2
  adb -s "$ADB_HOST" install -r "$APK_FILE" > /dev/null || warn "Falló instalación en $ADB_HOST" >&2
}

export -f uninstall_apk
export -f install_apk
export PACKAGE_NAME
export APK_FILE="builds/${TAG}/apk.apk"

header "📱 Paso 7: Desinstalar APK anterior en emuladores 'idle' (max $ADB_PARALLELISM en paralelo)"

if [[ ! -f "$ADB_LIST_FILE" ]]; then
  error "No se encontró el archivo $ADB_LIST_FILE"
  exit 1
fi

cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'uninstall_apk "$@"' _ {}

success "Desinstalación completada en todos los emuladores"

header "📦 Paso 8: Instalar APK nuevo en emuladores 'idle' (max $ADB_PARALLELISM en paralelo)"

if [[ ! -f "$APK_FILE" ]]; then
  error "No se encontró el archivo $APK_FILE"
  exit 1
fi

cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'install_apk "$@"' _ {}

success "Instalación completada en todos los emuladores"

header "🎯 Paso 9: Ejecutar flows con appium en paralelo con ADB"

header "🗂️Generar lista de features para cliente '${CLIENT}'"

FEATURES_DIR="${APPIUM_DIR}/test/features/${CLIENT}/feature"

if [[ ! -d "$FEATURES_DIR" ]]; then
  error "No se encontró el directorio $FEATURES_DIR"
  exit 1
fi

find "$FEATURES_DIR" -type f -name "*.feature" | sed -E "s|^.*test/features/${CLIENT}/|${CLIENT}/|; s|\.feature$||" > "$FEATURES_LIST"
success "Lista de features generada en $FEATURES_LIST"
cat "$FEATURES_LIST"

if [[ ! -f "$FEATURES_LIST" || ! -f "$ADB_LIST_FILE" ]]; then
  error "No se encontró feature_list o adb_list"
  exit 1
fi

# === Generar configs y levantar servidores Appium para cada emulador ===
INDEX=0
APPIUM_PIDS=()
mkdir -p config/generated

while read -r ADB_HOST; do
  PORT=$((PORT_BASE + INDEX))
  SYS_PORT=$((SYS_PORT_BASE + INDEX))
  ADB_PORT=$((ADB_PORT_BASE + INDEX))

  echo "🚀 Appium idx=$INDEX host=$ADB_HOST appium=$PORT system=$SYS_PORT adb=$ADB_PORT"

  # ADB dedicado para este Appium
  ANDROID_ADB_SERVER_PORT="$ADB_PORT" adb start-server
  # Opcional: pre-conectar (Appium igual autoconecta, pero esto calienta)
  ANDROID_ADB_SERVER_PORT="$ADB_PORT" adb connect "$ADB_HOST" >/dev/null

  # Levantar Appium apuntando a ESTE ADB
  env -u DEBUG -u RESET -u HEADER -u ERROR -u WARN -u SUCCESS \
  ANDROID_ADB_SERVER_PORT="$ADB_PORT" \
  yarn --cwd "$APPIUM_DIR" run appium --port "$PORT" --base-path /wd/hub --log-timestamp \
    > "appium_${INDEX}.log" 2>&1 &
  APPIUM_PIDS+=($!)

  # Config WDIO con puertos únicos
  CONFIG_FILE="${APPIUM_DIR}/config/wdio.android.emu-${INDEX}.ts"
  cat > "$CONFIG_FILE" <<EOF
import { config } from './wdio.local.shared';
config.hostname = 'localhost';
config.port = ${PORT};
config.path = '/wd/hub';
config.capabilities = [
  {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': '${ADB_HOST}',
    'appium:deviceName': 'emu-${INDEX}',
    'appium:systemPort': ${SYS_PORT},
    'appium:adbPort': ${ADB_PORT},
    'appium:appPackage': '${PACKAGE_NAME}',
    'appium:appActivity': 'com.poincenot.doit.MainActivity',
    'appium:noReset': false,
    'appium:adbExecTimeout': 120000,
    'appium:uiautomator2ServerLaunchTimeout': 120000,
    'appium:disableWindowAnimation': true,
    appium:skipLogcatCapture': true,
    'appium:autoAcceptAlerts': true,
    'appium:autoDismissAlerts': true,
    "appium:unicodeKeyboard": true,
    "appium:resetKeyboard": true,
    "appium:autoGrantPermissions": true,
    "appium:hideKeyboard": true
  }
];
export { config };
EOF

  ((INDEX++))
done < "$ADB_LIST_FILE"

success "Configs generados en config/generated/*"

header "🏃 Paso 10: Ejecutar tests Appium en paralelo respetando límite de workers"

if [[ ! -f "$FEATURES_LIST" ]]; then
  error "No se encontró $FEATURES_LIST"
  exit 1
fi

mapfile -t FEATURES < "$FEATURES_LIST"
mapfile -t CONFIGS < <(cd "$APPIUM_DIR" && find "config" -name "wdio.android.emu-*.ts" | sort)

FEATURE_COUNT=${#FEATURES[@]}
CONFIG_COUNT=${#CONFIGS[@]}

if (( CONFIG_COUNT == 0 || FEATURE_COUNT == 0 )); then
  error "No hay configs o features para ejecutar"
  exit 1
fi


WORKER_COUNT=$(( CONFIG_COUNT < MAX_PARALLEL_WORKERS ? CONFIG_COUNT : MAX_PARALLEL_WORKERS ))

debug "👷 Se usarán $WORKER_COUNT workers (máximo permitido: $MAX_PARALLEL_WORKERS)"

# Crear cola compartida (FIFO) para features
QUEUE_FILE=".feature_queue"
> "$QUEUE_FILE"
for FEATURE in "${FEATURES[@]}"; do
  echo "$FEATURE" >> "$QUEUE_FILE"
done

run_worker() {
  local CONFIG_FILE="$1"
  local WORKER_ID="$2"

  while true; do
    FEATURE=""
    {
      flock 200
      FEATURE=$(head -n 1 "$QUEUE_FILE")
      tail -n +2 "$QUEUE_FILE" > "$QUEUE_FILE.tmp" && mv "$QUEUE_FILE.tmp" "$QUEUE_FILE"
    } 200>"$QUEUE_FILE.lock"

    if [[ -z "$FEATURE" ]]; then
      debug "Worker $WORKER_ID: cola vacía, termino"
      break
    fi

    LOG_DIR="logs"
    mkdir -p "$APPIUM_DIR/$LOG_DIR"
    SANITIZED_FEATURE_NAME=$(echo "$FEATURE" | tr '/' '_')
    LOG_FILE="$LOG_DIR/worker_${WORKER_ID}_${SANITIZED_FEATURE_NAME}.log"

    header "🚀 Corriendo feature: ${FEATURE}"
    debug "👷 Usando config: ${CONFIG_FILE} (worker ${WORKER_ID})"
    debug "📄 Redirigiendo output a: $APPIUM_DIR/$LOG_FILE\n"
    local IDX
    IDX=$(echo "$CONFIG_FILE" | sed -E 's/.*emu-([0-9]+)\.ts/\1/')
    local ADB_PORT=$((ADB_PORT_BASE + IDX))

    (
      cd "$APPIUM_DIR"
      env -u DEBUG -u RESET -u HEADER -u ERROR -u WARN -u SUCCESS \
      ANDROID_ADB_SERVER_PORT="$ADB_PORT" \
      stdbuf -oL -eL yarn run env-cmd -f ./.env -- wdio "$CONFIG_FILE" "$FEATURE" > "$LOG_FILE" 2>&1
    )
    success "Worker $WORKER_ID terminó feature: $FEATURE. Log disponible en $APPIUM_DIR/$LOG_FILE"
  done

  success "🏁 Worker $WORKER_ID finalizó, no quedan más features"
}

# Lanzar WORKER_COUNT procesos en paralelo y registrar sus PIDs
PIDS=()
for (( i=0; i<WORKER_COUNT; i++ )); do
  CONFIG_FILE="${CONFIGS[$i]}"
  run_worker "$CONFIG_FILE" "$i" &
  PIDS+=($!)
done

# Esperar solamente los procesos worker, no el Appium
for PID in "${PIDS[@]}"; do
  wait "$PID"
done

# Limpiar archivos temporales
rm -f "$QUEUE_FILE" "$QUEUE_FILE.lock"

# Terminar todos los servidores Appium iniciados
header "🛑 Paso 12: Detener todos los servidores Appium"
for PID in "${APPIUM_PIDS[@]}"; do
  if kill -0 "$PID" 2>/dev/null; then
    debug "🔪 Matando proceso Appium con PID $PID"
    kill "$PID"
  else
    warn "Proceso Appium con PID $PID ya no existía"
  fi
done
success "Servidores Appium detenidos"

header "📊 Paso 11: Generar reporte unificado con Allure"

ALLURE_RESULTS_DIR="allure-results"
ALLURE_REPORT_DIR="allure-report"

if [[ ! -d "$APPIUM_DIR/$ALLURE_RESULTS_DIR" ]]; then
  error "No se encontró el directorio $ALLURE_RESULTS_DIR"
  exit 1
fi

debug "🧪 Generando reporte desde: $ALLURE_RESULTS_DIR"
debug "📁 Output: $ALLURE_REPORT_DIR"

DEBUG= ERROR= HEADER= RESET= WARN= SUCCESS= \
yarn --cwd "$APPIUM_DIR" allure generate "$ALLURE_RESULTS_DIR" --clean -o "$ALLURE_REPORT_DIR" || {
  error "Falló la generación del reporte Allure"
  exit 1
}

success "Reporte generado exitosamente en $ALLURE_REPORT_DIR"

success "Todos los tests fueron ejecutados respetando el límite de concurrencia"
header "🧠 Maestro Orquestador - Fin"
