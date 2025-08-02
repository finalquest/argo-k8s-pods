#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

header "🧠 Maestro Orquestador - Inicio"
debug "🕓 $(date)"

# === CONFIG ===
GIT_USER="${GIT_USER:-finalquest}"
GIT_PAT="${GIT_PAT:?Debe definir GIT_PAT (personal access token)}"
FLOWS_REPO_URL="https://${GIT_USER}:${GIT_PAT}@${GIT_URL}"
FLOWS_DIR="${FLOWS_DIR:-flows}"
ADB_PARALLELISM="${ADB_PARALLELISM:-4}"
REBOOT_EMULATORS="${REBOOT_EMULATORS:-true}"
BUILD_DIR="${BUILD_DIR:-/tmp/build}"

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

header "🧹 Paso 1: Reinicializar repo de flows"
debug "🔧 URL del repo: $FLOWS_REPO_URL"
debug "📁 Carpeta destino: $FLOWS_DIR"

rm -rf "$FLOWS_DIR"
git clone "$FLOWS_REPO_URL" "$FLOWS_DIR"
success "Repo clonado exitosamente"

header "📦 Paso 2: Descargar APK desde Harbor usando ORAS"

if [[ -z "${APK_REGISTRY:-}" || -z "${APK_PATH:-}" ]]; then
  error "Error: Deben estar definidas las variables de entorno APK_REGISTRY y APK_PATH"
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

header "📃 Paso 3: Generar lista de flows .yaml"

FLOW_SEARCH_PATH="${FLOWS_DIR}/flows"
FLOW_LIST_FILE="flow_list.txt"

find "$FLOW_SEARCH_PATH" -type f -name '*.yaml' > "$FLOW_LIST_FILE"
FLOW_COUNT=$(wc -l < "$FLOW_LIST_FILE" | xargs)

if [[ "$FLOW_COUNT" -eq 0 ]]; then
  error "No se encontraron archivos .yaml en $FLOW_SEARCH_PATH"
  exit 1
fi

success "📝 Se encontraron $FLOW_COUNT flows"
debug "📄 Lista guardada en: $FLOW_LIST_FILE"

header "🔍 Paso 4: Extraer packageName desde el primer flow"

if [[ ! -s "$FLOW_LIST_FILE" ]]; then
  error "Error: El archivo $FLOW_LIST_FILE no existe o está vacío"
  exit 1
fi

FIRST_FLOW_FILE=$(head -n 1 "$FLOW_LIST_FILE")

if [[ ! -f "$FIRST_FLOW_FILE" ]]; then
  error "Error: El archivo de flow no existe: $FIRST_FLOW_FILE"
  exit 1
fi

PACKAGE_NAME=$(yq 'select(documentIndex == 0) | .appId' "$FIRST_FLOW_FILE" 2>/dev/null | grep -E '^[a-zA-Z0-9_.]+$')

if [[ -z "$PACKAGE_NAME" ]]; then
  error "Error: No se pudo extraer un appId válido desde $FIRST_FLOW_FILE"
  exit 1
fi

success "📦 packageName detectado: $PACKAGE_NAME (desde $FIRST_FLOW_FILE)"

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

if [[ "${REBOOT_EMULATORS}" == "true" ]]; then
  if [[ ! -f "$ADB_LIST_FILE" ]]; then
    error "No se encontró el archivo $ADB_LIST_FILE"
    exit 1
  fi

  reboot_emulator() {
    local ADB_HOST="$1"
    [[ -z "$ADB_HOST" ]] && return

    debug "🔗 Conectando a $ADB_HOST para reiniciar..." >&2
    adb connect "$ADB_HOST" > /dev/null

    debug "🔄 Reiniciando emulador en $ADB_HOST" >&2
    adb -s "$ADB_HOST" reboot

    debug "⏳ Esperando a que vuelva a estar disponible $ADB_HOST" >&2
    until adb -s "$ADB_HOST" wait-for-device; do
      sleep 1
    done
  }

  export -f reboot_emulator
  cat "$ADB_LIST_FILE" | xargs -P "$ADB_PARALLELISM" -n 1 -I {} bash -c 'reboot_emulator "$@"' _ {}

  success "Emuladores reiniciados y listos"
else
  warn "Reinicio de emuladores omitido (REBOOT_EMULATORS no es 'true')"
fi

