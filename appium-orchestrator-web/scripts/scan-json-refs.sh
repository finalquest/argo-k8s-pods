#!/bin/bash

# JSON References Scanner Script - Optimized Version
# Scans JSON reference files in test/page-objects directory

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo}"
BRANCH_NAME="${2:?Debe especificar el nombre de la branch}"

# === VALIDACIONES ===
if [[ ! -d "$WORKSPACE_DIR" ]]; then
    echo '{"error": "Workspace directory does not exist", "path": "'"$WORKSPACE_DIR"'"}'
    exit 1
fi

if [[ ! -d "${WORKSPACE_DIR}/.git" ]]; then
    echo '{"error": "Not a git repository", "path": "'"$WORKSPACE_DIR"'"}'
    exit 1
fi

# Directorio de page-objects
PAGE_OBJECTS_DIR="test/page-objects"
FULL_PAGE_OBJECTS_DIR="${WORKSPACE_DIR}/${PAGE_OBJECTS_DIR}"

# Verificar si jq está disponible para mejor rendimiento
USE_JQ=false
if command -v jq >/dev/null 2>&1; then
    USE_JQ=true
fi

# Variable para acumular resultados
RESULTS_JSON="["
TOTAL_KEYS=0
FILE_COUNT=0

# Función para escanear un archivo JSON específico
scan_json_file() {
    local file="$1"
    local relative_path="${file#$WORKSPACE_DIR/}"

    if [[ ! -f "$file" ]]; then
        return
    fi

    # Obtener metadatos del archivo de forma eficiente
    local filename=$(basename "$file" .json)
    local file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
    local modified=$(date -r "$file" -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

    # Escapar caracteres especiales
    filename=$(printf '%s' "$filename" | sed 's/\\/\\\\/g; s/"/\\"/g')
    relative_path=$(printf '%s' "$relative_path" | sed 's/\\/\\\\/g; s/"/\\"/g')

    # Extraer datos JSON de manera eficiente
    local keys_json="[]"
    local key_count=0

    if [[ "$USE_JQ" == true ]]; then
        # Usar jq para extracción rápida y eficiente
        keys_json=$(jq -c 'to_entries | map({key: .key, value: .value})' "$file" 2>/dev/null || echo "[]")
        key_count=$(jq 'length' "$file" 2>/dev/null || echo "0")
    else
        # Fallback más eficiente usando Node.js si está disponible
        if command -v node >/dev/null 2>&1; then
            keys_json=$(node -e "
                try {
                    const data = require('$file');
                    const entries = Object.entries(data).map(([key, value]) => ({key, value}));
                    console.log(JSON.stringify(entries));
                } catch(e) {
                    console.log('[]');
                }
            " 2>/dev/null || echo "[]")
            key_count=$(node -e "
                try {
                    const data = require('$file');
                    console.log(Object.keys(data).length);
                } catch(e) {
                    console.log('0');
                }
            " 2>/dev/null || echo "0")
        else
            # Último recurso - extracción simple con grep pero más eficiente
            local temp_file=$(mktemp)
            grep -o '"[^"]*":\s*[^,]*' "$file" > "$temp_file"
            key_count=$(wc -l < "$temp_file" 2>/dev/null || echo "0")

            # Construir JSON de forma más eficiente
            local entries=()
            while IFS= read -r line; do
                local key=$(echo "$line" | sed -n 's/^"\([^"]*\)":\s*.*$/\1/p')
                local value=$(echo "$line" | sed -n 's/^"[^"]*":\s*\(.*\)$/\1/p')
                if [[ -n "$key" ]]; then
                    value=$(echo "$value" | sed 's/,$//; s/"/\\"/g')
                    entries+=("{\"key\":\"$key\",\"value\":$value}")
                fi
            done < "$temp_file"

            if [[ ${#entries[@]} -gt 0 ]]; then
                IFS=, eval 'keys_json="[${entries[*]}]"'
            fi
            rm -f "$temp_file"
        fi
    fi

    # Agregar al resultado
    if [[ "$FILE_COUNT" -gt 0 ]]; then
        RESULTS_JSON="$RESULTS_JSON,"
    fi

    RESULTS_JSON="$RESULTS_JSON{
        \"filename\": \"$filename\",
        \"keys\": $keys_json,
        \"file\": \"$relative_path\",
        \"size\": $file_size,
        \"modified\": \"$modified\"
    }"

    TOTAL_KEYS=$((TOTAL_KEYS + key_count))
    FILE_COUNT=$((FILE_COUNT + 1))
}

# Función para escanear directorio de page-objects
scan_page_objects_dir() {
    if [[ ! -d "$FULL_PAGE_OBJECTS_DIR" ]]; then
        return
    fi

    # Buscar archivos JSON de forma más eficiente
    local json_files=()
    while IFS= read -r -d '' json_file; do
        json_files+=("$json_file")
    done < <(find "$FULL_PAGE_OBJECTS_DIR" -name "*.json" -type f -print0 2>/dev/null)

    # Procesar archivos en lotes para mejor rendimiento
    for json_file in "${json_files[@]}"; do
        scan_json_file "$json_file"
    done
}

# Escanear directorio de page-objects
scan_page_objects_dir

# Generar resultado final
RESULTS_JSON="$RESULTS_JSON]"

cat << EOF
{
    "success": true,
    "references": $RESULTS_JSON,
    "summary": {
        "total_references": $FILE_COUNT,
        "total_keys": $TOTAL_KEYS,
        "scanned_directory": "$PAGE_OBJECTS_DIR",
        "workspace": "$WORKSPACE_DIR",
        "branch": "$BRANCH_NAME",
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
}
EOF