#!/bin/bash
set -euo pipefail

# Script para buildear y pushear la imagen de ha-dash a Harbor
# Uso:
#   ./build.sh [TAG] [PLATFORM] [--test|--local]
#   ./build.sh                    # Build y push con tag automático
#   ./build.sh v1.0.0             # Build y push con tag específico
#   ./build.sh v1.0.0 linux/amd64 --test  # Build local sin push para probar
#   ./build.sh --local            # Build local con tag automático

# Configuración
IMAGE_NAME="harbor.finalq.xyz/tools/ha-dash"

# Parsear argumentos
TAG=""
PLATFORM="linux/amd64"
MODE="push"  # push o load (local)
NO_CACHE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --test|--local)
            MODE="load"
            shift
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        *)
            if [ -z "$TAG" ]; then
                TAG="$1"
            elif [ "$PLATFORM" = "linux/amd64" ]; then
                PLATFORM="$1"
            fi
            shift
            ;;
    esac
done

# Si no se especificó tag, generar uno automático
if [ -z "$TAG" ]; then
    TAG="$(date +%Y-%m-%d-%H%M%S)"
fi

# Si es modo local, usar un nombre de imagen local
if [ "$MODE" = "load" ]; then
    IMAGE_NAME="ha-dash:${TAG}"
fi

echo "🔨 Building image: ${IMAGE_NAME}"
echo "📦 Platform: ${PLATFORM}"
echo "🚀 Mode: ${MODE}"

# Asegurarse de tener buildx configurado
# Simplificar: usar el builder activo o crear uno nuevo si es necesario
echo "📦 Configuring buildx..."

# Verificar si hay un builder activo
CURRENT_BUILDER=$(docker buildx ls 2>/dev/null | grep '^\*' | awk '{print $1}' | head -1 || echo "")

if [ -n "$CURRENT_BUILDER" ] && [ "$CURRENT_BUILDER" != "NAME" ]; then
    echo "✅ Using current builder: ${CURRENT_BUILDER}"
else
    # Intentar usar cualquier builder disponible
    FIRST_BUILDER=$(docker buildx ls 2>/dev/null | grep -v "^NAME" | grep -v "^\*" | awk '{print $1}' | head -1 || echo "")
    
    if [ -n "$FIRST_BUILDER" ]; then
        echo "📦 Activating builder: ${FIRST_BUILDER}"
        docker buildx use "${FIRST_BUILDER}" 2>/dev/null || echo "⚠️  Could not activate, will try to use default"
    else
        # Si no hay builders, crear uno nuevo (solo si realmente no existe ninguno)
        echo "📦 No builders found, Docker buildx will use default"
    fi
fi

# Build según el modo
if [ "$MODE" = "load" ]; then
    # Build local y cargar en Docker local para probar
    echo "🔧 Building locally (no push)..."
    if [ -n "$NO_CACHE" ]; then
        echo "⚠️  Building without cache..."
    fi
    docker buildx build \
      --platform "${PLATFORM}" \
      ${NO_CACHE} \
      -t "${IMAGE_NAME}" \
      --load \
      .
    
    echo "✅ Image built locally: ${IMAGE_NAME}"
    echo ""
    echo "🧪 Para probar la imagen localmente:"
    echo ""
    echo "   Backend:"
    echo "   docker run --rm -it \\"
    echo "     -e GIT_REPO_URL='https://github.com/finalquest/ha_dash.git' \\"
    echo "     -e GIT_BRANCH='main' \\"
    echo "     -e HA_BASE_URL='http://homeassistant.local:8123' \\"
    echo "     -e HA_TOKEN='tu-token-aqui' \\"
    echo "     -e DATABASE_URL='sqlite:///data/app.db' \\"
    echo "     -v /tmp/ha-dash-test:/data \\"
    echo "     -p 4000:4000 \\"
    echo "     ${IMAGE_NAME} \\"
    echo "     /entrypoint-backend.sh"
    echo ""
    echo "   Frontend:"
    echo "   docker run --rm -it \\"
    echo "     -e GIT_REPO_URL='https://github.com/finalquest/ha_dash.git' \\"
    echo "     -e GIT_BRANCH='main' \\"
    echo "     -e VITE_BACKEND_URL='http://host.docker.internal:4000' \\"
    echo "     -p 5173:5173 \\"
    echo "     ${IMAGE_NAME} \\"
    echo "     /entrypoint-frontend.sh"
    echo ""
    echo "📝 Para pushear después de probar, ejecuta:"
    echo "   ./build.sh ${TAG} ${PLATFORM}"
else
    # Build y push a Harbor
    if [ -n "$NO_CACHE" ]; then
        echo "🔧 Building without cache..."
    fi
    docker buildx build \
      --platform "${PLATFORM}" \
      ${NO_CACHE} \
      -t "${IMAGE_NAME}:${TAG}" \
      -t "${IMAGE_NAME}:latest" \
      --push \
      .
    
    echo "✅ Image pushed successfully: harbor.finalq.xyz/tools/ha-dash:${TAG}"
    
    # Actualizar deployments con el nuevo tag
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    DEPLOYMENT_FILES=("deployment-backend.yaml" "deployment-frontend.yaml")
    
    for DEPLOYMENT_FILE in "${DEPLOYMENT_FILES[@]}"; do
        DEPLOYMENT_PATH="${SCRIPT_DIR}/${DEPLOYMENT_FILE}"
        
        if [ -f "${DEPLOYMENT_PATH}" ]; then
            # Backup del archivo original
            cp "${DEPLOYMENT_PATH}" "${DEPLOYMENT_PATH}.bak"
            
            # Actualizar la línea de la imagen
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS usa sed con sintaxis diferente
                sed -i '' "s|image: harbor.finalq.xyz/tools/ha-dash:.*|image: harbor.finalq.xyz/tools/ha-dash:${TAG}|g" "${DEPLOYMENT_PATH}"
            else
                # Linux
                sed -i "s|image: harbor.finalq.xyz/tools/ha-dash:.*|image: harbor.finalq.xyz/tools/ha-dash:${TAG}|g" "${DEPLOYMENT_PATH}"
            fi
            
            echo "✅ Updated ${DEPLOYMENT_FILE} with tag: ${TAG}"
            echo "💾 Backup saved as: ${DEPLOYMENT_FILE}.bak"
        else
            echo "⚠️  Warning: ${DEPLOYMENT_PATH} not found, skipping update"
        fi
    done
    
    echo ""
    echo "🚀 Para desplegar en Kubernetes:"
    echo "   kubectl apply -k ha-dash/"
    echo ""
    echo "📊 Ver logs:"
    echo "   kubectl logs -f deployment/ha-dash-backend -n ha-dash"
    echo "   kubectl logs -f deployment/ha-dash-frontend -n ha-dash"
    echo ""
    echo "🌐 Acceder:"
    echo "   kubectl port-forward -n ha-dash svc/ha-dash-frontend 5173:80"
    echo "   Luego abre: http://localhost:5173"
fi
