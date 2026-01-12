#!/bin/bash
set -euo pipefail

# Variables de entorno requeridas
GIT_REPO_URL=${GIT_REPO_URL:-}
GIT_BRANCH=${GIT_BRANCH:-main}
PROJECT_DIR=${PROJECT_DIR:-/app/project}
VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://ha-dash-backend:4000}

# Validar que GIT_REPO_URL esté configurado
if [ -z "$GIT_REPO_URL" ]; then
    echo "Error: GIT_REPO_URL no está configurado"
    exit 1
fi

echo "Clonando/pull del repositorio: $GIT_REPO_URL (branch: $GIT_BRANCH)"

# Configurar Git para no pedir credenciales en repos públicos
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/echo
git config --global credential.helper ""
git config --global init.defaultBranch main

# Configurar autenticación Git solo si está disponible (para repos privados)
GIT_PAT=${GIT_PAT:-}

# Si hay PAT, configurar para usar HTTPS con token
if [ -n "$GIT_PAT" ]; then
    echo "Configurando autenticación con PAT..."
    GIT_URL_CLEAN=$(echo "$GIT_REPO_URL" | sed 's|https://.*@|https://|' | sed 's|http://.*@|http://|')
    if echo "$GIT_URL_CLEAN" | grep -q "^https://"; then
        GIT_REPO_URL_WITH_AUTH=$(echo "$GIT_URL_CLEAN" | sed "s|https://|https://${GIT_PAT}@|")
        GIT_REPO_URL="$GIT_REPO_URL_WITH_AUTH"
    fi
fi

# Si el directorio ya existe, hacer pull, sino clonar
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "El repositorio ya existe, haciendo pull..."
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard "origin/$GIT_BRANCH"
    git clean -fd
else
    echo "Clonando repositorio..."
    mkdir -p "$PROJECT_DIR"
    git clone -b "$GIT_BRANCH" "$GIT_REPO_URL" "$PROJECT_DIR"
fi

cd "$PROJECT_DIR/frontend"

echo "Instalando dependencias del frontend..."
npm install

echo "Configurando VITE_BACKEND_URL: ${VITE_BACKEND_URL}"
export VITE_BACKEND_URL

echo "Iniciando frontend en modo dev..."
exec npm run dev
