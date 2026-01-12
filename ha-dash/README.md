# HA Dash - Kubernetes Deployment

Este directorio contiene la configuración para hostear el proyecto `ha_dash` en Kubernetes con **dos pods separados**: uno para el backend y otro para el frontend, ambos ejecutándose en **modo desarrollo**.

## Características

- **Dos pods separados**: Backend y Frontend en contenedores independientes
- **Modo desarrollo**: Ambos corren en modo dev con hot reload y logs detallados
- **Sin rebuild de imagen**: Usa una imagen base de Node.js que hace git pull y ejecuta el proyecto
- **Configuración por variables de entorno**: URL y token de Home Assistant configurados via Secret/ConfigMap
- **Persistencia de datos**: Base de datos SQLite persistida en un PVC
- **Imagen en Harbor**: La imagen se buildea y se sube a `harbor.finalq.xyz/tools/ha-dash`

## Arquitectura

```
┌─────────────────────┐
│  Frontend Pod       │
│  (Vite Dev Server)  │ ──┐
│  Puerto: 5173       │   │
└─────────────────────┘   │
                          │ Proxy /api/*
┌─────────────────────┐   │
│  Backend Pod        │ ◄─┘
│  (Express + TS)     │
│  Puerto: 4000       │
└─────────────────────┘
```

- **Frontend**: Vite dev server con hot reload, hace proxy de `/api/*` al backend
- **Backend**: Express con TypeScript en modo dev (ts-node-dev), sirve la API en `/api/*`

## Build y Push de la Imagen Docker

### Prerrequisitos

1. Autenticarse en Harbor:
   ```bash
   docker login harbor.finalq.xyz
   ```

2. Tener `docker buildx` configurado (viene con Docker Desktop)

### Build y Push

Usa el script incluido:

```bash
cd ha-dash
./build.sh [TAG] [PLATFORM] [--test|--local]
```

#### Build y Push a Harbor (producción)

```bash
# Build con tag automático (fecha-hora) y push
./build.sh

# Build con tag específico y push
./build.sh v1.0.0

# Build para plataforma específica y push
./build.sh v1.0.0 linux/amd64

# Build multi-arch y push
./build.sh v1.0.0 linux/amd64,linux/arm64
```

#### Build Local para Probar (sin push)

```bash
# Build local con tag automático
./build.sh --local

# Build local con tag específico
./build.sh v1.0.0-test --local

# Build local para plataforma específica
./build.sh test linux/amd64 --local
```

Después del build local, el script te mostrará cómo probar la imagen con `docker run`.

### Actualizar el Deployment

El script **actualiza automáticamente** los `deployment-*.yaml` con el nuevo tag después del push. Se crean backups como `deployment-*.yaml.bak` por si necesitas revertir.

Si prefieres usar un tag específico manualmente, edita los archivos:
- `deployment-backend.yaml`
- `deployment-frontend.yaml`

## Configuración

### 1. Crear el Secret con el token de Home Assistant (fuera del repo)

El `HA_TOKEN` se configura en un Secret que **no está en el repo** por seguridad.

Crea el Secret directamente en Kubernetes:

```bash
kubectl create secret generic ha-dash-secrets \
  --from-literal=HA_TOKEN='tu-long-lived-access-token-aqui' \
  -n ha-dash \
  --dry-run=client -o yaml | kubectl apply -f -
```

Para actualizar el token:

```bash
kubectl create secret generic ha-dash-secrets \
  --from-literal=HA_TOKEN='nuevo-token' \
  -n ha-dash \
  --dry-run=client -o yaml | kubectl apply -f -

# Reiniciar los pods para que tomen el nuevo token
kubectl rollout restart deployment/ha-dash-backend -n ha-dash
kubectl rollout restart deployment/ha-dash-frontend -n ha-dash
```

O editar directamente:

```bash
kubectl edit secret ha-dash-secrets -n ha-dash
```

### 2. Crear el ConfigMap con la URL de Home Assistant (fuera del repo)

El `HA_BASE_URL` se configura en un ConfigMap que **no está en el repo** para mantener la configuración específica del ambiente fuera del control de versiones.

Crea el ConfigMap directamente en Kubernetes:

```bash
kubectl create configmap ha-dash-config \
  --from-literal=HA_BASE_URL='http://homeassistant.local:8123' \
  --from-literal=PORT='4000' \
  -n ha-dash \
  --dry-run=client -o yaml | kubectl apply -f -
```

Para actualizar el `HA_BASE_URL`:

```bash
kubectl create configmap ha-dash-config \
  --from-literal=HA_BASE_URL='http://nueva-url:8123' \
  --from-literal=PORT='4000' \
  -n ha-dash \
  --dry-run=client -o yaml | kubectl apply -f -

# Reiniciar el pod backend para que tome el nuevo valor
kubectl rollout restart deployment/ha-dash-backend -n ha-dash
```

O editar directamente:

```bash
kubectl edit configmap ha-dash-config -n ha-dash
```

### 3. Configurar el repositorio Git (opcional)

Si el repositorio es privado o necesitas cambiar la URL/branch, edita los deployments:

```yaml
env:
  - name: GIT_REPO_URL
    value: "https://github.com/finalquest/ha_dash.git"
  - name: GIT_BRANCH
    value: "main"
```

### 4. Desplegar con ArgoCD

