#!/bin/bash

# Step Scanner Script - Versión mejorada para manejar steps multilínea
# Escanea step definitions JavaScript en un workspace local

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

# Directorios comunes donde se encuentran los step definitions
STEP_DIRS=(
    "test/steps-definitions"
    "src/tests"
)

# Array para almacenar resultados
declare -a results
result_count=0

# Función para agregar resultados
add_result() {
    results[result_count]="$1"
    ((result_count++))
}

# Función para escanear un directorio específico
scan_directory() {
    local dir="$1"
    local full_path="${WORKSPACE_DIR}/${dir}"
    
    if [[ ! -d "$full_path" ]]; then
        return
    fi
    
    # Buscar archivos JavaScript con step definitions
    while IFS= read -r -d '' js_file; do
        if [[ -f "$js_file" ]]; then
            scan_file "$js_file" "$dir"
        fi
    done < <(find "$full_path" -name "*.js" -type f -print0 2>/dev/null)
}

# Función para extraer texto entre comillas
extract_quoted_text() {
    local text="$1"
    
    # Intentar primero con ripgrep (más rápido y preciso)
    if command -v rg >/dev/null 2>&1; then
        # Usar ripgrep con PCRE2 para extraer texto entre comillas (soporta comillas simples y dobles)
        local result=$(echo "$text" | rg -o --pcre2 "(?<=['\"])[^'\"]*(?=['\"])" 2>/dev/null | head -1 || echo "")
        if [[ -n "$result" ]]; then
            echo "$result"
            return
        fi
    fi
    
    # Fallback a sed si ripgrep no está disponible
    echo "$text" | sed -n "s/^[^\"']*['\"']\\([^\"']*\\)['\"'].*/\\1/p" | head -1
}

# Función para escanear un archivo específico
scan_file() {
    local file="$1"
    local relative_dir="$2"
    local relative_path="${file#$WORKSPACE_DIR/}"
    
    # Buscar líneas que contengan patrones de step definitions usando ripgrep
    local grep_result=$(rg -n "Given\(|When\(|Then\(|And\(|But\(" "$file" 2>/dev/null || true)
    
    while IFS= read -r line; do
        local line_number="${line%%:*}"
        local line_content="${line#*:}"
        
        # Extraer el tipo de step
        local step_type=""
        if [[ "$line_content" =~ Given ]]; then
            step_type="Given"
        elif [[ "$line_content" =~ When ]]; then
            step_type="When"
        elif [[ "$line_content" =~ Then ]]; then
            step_type="Then"
        elif [[ "$line_content" =~ And ]]; then
            step_type="And"
        elif [[ "$line_content" =~ But ]]; then
            step_type="But"
        fi
        
        # Solo procesar si encontramos un tipo válido
        if [[ -n "$step_type" ]]; then
            # Extraer el texto del step (entre comillas)
            local step_text=""
            step_text=$(extract_quoted_text "$line_content")
            
            # Si no encontramos texto, podría ser multilínea - leer más líneas
            if [[ -z "$step_text" ]]; then
                # Leer las siguientes líneas para encontrar el texto completo
                local current_line="$line_number"
                local full_content="$line_content"
                
                # Leer hasta 10 líneas adicionales para encontrar las comillas de cierre
                for ((i=1; i<=10; i++)); do
                    local next_line=$((current_line + i))
                    local next_content=$(sed -n "${next_line}p" "$file" 2>/dev/null || echo "")
                    full_content="$full_content"$'\n'"$next_content"
                    
                    # Intentar extraer el texto nuevamente
                    step_text=$(extract_quoted_text "$full_content")
                    if [[ -n "$step_text" ]]; then
                        break
                    fi
                done
            fi
            
            # Extraer parámetros si existen
            local parameters=""
            if [[ "$step_text" =~ \{([^}]+)\} ]]; then
                parameters="${BASH_REMATCH[1]}"
            fi
            
            # Escapar caracteres especiales para JSON
            step_text=$(echo "$step_text" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g')
            line_content=$(echo "$line_content" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g')
            
            # Agregar al array de resultados
            local json_result=$(cat << EOF
{
    "type": "$step_type",
    "text": "$step_text",
    "file": "$file_path",
    "line": $line_number,
    "parameters": "$parameters",
    "raw": "$line_content"
}
EOF
)
            add_result "$json_result"
        fi
    done < <(echo "$grep_result")
}

# Escanear todos los directorios de step definitions
for step_dir in "${STEP_DIRS[@]}"; do
    scan_directory "$step_dir"
done

# Generar resultado final
if [[ $result_count -eq 0 ]]; then
    echo '{
        "success": true,
        "steps": [],
        "summary": {
            "total_steps": 0,
            "scanned_directories": "'${#STEP_DIRS[@]}'",
            "workspace": "'"$WORKSPACE_DIR"'",
            "branch": "'"$BRANCH_NAME"'",
            "message": "No se encontraron step definitions en los directorios escaneados"
        }
    }'
else
    # Construir JSON array manualmente  
    printf -v steps_json "["
    for ((i=0; i<result_count; i++)); do
        if [[ $i -gt 0 ]]; then
            printf -v steps_json "%s," "$steps_json"
        fi
        printf -v steps_json "%s%s" "$steps_json" "${results[i]}"
    done
    printf -v steps_json "%s]" "$steps_json"
    
    # Contar por tipo
    given_count=$(echo "$steps_json" | grep -o '"type": "Given"' | wc -l | tr -d ' ')
    when_count=$(echo "$steps_json" | grep -o '"type": "When"' | wc -l | tr -d ' ')
    then_count=$(echo "$steps_json" | grep -o '"type": "Then"' | wc -l | tr -d ' ')
    
    echo '{
        "success": true,
        "steps": '"$steps_json"',
        "summary": {
            "total_steps": '"$result_count"',
            "given_steps": '"$given_count"',
            "when_steps": '"$when_count"',
            "then_steps": '"$then_count"',
            "scanned_directories": "'${#STEP_DIRS[@]}'",
            "workspace": "'"$WORKSPACE_DIR"'",
            "branch": "'"$BRANCH_NAME"'",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
        }
    }'
fi

exit 0