#!/bin/bash

# === COLORES ANSI ===
RESET="\033[0m"
HEADER="\033[1;95m"   # Magenta
SUCCESS="\033[1;96m"  # Cyan
WARN="\033[1;93m"     # Amarillo
ERROR="\033[1;91m"    # Rojo
DEBUG="\033[1;90m"    # Gris tenue

export RESET HEADER SUCCESS WARN ERROR DEBUG

echo -e "${HEADER}🧠 Maestro Orquestador - Inicio${RESET}"
echo -e "${DEBUG}🕓 $(date)${RESET}"
echo -e "${HEADER}🚀 Paso extra: Iniciar adb server una sola vez${RESET}"
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

# === CLIENT & FEATURES LIST ===
CLIENT="${1:?Debe especificar el cliente (bind, nbch, bpn)}"
FEATURES_LIST="features_${CLIENT}.txt"
export FEATURES_LIST

echo -e "\n${HEADER}🧹 Paso 1: Reinicializar repo de appium${RESET}"
echo -e "${DEBUG}🔧 URL del repo: $APPIUM_REPO_URL${RESET}"
echo -e "${DEBUG}📁 Carpeta destino: $APPIUM_DIR${RESET}"

rm -rf "$APPIUM_DIR"
git clone --depth 1 --branch parallel-test "$APPIUM_REPO_URL" "$APPIUM_DIR"

echo -e "${DEBUG}📂 Instalando dependencias $APPIUM_DIR:"

env -u DEBUG -u RESET -u HEADER -u ERROR -u WARN -u SUCCESS \
  yarn install --cwd "$APPIUM_DIR" || {
    echo -e "${ERROR}❌ Error al instalar dependencias en $APPIUM_DIR${RESET}"
    exit 1
}

echo -e "${SUCCESS}✅ Repo clonado exitosamente${RESET}"

echo -e "\n${HEADER}📦 Paso 2: Descargar APK desde Harbor usando ORAS${RESET}"

if [[ -z "${APK_REGISTRY:-}" || -z "${APK_PATH:-}" ]]; then
  echo -e "${ERROR}❌ Error: Deben estar definidas las variables de entorno APK_REGISTRY y APK_PATH${RESET}"
  exit 1
fi

TAG=$(echo "$APK_PATH" | cut -d':' -f2)
REPO=$(echo "$APK_PATH" | cut -d':' -f1)
FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
APK_FILENAME="builds/${TAG}/"

mkdir -p builds

echo -e "${DEBUG}🔗 Descargando APK: $FULL_REF${RESET}"
echo -e "${DEBUG}📁 Guardando como: $APK_FILENAME${RESET}"

oras pull --plain-http "$FULL_REF" -o "$APK_FILENAME" || {
  echo -e "${ERROR}❌ Error al descargar el APK desde $FULL_REF${RESET}"
  exit 1
}

echo -e "${SUCCESS}✅ APK descargado como ${APK_FILENAME}${RESET}"

echo -e "\n${HEADER}🔍 Paso 4: Extraer packageName desde config base${RESET}"

ENV_FILE="${APPIUM_DIR}/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # eliminar carriage returns y leer como shell
  sed 's/\r$//' "$ENV_FILE" > .tmp_env_cleaned
  source .tmp_env_cleaned
  rm .tmp_env_cleaned
  set +a
  echo -e "${SUCCESS}✅ Variables de entorno cargadas desde $ENV_FILE${RESET}"
else
  echo -e "${WARN}⚠️  Archivo $ENV_FILE no encontrado, se omite carga de variables${RESET}"
fi

PACKAGE_NAME="${APP_PACKAGE_NBCH}"

if [[ -z "$PACKAGE_NAME" ]]; then
  echo -e "${ERROR}❌ Error: No se pudo extraer un appId válido${RESET}"
  exit 1
fi

echo -e "${SUCCESS}📦 packageName detectado: $PACKAGE_NAME ${RESET}"

echo -e "\n${HEADER}🧬 Paso 5: Generar lista de adb_host de emuladores 'idle'${RESET}"

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
    echo -e "${DEBUG}   ➕ $EMULATOR_KEY agregado${RESET}"
    ((FOUND++))
  fi
done

echo -e "${SUCCESS}✅ $FOUND de $TOTAL emuladores están 'idle' con adb_host definido${RESET}"
echo -e "${DEBUG}📄 Lista generada en: $ADB_LIST_FILE${RESET}"

echo -e "\n${HEADER}🔁 Paso 6: Reiniciar emuladores y esperar disponibilidad${RESET}"

# if [[ "${REBOOT_EMULATORS}" == "true" ]]; then
#   if [[ ! -f "$ADB_LIST_FILE" ]]; then
#     echo -e "${ERROR}❌ No se encontró el archivo $ADB_LIST_FILE${RESET}"
#     exit 1
#   fi

#   reboot_emulator() {
#     local ADB_HOST="$1"
#     [[ -z "$ADB_HOST" ]] && return

#     echo -e "${DEBUG}🔗 Conectando a $ADB_HOST para reiniciar...${RESET}" >&2
#     adb connect "$ADB_HOST" > /dev/null

#     echo -e "${DEBUG}🔄 Reiniciando emulador en $ADB_HOST${RESET}" >&2
#     adb -s "$ADB_HOST" reboot

