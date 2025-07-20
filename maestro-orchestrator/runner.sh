#!/bin/bash
echo "🧠 Maestro Orquestador - Inicio"
echo "🕓 $(date)"

# === CONFIG ===
GIT_USER="${GIT_USER:-finalquest}"
GIT_PAT="${GIT_PAT:?Debe definir GIT_PAT (personal access token)}"
FLOWS_REPO_URL="https://${GIT_USER}:${GIT_PAT}@${GIT_URL}"
FLOWS_DIR="${FLOWS_DIR:-flows}"

echo ""
echo "🧹 Paso 1: Reinicializar repo de flows"
echo "🔧 URL del repo: $FLOWS_REPO_URL"
echo "📁 Carpeta destino: $FLOWS_DIR"

# Borrar el repo local si ya existe
rm -rf "$FLOWS_DIR"

# Clonar repo limpio
git clone "$FLOWS_REPO_URL" "$FLOWS_DIR"

echo "✅ Repo clonado exitosamente"
echo ""
echo "📦 Paso 2: Descargar APK desde Harbor usando ORAS"

# Verificar variables necesarias
if [[ -z "${APK_REGISTRY:-}" || -z "${APK_PATH:-}" ]]; then
  echo "❌ Error: Deben estar definidas las variables de entorno APK_REGISTRY y APK_PATH"
  echo "🔧 Ejemplo:"
  echo "  export APK_REGISTRY=registry.local:8080"
  echo "  export APK_PATH=apks/chaco/int:3.0.0"
  exit 1
fi

# Parsear tag y repo
TAG=$(echo "$APK_PATH" | cut -d':' -f2)
REPO=$(echo "$APK_PATH" | cut -d':' -f1)
FULL_REF="${APK_REGISTRY}/${REPO}:${TAG}"
APK_FILENAME="builds/${TAG}.apk"

# Crear carpeta builds si no existe
mkdir -p builds

echo "🔗 Descargando APK: $FULL_REF"
echo "📁 Guardando como: $APK_FILENAME"

# Descargar directamente al nombre final
oras pull --plain-http "$FULL_REF" -o "$APK_FILENAME"

echo "✅ APK descargado como ${APK_FILENAME}"

echo ""
echo "📃 Paso 3: Generar lista de flows .yaml"

FLOW_SEARCH_PATH="${FLOWS_DIR}/flows"
FLOW_LIST_FILE="flow_list.txt"

# Buscar recursivamente todos los .yaml y guardarlos en un archivo
find "$FLOW_SEARCH_PATH" -type f -name '*.yaml' > "$FLOW_LIST_FILE"

FLOW_COUNT=$(wc -l < "$FLOW_LIST_FILE" | xargs)

if [[ "$FLOW_COUNT" -eq 0 ]]; then
  echo "❌ No se encontraron archivos .yaml en $FLOW_SEARCH_PATH"
  exit 1
fi

echo "📝 Se encontraron $FLOW_COUNT flows"
echo "📄 Lista guardada en: $FLOW_LIST_FILE"

echo ""
echo "🔍 Paso 4: Extraer packageName desde el primer flow"

# Verificar si el archivo existe y tiene contenido
if [[ ! -s "$FLOW_LIST_FILE" ]]; then
  echo "❌ Error: El archivo $FLOW_LIST_FILE no existe o está vacío"
  exit 1
fi

# Tomar el primer path de flow
FIRST_FLOW_FILE=$(head -n 1 "$FLOW_LIST_FILE")

if [[ ! -f "$FIRST_FLOW_FILE" ]]; then
  echo "❌ Error: El archivo de flow no existe: $FIRST_FLOW_FILE"
  exit 1
fi

# Extraer el campo appId
PACKAGE_NAME=$(yq 'select(documentIndex == 0) | .appId' "$FIRST_FLOW_FILE" 2>/dev/null | grep -E '^[a-zA-Z0-9_.]+$')

if [[ -z "$PACKAGE_NAME" ]]; then
  echo "❌ Error: No se pudo extraer un appId válido desde $FIRST_FLOW_FILE"
  exit 1
fi

echo "📦 packageName detectado: $PACKAGE_NAME (desde $FIRST_FLOW_FILE)"

echo ""
echo "🧬 Paso 5: Generar lista de adb_host de emuladores 'idle'"

REDIS_HOST="${RHOST:-redis}"
REDIS_PORT="${RPORT:-6379}"
ADB_LIST_FILE="adb_hosts.txt"

# Limpiar archivo anterior
> "$ADB_LIST_FILE"

mapfile -t EMULATORS < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "android-emulator-*")

TOTAL=${#EMULATORS[@]}
FOUND=0

for EMULATOR_KEY in "${EMULATORS[@]}"; do
  STATE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMULATOR_KEY" state)
  ADB_HOST=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" HGET "$EMULATOR_KEY" adb_host)

  if [[ "$STATE" == "idle" && -n "$ADB_HOST" ]]; then
    echo "$ADB_HOST" >> "$ADB_LIST_FILE"
    echo "   ➕ $EMULATOR_KEY agregado"
    ((FOUND++))
  fi
done

echo "✅ $FOUND de $TOTAL emuladores están 'idle' con adb_host definido"
echo "📄 Lista generada en: $ADB_LIST_FILE"

echo ""
echo "📱 Paso 6: Desinstalar APK anterior en emuladores 'idle'"

PACKAGE_NAME="${PACKAGE_NAME:?Debe estar definido PACKAGE_NAME}"
ADB_LIST_FILE="adb_hosts.txt"

if [[ ! -f "$ADB_LIST_FILE" ]]; then
  echo "❌ No se encontró el archivo $ADB_LIST_FILE"
  exit 1
fi

while read -r ADB_HOST; do
  if [[ -z "$ADB_HOST" ]]; then
    continue
  fi

  echo "🔗 Conectando a $ADB_HOST..."
  adb connect "$ADB_HOST" > /dev/null

  echo "🗑️  Desinstalando $PACKAGE_NAME en $ADB_HOST"
  adb -s "$ADB_HOST" uninstall "$PACKAGE_NAME" || echo "⚠️  No estaba instalado"

done < "$ADB_LIST_FILE"

echo "✅ Desinstalación completada en todos los emuladores"