El `application.yaml` ya está configurado en `applications/ha-dash.yaml`. ArgoCD debería sincronizar automáticamente.

O manualmente:

```bash
kubectl apply -k .
```

## Cómo funciona

### Backend Pod

1. El pod inicia con la imagen `harbor.finalq.xyz/tools/ha-dash`
2. El script `entrypoint-backend.sh` se ejecuta:
   - Hace git clone/pull del repositorio
   - Instala dependencias del servidor (`npm install`)
   - Ejecuta migraciones de base de datos (si es necesario)
   - Inicia el servidor en modo dev (`npm run dev` con ts-node-dev)
3. El servidor se ejecuta en el puerto 4000
4. La base de datos SQLite se persiste en `/data/app.db` (PVC)
5. Logs en tiempo real con hot reload

### Frontend Pod

1. El pod inicia con la imagen `harbor.finalq.xyz/tools/ha-dash`
2. El script `entrypoint-frontend.sh` se ejecuta:
   - Hace git clone/pull del repositorio
   - Instala dependencias del frontend (`npm install`)
   - Configura `VITE_BACKEND_URL` para apuntar al backend
   - Inicia Vite dev server (`npm run dev`)
3. El frontend se ejecuta en el puerto 5173
4. Vite hace proxy de `/api/*` al backend automáticamente
5. Hot reload activo para desarrollo

## Variables de entorno

### Backend

- `HA_BASE_URL`: URL de Home Assistant (ConfigMap)
- `HA_TOKEN`: Token de acceso de Home Assistant (Secret)
- `PORT`: Puerto del servidor (default: 4000, ConfigMap)
- `DATABASE_URL`: URL de la base de datos SQLite (default: sqlite:///data/app.db)
- `GIT_REPO_URL`: URL del repositorio Git (deployment)
- `GIT_BRANCH`: Branch a usar (default: main, deployment)
- `PROJECT_DIR`: Directorio donde clonar el proyecto (default: /app/project)

### Frontend

- `GIT_REPO_URL`: URL del repositorio Git (deployment)
- `GIT_BRANCH`: Branch a usar (default: main, deployment)
- `PROJECT_DIR`: Directorio donde clonar el proyecto (default: /app/project)
- `VITE_BACKEND_URL`: URL del backend (default: http://ha-dash-backend:4000)
- `VITE_HOST`: Host para Vite (default: 0.0.0.0)
- `VITE_PORT`: Puerto para Vite (default: 5173)

## Acceso

### Servicios

- **Backend**: `ha-dash-backend:4000` (solo dentro del cluster)
- **Frontend**: `ha-dash-frontend:80` (mapea al puerto 5173 del contenedor)

### Desde fuera del cluster

Para acceder desde fuera del cluster, crea un Ingress o usa port-forward:

```bash
# Port-forward del frontend
kubectl port-forward -n ha-dash svc/ha-dash-frontend 5173:80

# Port-forward del backend (si necesitas acceder directamente)
kubectl port-forward -n ha-dash svc/ha-dash-backend 4000:4000
```

Luego accede a:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000/api/health

## Logs

Ver logs de ambos pods:

```bash
# Logs del backend
kubectl logs -f deployment/ha-dash-backend -n ha-dash

# Logs del frontend
kubectl logs -f deployment/ha-dash-frontend -n ha-dash

# Logs de ambos en paralelo
kubectl logs -f deployment/ha-dash-backend deployment/ha-dash-frontend -n ha-dash
```

## Troubleshooting

### El backend no inicia

```bash
# Ver logs
kubectl logs deployment/ha-dash-backend -n ha-dash

# Verificar que el secret existe
kubectl get secret ha-dash-secrets -n ha-dash

# Verificar que el configmap existe
kubectl get configmap ha-dash-config -n ha-dash
```

### El frontend no puede conectar al backend

```bash
# Verificar que el service del backend existe
kubectl get svc ha-dash-backend -n ha-dash

# Verificar conectividad desde el pod frontend
kubectl exec -it deployment/ha-dash-frontend -n ha-dash -- curl http://ha-dash-backend:4000/api/health
```

### Error de migraciones

Las migraciones se ejecutan automáticamente cuando el backend inicia. Si fallan:

```bash
# Ver logs detallados
kubectl logs deployment/ha-dash-backend -n ha-dash | grep -i migra

# Verificar permisos del PVC
kubectl describe pvc ha-dash-data -n ha-dash
```

## Estructura de archivos

```
ha-dash/
├── Dockerfile                    # Imagen base con Node.js y git
├── entrypoint.sh                 # Entrypoint original (compatibilidad)
├── entrypoint-backend.sh         # Entrypoint para backend en modo dev
├── entrypoint-frontend.sh        # Entrypoint para frontend en modo dev
├── build.sh                      # Script para buildear y pushear imagen
├── namespace.yaml                # Namespace ha-dash
├── deployment-backend.yaml        # Deployment del backend
├── deployment-frontend.yaml       # Deployment del frontend
├── service-backend.yaml         # Service del backend
├── service-frontend.yaml         # Service del frontend
├── pvc.yaml                      # PVC para base de datos SQLite
├── kustomization.yaml            # Kustomize para aplicar todo
├── configmap.yaml                # Template (crear externamente)
├── secret.yaml                   # Template (crear externamente)
└── README.md                     # Esta documentación
```
