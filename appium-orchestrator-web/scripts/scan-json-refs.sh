#!/bin/bash

# JSON References Scanner Script
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

# Array para almacenar resultados
declare -a results
result_count=0

# Función para agregar resultados
add_result() {
    results[result_count]="$1"
    ((result_count++))
}

# Función para extraer keys y valores del JSON
extract_json_data() {
    local file="$1"
    local json_data="$2"
    
    local data_json="[]"
    
    # Usar jq si está disponible
    if command -v jq >/dev/null 2>&1; then
        data_json=$(echo "$json_data" | jq -c 'to_entries | map({key: .key, value: .value})' 2>/dev/null || echo "[]")
    else
        # Fallback: extraer keys y valores con regex y construir JSON array
        local entries=()
        while IFS= read -r line; do
            local key=$(echo "$line" | sed 's/^"\([^"]*\)":\s*\(.*\)$/\1/')
            local value=$(echo "$line" | sed 's/^"\([^"]*\)":\s*\(.*\)$/\2/')
            
            # Remover comas al final de valores
            value=$(echo "$value" | sed 's/,$//')
            
            # Escapar comillas en valores
            value=$(echo "$value" | sed 's/"/\\"/g')
            
            if [[ -n "$key" ]]; then
                entries+=("{\"key\":\"$key\",\"value\":$value}")
            fi
        done < <(echo "$json_data" | grep -o '"[^"]*":\s*[^,]*')
        
        if [[ ${#entries[@]} -gt 0 ]]; then
            data_json="[$(IFS=,; echo "${entries[*]}")]"
        fi
    fi
    
    echo "$data_json"
}

# Función para escanear un archivo JSON específico
scan_json_file() {
    local file="$1"
    local relative_path="${file#$WORKSPACE_DIR/}"
    
    # Verificar que el archivo exista y sea JSON válido
    if [[ ! -f "$file" ]]; then
        return
    fi
    
    # Intentar parsear el JSON
    local json_content
    json_content=$(cat "$file" 2>/dev/null || echo "")
    
    if [[ -z "$json_content" ]]; then
        return
    fi
    
    # Extraer keys y valores del JSON
    local data_json
    data_json=$(extract_json_data "$file" "$json_content")
    
    # Obtener nombre del archivo
    local filename
    filename=$(basename "$file" .json)
    
    # Escapar caracteres especiales para JSON
    filename=$(echo "$filename" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g')
    relative_path=$(echo "$relative_path" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g')
    
    # Obtener tamaño del archivo
    local file_size=0
    if [[ -f "$file" ]]; then
        file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    fi
    
    # Agregar al array de resultados
    local json_result=$(cat << EOF
{
    "filename": "$filename",
    "keys": $data_json,
    "file": "$relative_path",
    "size": $file_size,
    "modified": "$(date -r "$file" -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
    add_result "$json_result"
}

# Función para escanear directorio de page-objects
scan_page_objects_dir() {
    if [[ ! -d "$FULL_PAGE_OBJECTS_DIR" ]]; then
        return
    fi
    
    # Buscar archivos JSON con find
    while IFS= read -r -d '' json_file; do
        if [[ -f "$json_file" ]]; then
            scan_json_file "$json_file"
        fi
    done < <(find "$FULL_PAGE_OBJECTS_DIR" -name "*.json" -type f -print0 2>/dev/null)
}

# Escanear directorio de page-objects
scan_page_objects_dir

# Generar resultado final
if [[ $result_count -eq 0 ]]; then
    echo '{
        "success": true,
        "references": [],
        "summary": {
            "total_references": 0,
            "scanned_directory": "'$PAGE_OBJECTS_DIR'",
            "workspace": "'"$WORKSPACE_DIR"'",
            "branch": "'"$BRANCH_NAME"'",
            "message": "No se encontraron archivos JSON de page-objects"
        }
    }'
else
    # Construir JSON array manualmente  
    printf -v refs_json "["
    for ((i=0; i<result_count; i++)); do
        if [[ $i -gt 0 ]]; then
            printf -v refs_json "%s," "$refs_json"
        fi
        printf -v refs_json "%s%s" "$refs_json" "${results[i]}"
    done
    printf -v refs_json "%s]" "$refs_json"
    
    echo '{
        "success": true,
        "references": '"$refs_json"',
        "summary": {
            "total_references": '$result_count',
            "total_keys": '$(echo "$refs_json" | grep -o '"keys":\[\([^]]*\)\]' | sed 's/"keys":\[\(.*\)\]/\1/' | tr ',' '\n' | wc -l | tr -d ' ')',
            "scanned_directory": "'$PAGE_OBJECTS_DIR'",
            "workspace": "'"$WORKSPACE_DIR"'",
            "branch": "'"$BRANCH_NAME"'",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
        }
    }'
fi

exit 0