uninstall_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  debug "🔗 Conectando a $ADB_HOST..." >&2
  adb connect "$ADB_HOST" > /dev/null

  debug "🗑️  Desinstalando $PACKAGE_NAME en $ADB_HOST" >&2
  adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" > /dev/null || warn "No estaba instalado" >&2

  debug "🔌 Desconectando de $ADB_HOST" >&2
  adb disconnect "$ADB_HOST" > /dev/null
}

install_apk() {
  local ADB_HOST="$1"
  [[ -z "$ADB_HOST" ]] && return

  debug "🔗 Conectando a $ADB_HOST..." >&2
  adb connect "$ADB_HOST" > /dev/null

  debug "📲 Instalando $APK_FILE en $ADB_HOST" >&2
  adb -s "$ADB_HOST" install -r "$APK_FILE" > /dev/null || warn "Falló instalación en $ADB_HOST" >&2

  debug "🔌 Desconectando de $ADB_HOST" >&2
  adb disconnect "$ADB_HOST" > /dev/null
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

header "🎯 Paso 9: Ejecutar flows con Maestro en paralelo con ADB aislado"

run_maestro_isolated() {
  local ADB_HOST="$1"
  local FLOW_FILE="$2"
  local INDEX="$3"

  if [[ -z "$ADB_HOST" || -z "$FLOW_FILE" ]]; then
    error "Falta ADB_HOST o FLOW_FILE" >&2
    return 1
  fi

  local EMULATOR_ID
  EMULATOR_ID=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "*" | grep -F "$ADB_HOST")

  local ADB_PORT=$((5038 + INDEX))
  local LOG_FILE="logs/${ADB_HOST//[:]/_}.log"
  mkdir -p logs

  debug "🚀 [$ADB_HOST] ADB aislado en puerto $ADB_PORT"

  # === Actualizar Redis: ocupado ===
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state busy

  # Lanzar adb server aislado
  adb -P "$ADB_PORT" nodaemon server &
  sleep 1

  # Conectarse al emulador con ese ADB aislado
  adb -P "$ADB_PORT" connect "$ADB_HOST" > /dev/null
  sleep 1

  # Run maestro apuntando a ese ADB
  export ADB_SERVER_SOCKET="localhost:$ADB_PORT"
  debug "🎬 [$ADB_HOST] Ejecutando Maestro con $FLOW_FILE"
  maestro test "$FLOW_FILE" > "$LOG_FILE" 2>&1
  local EXIT_CODE=$?

  adb -P "$ADB_PORT" disconnect "$ADB_HOST"
  pkill -f "adb -P $ADB_PORT nodaemon" 2>/dev/null

  # === Actualizar Redis: disponible nuevamente ===
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HSET "$EMULATOR_ID" state idle

  debug "📄 [$ADB_HOST] Log en $LOG_FILE (exit=$EXIT_CODE)"
  return $EXIT_CODE
}

export -f run_maestro_isolated

if [[ ! -f "$FLOW_LIST_FILE" || ! -f "$ADB_LIST_FILE" ]]; then
  error "No se encontró flow_list o adb_list"
  exit 1
fi

get_idle_emulator() {
  mapfile -t EMUS < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")
  for EMU in "${EMUS[@]}"; do
    local STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU" state)
    local HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMU" adb_host)
    if [[ "$STATE" == "idle" && -n "$HOST" ]]; then
      echo "$EMU|$HOST"
      return 0
    fi
  done
  return 1
}

mapfile -t FLOWS < "$FLOW_LIST_FILE"
ACTIVE_JOBS=0

for i in "${!FLOWS[@]}"; do
  FLOW="${FLOWS[$i]}"
  debug "🔍 Buscando emulador idle para: $FLOW"

  while true; do
    EMU_INFO=$(get_idle_emulator)
    if [[ -n "$EMU_INFO" ]]; then
      EMULATOR_ID="${EMU_INFO%%|*}"
      ADB_HOST="${EMU_INFO##*|}"

      debug "✅ Asignando $FLOW a $EMULATOR_ID ($ADB_HOST)"

      bash -c "run_maestro_isolated '$ADB_HOST' '$FLOW' $i" &
      ((ACTIVE_JOBS++))

      if (( ACTIVE_JOBS >= ADB_PARALLELISM )); then
        wait -n
        ((ACTIVE_JOBS--))
      fi

      break
    fi

    sleep 1
  done
done

wait
success "Todos los flows fueron ejecutados correctamente"