#     echo -e "${DEBUG}⏳ Esperando a que vuelva a estar disponible $ADB_HOST${RESET}" >&2
#     until adb -s "$ADB_HOST" wait-for-device; do
#       sleep 1
#     done
#   }

#   export -f reboot_emulator
#   cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'reboot_emulator "$@"' _ {}

#   echo -e "${SUCCESS}✅ Emuladores reiniciados y listos${RESET}"
# else
#   echo -e "${WARN}⏭️  Reinicio de emuladores omitido (REBOOT_EMULATORS no es 'true')${RESET}"
# fi

uninstall_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  echo -e "${DEBUG}🔗 Conectando a $ADB_HOST...${RESET}" >&2
  adb connect "$ADB_HOST" > /dev/null

  echo -e "${DEBUG}🗑️  Desinstalando $PACKAGE_NAME en $ADB_HOST${RESET}" >&2
  adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || echo -e "${WARN}⚠️  No estaba instalado${RESET}" >&2

  # echo -e "${DEBUG}🔌 Desconectando de $ADB_HOST${RESET}" >&2
  # adb disconnect "$ADB_HOST" > /dev/null
}

install_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  echo -e "${DEBUG}🔗 Conectando a $ADB_HOST...${RESET}" >&2
  adb connect "$ADB_HOST" > /dev/null

  echo -e "${DEBUG}📲 Instalando $APK_FILE en $ADB_HOST${RESET}" >&2
  adb -s "$ADB_HOST" install -r "$APK_FILE" > /dev/null || echo -e "${WARN}⚠️ Falló instalación en $ADB_HOST${RESET}" >&2

  # echo -e "${DEBUG}🔌 Desconectando de $ADB_HOST${RESET}" >&2
  # adb disconnect "$ADB_HOST" > /dev/null
}

export -f uninstall_apk
export -f install_apk
export PACKAGE_NAME
export APK_FILE="builds/${TAG}/apk.apk"

echo -e "\n${HEADER}📱 Paso 7: Desinstalar APK anterior en emuladores 'idle' (max $ADB_PARALLELISM en paralelo)${RESET}"

if [[ ! -f "$ADB_LIST_FILE" ]]; then
  echo -e "${ERROR}❌ No se encontró el archivo $ADB_LIST_FILE${RESET}"
  exit 1
fi

cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'uninstall_apk "$@"' _ {}

echo -e "${SUCCESS}✅ Desinstalación completada en todos los emuladores${RESET}"

echo -e "\n${HEADER}📦 Paso 8: Instalar APK nuevo en emuladores 'idle' (max $ADB_PARALLELISM en paralelo)${RESET}"

if [[ ! -f "$APK_FILE" ]]; then
  echo -e "${ERROR}❌ No se encontró el archivo $APK_FILE${RESET}"
  exit 1
fi

cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'install_apk "$@"' _ {}

echo -e "${SUCCESS}✅ Instalación completada en todos los emuladores${RESET}"

echo -e "\n${HEADER}🎯 Paso 9: Ejecutar flows con appium en paralelo con ADB${RESET}"

echo -e "\n${HEADER}🗂️ Paso 8.5: Generar lista de features para cliente '${CLIENT}'${RESET}"

FEATURES_DIR="${APPIUM_DIR}/test/features/${CLIENT}/feature"

if [[ ! -d "$FEATURES_DIR" ]]; then
  echo -e "${ERROR}❌ No se encontró el directorio $FEATURES_DIR${RESET}"
  exit 1
fi

find "$FEATURES_DIR" -type f -name "*.feature" | sed "s|^.*test/features/${CLIENT}/|${CLIENT}/|" > "$FEATURES_LIST"

echo -e "${SUCCESS}✅ Lista de features generada en $FEATURES_LIST${RESET}"
cat "$FEATURES_LIST"

if [[ ! -f "$FEATURES_LIST" || ! -f "$ADB_LIST_FILE" ]]; then
  echo -e "${ERROR}❌ No se encontró feature_list o adb_list${RESET}"
  exit 1
fi

# === Generar configs individuales de Appium para cada emulador ===
CONFIG_TEMPLATE="config/wdio.local.android.ts"
PORT_BASE=4723
INDEX=0
mkdir -p config/generated

while read -r ADB_HOST; do
  PORT=$((PORT_BASE + INDEX * 2))
  CONFIG_FILE="${APPIUM_DIR}/config/wdio.android.emu-${INDEX}.ts"

  echo -e "${DEBUG}⚙️ Generando $CONFIG_FILE con puerto $PORT para $ADB_HOST${RESET}"

  cat > "$CONFIG_FILE" <<EOF
import { config } from './wdio.local.shared';
config.port = $PORT
config.capabilities = [
  {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:appActivity': 'com.poincenot.doit.MainActivity',
    'appium:appPackage': '$PACKAGE_NAME',
    'appium:autoGrantPermissions': true,
    'appium:noReset': false,

    'appium:waitForIdleTimeout': 300,
    'appium:allowDelayAdb': true,
    'appium:udid': '$ADB_HOST',
    'appium:deviceName': 'emu-${INDEX}'
  }
]
exports.config = config
EOF

  ((INDEX++))
done < "$ADB_LIST_FILE"

echo -e "${SUCCESS}✅ Configs generados en config/generated/*${RESET}"

wait
echo -e "${SUCCESS}✅ Todos los flows fueron ejecutados correctamente${RESET}"