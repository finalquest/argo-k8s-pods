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

# === CONFIG ===
GIT_USER="${GIT_USER:-finalquest}"
GIT_PAT="${GIT_PAT:?Debe definir GIT_PAT (personal access token)}"
FLOWS_REPO_URL="https://${GIT_USER}:${GIT_PAT}@${GIT_URL}"
FLOWS_DIR="${FLOWS_DIR:-flows}"
ADB_PARALLELISM="${ADB_PARALLELISM:-4}"
REBOOT_EMULATORS="${REBOOT_EMULATORS:-true}"

echo -e "\n${HEADER}🧹 Paso 1: Reinicializar repo de flows${RESET}"
echo -e "${DEBUG}🔧 URL del repo: $FLOWS_REPO_URL${RESET}"
echo -e "${DEBUG}📁 Carpeta destino: $FLOWS_DIR${RESET}"

rm -rf "$FLOWS_DIR"
git clone "$FLOWS_REPO_URL" "$FLOWS_DIR"
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

echo -e "\n${HEADER}📃 Paso 3: Generar lista de flows .yaml${RESET}"

FLOW_SEARCH_PATH="${FLOWS_DIR}/flows"
FLOW_LIST_FILE="flow_list.txt"

find "$FLOW_SEARCH_PATH" -type f -name '*.yaml' > "$FLOW_LIST_FILE"
FLOW_COUNT=$(wc -l < "$FLOW_LIST_FILE" | xargs)

if [[ "$FLOW_COUNT" -eq 0 ]]; then
  echo -e "${ERROR}❌ No se encontraron archivos .yaml en $FLOW_SEARCH_PATH${RESET}"
  exit 1
fi

echo -e "${SUCCESS}📝 Se encontraron $FLOW_COUNT flows${RESET}"
echo -e "${DEBUG}📄 Lista guardada en: $FLOW_LIST_FILE${RESET}"

echo -e "\n${HEADER}🔍 Paso 4: Extraer packageName desde el primer flow${RESET}"

if [[ ! -s "$FLOW_LIST_FILE" ]]; then
  echo -e "${ERROR}❌ Error: El archivo $FLOW_LIST_FILE no existe o está vacío${RESET}"
  exit 1
fi

FIRST_FLOW_FILE=$(head -n 1 "$FLOW_LIST_FILE")

if [[ ! -f "$FIRST_FLOW_FILE" ]]; then
  echo -e "${ERROR}❌ Error: El archivo de flow no existe: $FIRST_FLOW_FILE${RESET}"
  exit 1
fi

PACKAGE_NAME=$(yq 'select(documentIndex == 0) | .appId' "$FIRST_FLOW_FILE" 2>/dev/null | grep -E '^[a-zA-Z0-9_.]+$')

if [[ -z "$PACKAGE_NAME" ]]; then
  echo -e "${ERROR}❌ Error: No se pudo extraer un appId válido desde $FIRST_FLOW_FILE${RESET}"
  exit 1
fi

echo -e "${SUCCESS}📦 packageName detectado: $PACKAGE_NAME (desde $FIRST_FLOW_FILE)${RESET}"

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

if [[ "${REBOOT_EMULATORS}" == "true" ]]; then
  if [[ ! -f "$ADB_LIST_FILE" ]]; then
    echo -e "${ERROR}❌ No se encontró el archivo $ADB_LIST_FILE${RESET}"
    exit 1
  fi

  reboot_emulator() {
    local ADB_HOST="$1"
    [[ -z "$ADB_HOST" ]] && return

    echo -e "${DEBUG}🔗 Conectando a $ADB_HOST para reiniciar...${RESET}" >&2
    adb connect "$ADB_HOST" > /dev/null

    echo -e "${DEBUG}🔄 Reiniciando emulador en $ADB_HOST${RESET}" >&2
    adb -s "$ADB_HOST" reboot

    echo -e "${DEBUG}⏳ Esperando a que vuelva a estar disponible $ADB_HOST${RESET}" >&2
    until adb -s "$ADB_HOST" wait-for-device; do
      sleep 1
    done
  }

  export -f reboot_emulator
  cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'reboot_emulator "$@"' _ {}

  echo -e "${SUCCESS}✅ Emuladores reiniciados y listos${RESET}"
else
  echo -e "${WARN}⏭️  Reinicio de emuladores omitido (REBOOT_EMULATORS no es 'true')${RESET}"
fi

uninstall_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  echo -e "${DEBUG}🔗 Conectando a $ADB_HOST...${RESET}" >&2
  adb connect "$ADB_HOST" > /dev/null

  echo -e "${DEBUG}🗑️  Desinstalando $PACKAGE_NAME en $ADB_HOST${RESET}" >&2
  adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || echo -e "${WARN}⚠️  No estaba instalado${RESET}" >&2

  echo -e "${DEBUG}🔌 Desconectando de $ADB_HOST${RESET}" >&2
  adb disconnect "$ADB_HOST" > /dev/null
}

install_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  echo -e "${DEBUG}🔗 Conectando a $ADB_HOST...${RESET}" >&2
  adb connect "$ADB_HOST" > /dev/null

  echo -e "${DEBUG}📲 Instalando $APK_FILE en $ADB_HOST${RESET}" >&2
  adb -s "$ADB_HOST" install -r "$APK_FILE" > /dev/null || echo -e "${WARN}⚠️ Falló instalación en $ADB_HOST${RESET}" >&2

  echo -e "${DEBUG}🔌 Desconectando de $ADB_HOST${RESET}" >&2
  adb disconnect "$ADB_HOST" > /dev/null
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