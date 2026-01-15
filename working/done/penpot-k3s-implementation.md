# Penpot en K3s (GitOps con Argo CD) + Penpot MCP (fase 2)
Fecha: 2026-01-08  
Ámbito: **solo red interna** (`*.finalq.xyz`), sync **manual** en Argo CD, imágenes en `harbor.finalq.xyz`, PVC con `local-path`.

Este documento define:
- **Fase 1**: levantar **Penpot** (con Postgres + Redis/Valkey en el mismo “paquete” del servicio).
- **Fase 2**: agregar **Penpot MCP** (plugin server + MCP server) y conectarlo con **Codex local**.

> Penpot requiere **PostgreSQL** y **Redis** para correr. citeturn0search18turn0search10  
> El repo oficial de Helm charts de Penpot se agrega con `helm repo add penpot https://helm.penpot.app/`. citeturn0search15  
> El MCP oficial de Penpot se levanta con `npm run bootstrap` (instala/build/arranca) y expone plugin+MCP; además menciona restricciones de conectividad de navegador (PNA) cuando se conecta a `localhost`. citeturn0search2

---

## 0) Estructura propuesta del repo (convención “paquete autosuficiente”)

Creamos un servicio `penpot/` como **chart umbrella** (Helm) que:
- Trae Penpot como **dependencia** (upstream chart)
- Agrega templates propios para:
  - Ingress para Penpot
  - (Fase 2) Deployment/Service/Ingress de `penpot-mcp`
- Expone un único punto GitOps para Argo (`applications/penpot.yaml`)

Estructura:

```
applications/
  penpot.yaml
penpot/
  Chart.yaml
  Chart.lock                 # generado por helm dependency build
  values.yaml                # values para penpot + mcp
  charts/                    # dependencias descargadas (opcional si preferís lockear)
  templates/
    ingress-penpot.yaml
    mcp-deploy.yaml          # (fase 2) se habilita por values
    mcp-ingress.yaml         # (fase 2)
    NOTES.txt                # opcional
working/
  penpot.md                  # notas operativas, secretos manuales (si aplica)
```

---


---

## 1.0 Namespace del servicio (OBLIGATORIO)

Este proyecto **define su propio namespace** y el manifest **SÍ se versiona** (a diferencia de los Secrets).

Crear el archivo:

`penpot/templates/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: penpot
```

📌 **Notas importantes**
- El namespace **debe existir antes** de que Argo CD sincronice recursos namespaced.
- Si Argo CD tiene permisos para crear namespaces, este manifest alcanza.
- Si no, el namespace debe crearse una sola vez a mano:

```bash
kubectl create namespace penpot
```

Luego Argo CD manejará todo lo que viva dentro de él.


## 1) Fase 1 — Penpot (solo editor)

### 1.1 Dominios internos
Definimos:
- `penpot.finalq.xyz` → UI de Penpot

> El MCP lo vamos a agregar en fase 2 con subdominios separados para evitar líos de browser/CORS.

### 1.2 Prerrequisitos
- Tenés `ingress-nginx` (simple) en el cluster y tu NPM apunta al nodo padre (NodePort o lo que uses).
- StorageClass `local-path` disponible (k3s default).
- Argo CD ya está operando con sync manual.
- **Secrets creados** (ver sección 1.9 - debe ejecutarse antes del deploy).

### 1.3 Crear el “umbrella chart” del servicio
En `penpot/Chart.yaml`:

```yaml
apiVersion: v2
name: penpot-bundle
version: 0.1.0
type: application

dependencies:
  - name: penpot
    version: "1.0.0"    # ⚠️ Verificar versión actual: helm search repo penpot/penpot
    repository: "https://helm.penpot.app/"
    # Nota: En producción, fijar versión específica. Verificar con:
    # helm repo add penpot https://helm.penpot.app/ && helm repo update
    # helm search repo penpot/penpot --versions
```

Repo oficial de charts: `https://helm.penpot.app/`. citeturn0search15

Luego, en tu máquina:
```bash
cd penpot
helm repo add penpot https://helm.penpot.app/
helm repo update
helm dependency build
```

> Esto te genera `Chart.lock` y baja la dependencia a `penpot/charts/` (según configuración).

### 1.4 Values base (Penpot + deps internas)
En `penpot/values.yaml` (fase 1):

```yaml
# ====== Penpot upstream chart values ======
penpot:
  # Dependencias: en tu cluster cada servicio “lleva lo suyo”.
  # En el chart de Penpot, hay soporte para desplegar Postgres y Redis/Valkey como subcharts
  # (la disponibilidad exacta depende de la versión del chart).
  #
  # Ajustá estos flags al nombre real del chart que estés usando:
  global:
    postgresqlEnabled: true
    valkeyEnabled: true

  # Recomendación mínima para tu caso: todo interno, sin TLS obligatorio.
  config:
    publicUri: "http://penpot.finalq.xyz"

  # Persistencia de assets (archivos subidos)
  persistence:
    assets:
      enabled: true
      size: 10Gi
      storageClass: "local-path"

  # Recursos recomendados (ajustar según necesidades)
  resources:
    frontend:
      requests:
        cpu: 500m
        memory: 512Mi
      limits:
        cpu: 2
        memory: 2Gi
    backend:
      requests:
        cpu: 500m
        memory: 512Mi
      limits:
        cpu: 2
        memory: 2Gi

  # Health checks (si el chart los soporta)
  # Verificar con: helm show values penpot/penpot | grep -i health

# ====== Bundled templates (este repo) ======
bundle:
  ingress:
    enabled: true
    className: "nginx"
    host: "penpot.finalq.xyz"

  # Fase 2: apagado por ahora
  mcp:
    enabled: false
```

Notas:
- `config.publicUri` debe coincidir con el host por el que entrás (esto evita errores raros con redirects / API).  
  (Hay varios threads en la comunidad donde el host incorrecto rompe la UI o endpoints).
- Si el chart upstream no usa exactamente `global.postgresqlEnabled/valkeyEnabled`, fijamos el key correcto mirando `helm show values ...` (ver 1.6).

### 1.5 Ingress (template propio)
En `penpot/templates/ingress-penpot.yaml`:

```yaml
{{- if .Values.bundle.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: penpot
spec:
  ingressClassName: {{ .Values.bundle.ingress.className | quote }}
  rules:
    - host: {{ .Values.bundle.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                # OJO: nombre del service del chart upstream puede variar (penpot / penpot-frontend).
                # Ajustar tras instalar mirando: kubectl -n penpot get svc
                service:
                  name: penpot
                  port:
                    number: 80
{{- end }}
```

> En algunos despliegues, Penpot tiene `frontend:80` y `backend:6060`. citeturn0search10  
> En Helm normalmente el Service “frontal” ya rutea al frontend.

### 1.6 Comandos para obtener los values reales del chart upstream (evita sorpresas)
Antes del primer deploy, corré:

```bash
helm repo add penpot https://helm.penpot.app/
helm repo update
helm show values penpot/penpot > /tmp/penpot-upstream-values.yaml
```

Buscá las keys reales de:
- habilitar `postgres`/`redis` como subcharts (puede ser `postgresql.enabled`, `redis.enabled`, o `global.postgresqlEnabled`)
- naming del service (puede ser `penpot`, `penpot-frontend`, o similar)
- config `publicUri` (puede estar en `config.publicUri` o `penpot.config.publicUri`)
- persistence de assets (puede ser `persistence.assets` o `storage.assets`)
- recursos (puede ser `resources` o `frontend.resources` / `backend.resources`)
- health checks (puede ser `livenessProbe` / `readinessProbe` o similar)

**Ejemplo de valores comunes encontrados:**
```yaml
# Si el chart usa estructura plana:
postgresql:
  enabled: true
redis:
  enabled: true

# O si usa estructura anidada:
penpot:
  config:
    publicUri: "http://penpot.finalq.xyz"
  persistence:
    enabled: true
```

### 1.7 Namespace + Argo CD Application
#### Namespace
En tu repo, si ya manejás namespaces dentro de cada servicio, agregá:

`penpot/templates/namespace.yaml` (opcional, si no lo creás fuera):
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: penpot
```

#### Application (Argo CD)
En `applications/penpot.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: penpot
  namespace: argocd
spec:
  project: default
  source:
    repoURL: <TU_REPO_GIT_URL>
    targetRevision: main
    path: penpot
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: penpot
  syncPolicy:
    automated: null
```

> Sync manual: vos hacés commit/push y luego “Sync” en Argo.

### 1.8 Verificación de Secrets (antes del deploy)
⚠️ **IMPORTANTE**: Los Secrets deben estar creados antes del primer sync.

Verificá que existan:
```bash
kubectl -n penpot get secrets
```

Deberías ver:
- `penpot-postgres` (o el nombre que espera el chart)
- `penpot-redis` (si Redis requiere auth)
- `penpot-smtp` (opcional)

Si faltan, ver sección 1.9 para crearlos.

### 1.9 Deploy (fase 1)
1) Commit + push del servicio y Application.
2) En Argo CD: Sync `penpot`.

Validación:
```bash
# Verificar que los pods estén Running
kubectl -n penpot get pods
kubectl -n penpot get pods -w  # watch mode para ver el progreso

# Verificar servicios
kubectl -n penpot get svc

# Verificar ingress
kubectl -n penpot get ingress

# Verificar logs si hay problemas
kubectl -n penpot logs -l app=penpot --tail=50
```

Desde tu LAN:
- Abrí `http://penpot.finalq.xyz`
- Creá una cuenta de prueba
- Verificá que puedas crear un archivo nuevo

### 1.10 Backups (consideraciones)
PostgreSQL requiere backups periódicos. Opciones:

1. **Backup manual** (usando kubectl exec):
```bash
kubectl -n penpot exec -it <postgres-pod> -- pg_dump -U penpot penpot > backup-$(date +%Y%m%d).sql
```

2. **Backup automatizado** (recomendado):
   - Usar un CronJob de K8s que ejecute `pg_dump` periódicamente
   - Guardar backups en un PVC compartido o subirlos a un storage externo
   - Considerar usar herramientas como `k8up` o `velero` para backups completos del namespace

3. **Assets** (archivos subidos):
   - Los assets están en el PVC de `local-path`
   - Considerar backup del PVC completo o rsync periódico

---

## 2) Fase 2 — Penpot MCP (plugin server + MCP server)

Objetivo:
- Correr `penpot-mcp` en K3s (interno).
- Exponer:
  - `penpot-plugin.finalq.xyz` → sirve `manifest.json` del plugin
  - `penpot-mcp.finalq.xyz` → endpoint MCP (HTTP “streamable”) y/o SSE
- Conectar plugin dentro de Penpot apuntando al server interno.
- Conectar Codex (local) al MCP.

> Repo oficial: `penpot/penpot-mcp`. citeturn0search2  
> El repo indica levantar ambos servers con `npm run bootstrap`. citeturn0search2  
> En threads de comunidad se menciona el manifest en `...:4400/manifest.json` (para carga del plugin). citeturn0search14

### 2.1 Decisión de arquitectura (según tu requisito)
- **Deployment separado** (`penpot-mcp`) dentro del **mismo servicio GitOps** (mismo Application), usando el umbrella chart.
- **No** sidecar “mismo Pod que Penpot” (porque pediste Deployment separado).  
  Esto sigue cumpliendo “todo vive dentro del mismo paquete / Application”.

### 2.2 Dockerfile del MCP (en este repo) + buildx
Creamos un directorio (si querés mantener el código del MCP como submodule, también sirve; pero acá lo hacemos “clone en build” para simplificar):

`penpot-mcp-image/Dockerfile` (nuevo directorio del repo, o dentro de `penpot/` si preferís):

```dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Instalar dependencias necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Clonar repo con tag específico (recomendado) o usar commit SHA
# Opción 1: Tag específico (recomendado para producción)
ARG MCP_VERSION=v1.0.0
RUN git clone --depth 1 --branch ${MCP_VERSION} https://github.com/penpot/penpot-mcp.git . || \
    git clone --depth 1 https://github.com/penpot/penpot-mcp.git .

# Opción 2: Commit SHA específico (más control)
# ARG MCP_COMMIT=abc123def456...
# RUN git clone https://github.com/penpot/penpot-mcp.git . && \
#     git checkout ${MCP_COMMIT}

# Build e instalar dependencias
RUN npm run bootstrap || (npm install && npm run build)

FROM node:20-bookworm-slim
WORKDIR /app

# Copiar solo lo necesario (mejor para cacheo)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/src ./src

ENV NODE_ENV=production
ENV PLUGIN_PORT=4400
ENV MCP_PORT=4401

# Health check (si el repo lo soporta)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4400/manifest.json || exit 1

EXPOSE 4400 4401
CMD ["npm","run","start:all"]
```

**Notas del Dockerfile:**
- Usar tag específico (`MCP_VERSION`) en lugar de `--depth 1` sin tag para mejor reproducibilidad
- Alternativamente, usar commit SHA para control total
- Health check agregado para verificar que el servicio responde
- Mejor estructura de layers para cacheo de Docker

- El repo oficial usa `npm run bootstrap` para instalar/build/arrancar. citeturn0search2

#### Buildx (Mac ARM → Linux)
Usá `buildx` para generar imagen linux y pushearla a Harbor:

```bash
# (una vez) asegurate de tener builder
docker buildx create --name multi --use || docker buildx use multi

# build + push (tag fijo)
docker buildx build \
  --platform linux/amd64 \
  -t harbor.finalq.xyz/tools/penpot-mcp:0.1.0 \
  --push \
  ./penpot-mcp-image
```

> Si tus nodos son ARM64, cambiá plataforma a `linux/arm64` o multiarch (`linux/amd64,linux/arm64`).

### 2.3 Manifests K8s del MCP (templates del umbrella chart)
En `penpot/templates/mcp-deploy.yaml`:

```yaml
{{- if .Values.bundle.mcp.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: penpot-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: penpot-mcp
  template:
    metadata:
      labels:
        app: penpot-mcp
    spec:
      containers:
        - name: penpot-mcp
          image: {{ .Values.bundle.mcp.image | quote }}
          imagePullPolicy: Always
          ports:
            - name: plugin
              containerPort: 4400
            - name: mcp
              containerPort: 4401
          env:
            - name: PLUGIN_PORT
              value: "4400"
            - name: MCP_PORT
              value: "4401"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /manifest.json
              port: 4400
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /manifest.json
              port: 4400
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: penpot-mcp
spec:
  selector:
    app: penpot-mcp
  ports:
    - name: plugin
      port: 4400
      targetPort: 4400
    - name: mcp
      port: 4401
      targetPort: 4401
{{- end }}
```

Ingress: `penpot/templates/mcp-ingress.yaml`

```yaml
{{- if .Values.bundle.mcp.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: penpot-mcp
spec:
  ingressClassName: {{ .Values.bundle.ingress.className | quote }}
  rules:
    - host: {{ .Values.bundle.mcp.pluginHost | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: penpot-mcp
                port:
                  name: plugin
    - host: {{ .Values.bundle.mcp.mcpHost | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: penpot-mcp
                port:
                  name: mcp
{{- end }}
```

Actualizar `penpot/values.yaml` (fase 2):

```yaml
bundle:
  ingress:
    enabled: true
    className: "nginx"
    host: "penpot.finalq.xyz"

  mcp:
    enabled: true
    image: "harbor.finalq.xyz/tools/penpot-mcp:0.1.0"
    pluginHost: "penpot-plugin.finalq.xyz"
    mcpHost: "penpot-mcp.finalq.xyz"
```

### 2.4 Deploy (fase 2)
1) Build + push de imagen con buildx.
2) Commit + push de cambios (Dockerfile + templates + values).
3) Argo CD: Sync `penpot`.

Validación:
```bash
kubectl -n penpot get pods | grep penpot-mcp
kubectl -n penpot get svc  | grep penpot-mcp
kubectl -n penpot get ingress | grep penpot
```

Chequeos HTTP internos:
```bash
# Manifest del plugin
curl -I http://penpot-plugin.finalq.xyz/manifest.json

# Endpoint MCP (streamable)
curl -I http://penpot-mcp.finalq.xyz/mcp
```

### 2.5 Cargar el plugin en Penpot
En Penpot (web, `penpot.finalq.xyz`):
- Abrí un archivo (file).
- Abrí el Plugin Manager y cargá un plugin desde URL:
  - `http://penpot-plugin.finalq.xyz/manifest.json`

La comunidad referencia este patrón (manifest bajo `/manifest.json` del plugin server). citeturn0search14

> Nota de compatibilidad: si usás Chromium moderno y tenés bloqueos de red privada (PNA) al conectar a “otro origen”, preferí usar **mismo dominio base** (`*.finalq.xyz`) como hicimos. El repo de MCP advierte sobre PNA cuando se intenta conectar a `localhost` desde otro origen. citeturn0search2

### 2.6 Conectar Codex (local) al Penpot MCP

**Importante**: Codex corre en tu Mac local, pero el MCP está en la red interna del cluster. Tenés dos opciones:

#### Opción 1: Acceso directo (si tu Mac está en la misma red)
Si tu Mac puede resolver `penpot-mcp.finalq.xyz` (DNS interno o `/etc/hosts`):

En tu Mac, editá `~/.codex/config.toml` y agregá:

```toml
[mcp_servers.penpot]
url = "http://penpot-mcp.finalq.xyz/mcp"
```

#### Opción 2: Port-forward (si no tenés acceso directo a la red interna)
Si tu Mac no puede acceder directamente a `penpot-mcp.finalq.xyz`:

1. **Port-forward del servicio MCP:**
```bash
kubectl -n penpot port-forward svc/penpot-mcp 4401:4401
```

2. **Configurar Codex para usar localhost:**
En `~/.codex/config.toml`:
```toml
[mcp_servers.penpot]
url = "http://localhost:4401/mcp"
```

3. **Mantener el port-forward activo** mientras usás Codex (o usar un script/tool para mantenerlo corriendo).

#### Verificación
Luego, en Codex:
- Verificá que el server aparezca como conectado (en el TUI suele haber comando `/mcp` o `/mcp list`).
- Probá hacer una query que use el MCP de Penpot para confirmar conectividad.

---


---

## 1.11 Creación de Secrets (OBLIGATORIO – fuera de Git)

⚠️ **Regla del repo**  
Los **Secrets NUNCA se versionan**. Siempre se crean **a mano con `kubectl`**.  
Este servicio **no es la excepción**.

Penpot necesita credenciales para:
- PostgreSQL
- Redis/Valkey
- (opcional) SMTP / email

> El chart de Penpot **espera Secrets existentes** si no usás valores por defecto.
> Estos comandos deben ejecutarse **antes del primer Sync en Argo CD**.

---

### 1.11.1 PostgreSQL

Namespace:
```bash
kubectl create namespace penpot || true
```

Secret de Postgres:
```bash
kubectl -n penpot create secret generic penpot-postgres   --from-literal=POSTGRES_DB=penpot   --from-literal=POSTGRES_USER=penpot   --from-literal=POSTGRES_PASSWORD=<PASSWORD_SEGURA>
```

📌 **Notas**
- El nombre del secret debe coincidir con el esperado por el chart upstream.
- Si el chart usa otro nombre (ej: `penpot-postgresql`), ajustarlo en `values.yaml`.

---

### 1.11.2 Redis / Valkey

Si Redis requiere auth:

```bash
kubectl -n penpot create secret generic penpot-redis   --from-literal=REDIS_PASSWORD=<PASSWORD_SEGURA>
```

Si Redis **no** usa password, este secret puede omitirse (según values del chart).

---

### 1.11.3 SMTP (opcional, recomendado a futuro)

Si más adelante querés habilitar emails (invitaciones, reset password):

```bash
kubectl -n penpot create secret generic penpot-smtp   --from-literal=SMTP_HOST=smtp.tu-dominio   --from-literal=SMTP_PORT=587   --from-literal=SMTP_USER=penpot@tu-dominio   --from-literal=SMTP_PASSWORD=<PASSWORD_SEGURA>   --from-literal=SMTP_FROM=penpot@tu-dominio
```

---

### 1.11.4 Verificación

Antes de sincronizar en Argo:

```bash
kubectl -n penpot get secrets
```

Deberías ver algo similar a:
```
penpot-postgres
penpot-redis
penpot-smtp   # opcional
```

---

### 1.11.5 Documentación operativa (working/)

En `working/penpot.md` (versionado) documentar **solo**:
- Qué secrets existen
- Qué variables contienen
- Quién los crea
- **Nunca** los valores

Ejemplo:

```
Secrets requeridos:
- penpot-postgres: credenciales DB
- penpot-redis: password Redis
- penpot-smtp: SMTP (opcional)
Creación: kubectl (manual)
```

Esto mantiene el contrato GitOps limpio y reproducible.


## 3) Checklist de tracking (para tu PR / issue)

### Fase 1 — Penpot
- [ ] Verificar versión del chart upstream: `helm search repo penpot/penpot --versions`
- [ ] Crear carpeta `penpot/` (umbrella chart).
- [ ] `Chart.yaml` con dependencia al chart upstream (versión fijada).
- [ ] `helm dependency build` para generar `Chart.lock`.
- [ ] `helm show values penpot/penpot` para verificar estructura de values.
- [ ] `values.yaml` con `publicUri` + persistence (assets) + deps internas + recursos.
- [ ] `templates/namespace.yaml` (opcional si Argo CD puede crearlo).
- [ ] `templates/ingress-penpot.yaml` (host `penpot.finalq.xyz`).
- [ ] Crear Secrets (PostgreSQL, Redis) - ver sección 1.11.
- [ ] `applications/penpot.yaml` (Argo Application, sync manual).
- [ ] Commit + push.
- [ ] Sync en Argo CD.
- [ ] Validar `kubectl -n penpot get pods/svc/ingress`.
- [ ] Verificar logs de pods si hay problemas.
- [ ] Abrir UI: `http://penpot.finalq.xyz`.
- [ ] Crear cuenta de prueba y verificar funcionalidad básica.
- [ ] Configurar backup de PostgreSQL (opcional pero recomendado).

### Fase 2 — Penpot MCP
- [ ] Verificar versión/tag del repo `penpot/penpot-mcp` (usar tag específico en Dockerfile).
- [ ] Crear `penpot-mcp-image/Dockerfile` (Node 20, bootstrap, health checks).
- [ ] Build + push con buildx a `harbor.finalq.xyz/tools/penpot-mcp:0.1.0` (o versión específica).
- [ ] Agregar templates `mcp-deploy.yaml` (con recursos y health checks) + `mcp-ingress.yaml`.
- [ ] Activar `bundle.mcp.enabled=true` en `penpot/values.yaml`.
- [ ] Configurar hosts en `values.yaml`: `pluginHost` y `mcpHost`.
- [ ] Commit + push.
- [ ] Sync en Argo CD.
- [ ] Verificar pod MCP: `kubectl -n penpot get pods | grep penpot-mcp`.
- [ ] Verificar logs: `kubectl -n penpot logs -l app=penpot-mcp`.
- [ ] `curl http://penpot-plugin.finalq.xyz/manifest.json` responde 200/30x.
- [ ] `curl http://penpot-mcp.finalq.xyz/mcp` responde (200/4xx según handshake, pero reachable).
- [ ] Cargar plugin desde Penpot apuntando al manifest (`http://penpot-plugin.finalq.xyz/manifest.json`).
- [ ] Verificar que el plugin aparece en Penpot Plugin Manager.
- [ ] Configurar acceso de Codex al MCP (directo o port-forward) - ver sección 2.6.
- [ ] Configurar `~/.codex/config.toml` con MCP.
- [ ] Validar que Codex vea el server MCP (`/mcp list` o similar).
- [ ] Probar funcionalidad end-to-end: usar Codex para crear algo en Penpot vía MCP.

---

## 4) Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Red Interna (*.finalq.xyz)                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌────▼────┐          ┌─────▼─────┐
   │  NPM    │          │ Ingress │          │  Codex   │
   │ (Proxy) │─────────▶│  Nginx  │          │  (Local)  │
   └─────────┘          └────┬────┘          └─────┬─────┘
                              │                     │
        ┌─────────────────────┼─────────────────────┘
        │                     │
   ┌────▼─────────────────────▼─────┐
   │      Namespace: penpot          │
   │  ┌──────────────────────────┐  │
   │  │  Penpot (Helm Chart)      │  │
   │  │  - Frontend (port 80)    │  │
   │  │  - Backend (port 6060)   │  │
   │  │  - PostgreSQL (subchart) │  │
   │  │  - Redis/Valkey (subchart)│  │
   │  └──────────────────────────┘  │
   │  ┌──────────────────────────┐  │
   │  │  Penpot MCP (Fase 2)     │  │
   │  │  - Plugin Server (4400)  │  │
   │  │  - MCP Server (4401)     │  │
   │  └──────────────────────────┘  │
   │  ┌──────────────────────────┐  │
   │  │  PVC (local-path)        │  │
   │  │  - Assets (10Gi)         │  │
   │  │  - PostgreSQL data       │  │
   │  └──────────────────────────┘  │
   └─────────────────────────────────┘
```

**Flujos:**
1. **Usuario → Penpot UI**: `penpot.finalq.xyz` → NPM → Ingress → Penpot Frontend
2. **Plugin → MCP**: Plugin en Penpot → `penpot-plugin.finalq.xyz` → Plugin Server (4400)
3. **Codex → MCP**: Codex local → `penpot-mcp.finalq.xyz` (o port-forward) → MCP Server (4401)

## 5) Troubleshooting detallado

### 5.1 Problemas de conectividad

#### NPM no puede alcanzar el cluster
- Si tu NPM (reverse proxy) apunta al "nodo padre" y el ingress-nginx está por NodePort:
  - NPM debe forwardear a `NODE_IP:30080` (http) y/o `NODE_IP:30443` (https), según tu instalación de ingress-nginx.
- Verificar que el ingress-nginx esté exponiendo correctamente:
```bash
kubectl -n ingress-nginx get svc
```

#### Penpot UI no carga o da errores
- Verificar que los pods estén Running:
```bash
kubectl -n penpot get pods
```
- Ver logs del frontend:
```bash
kubectl -n penpot logs -l app=penpot-frontend --tail=50
```
- Ver logs del backend:
```bash
kubectl -n penpot logs -l app=penpot-backend --tail=50
```

### 5.2 Errores "Bad Request" al crear archivos
- Revisá que `config.publicUri` y el host real coincidan exactamente:
  - Debe ser `http://penpot.finalq.xyz` (sin trailing slash)
  - Verificar en `values.yaml` que coincida con el ingress
- El proxy debe preservar headers:
  - `Host`: debe llegar como `penpot.finalq.xyz`
  - `X-Forwarded-Proto`: debe ser `http` o `https` según corresponda
  - `X-Forwarded-For`: IP del cliente
- Verificar headers en el backend:
```bash
kubectl -n penpot logs -l app=penpot-backend | grep -i "bad request"
```

### 5.3 Problemas con PostgreSQL
- Pod no inicia:
```bash
kubectl -n penpot describe pod <postgres-pod>
kubectl -n penpot logs <postgres-pod>
```
- Verificar que el secret existe:
```bash
kubectl -n penpot get secret penpot-postgres
```
- Verificar conexión desde otro pod:
```bash
kubectl -n penpot exec -it <penpot-backend-pod> -- psql -h <postgres-service> -U penpot -d penpot
```

### 5.4 Problemas con Redis/Valkey
- Pod no inicia:
```bash
kubectl -n penpot describe pod <redis-pod>
```
- Si requiere password, verificar secret:
```bash
kubectl -n penpot get secret penpot-redis
```

### 5.5 Problemas con el plugin MCP (Fase 2)
- El plugin no carga en Penpot:
  - Confirmá que el navegador puede llegar a `penpot-plugin.finalq.xyz`:
```bash
curl -I http://penpot-plugin.finalq.xyz/manifest.json
```
  - Verificar que el pod MCP esté Running:
```bash
kubectl -n penpot get pods | grep penpot-mcp
```
  - Ver logs del MCP:
```bash
kubectl -n penpot logs -l app=penpot-mcp --tail=50
```
  - Evitá `localhost` por los bloqueos de PNA mencionados por el repo MCP citeturn0search2

- Codex no puede conectar al MCP:
  - Si usás acceso directo: verificar DNS o `/etc/hosts`:
```bash
# En tu Mac
ping penpot-mcp.finalq.xyz
curl http://penpot-mcp.finalq.xyz/mcp
```
  - Si usás port-forward: verificar que esté activo:
```bash
kubectl -n penpot get pods | grep penpot-mcp
kubectl -n penpot port-forward svc/penpot-mcp 4401:4401
# En otra terminal:
curl http://localhost:4401/mcp
```

### 5.6 Problemas de almacenamiento
- PVC no se crea:
```bash
kubectl -n penpot get pvc
kubectl -n penpot describe pvc <pvc-name>
```
- Verificar que `local-path` StorageClass existe:
```bash
kubectl get storageclass
```

### 5.7 Problemas de recursos
- Pods en estado `Pending` o `CrashLoopBackOff`:
```bash
kubectl -n penpot describe pod <pod-name>
# Buscar eventos relacionados con recursos (CPU/memoria)
```
- Ajustar recursos en `values.yaml` si es necesario

### 5.8 Problemas de Argo CD sync
- Application no sincroniza:
  - Verificar en Argo CD UI el estado del Application
  - Ver logs de Argo CD:
```bash
kubectl -n argocd logs -l app.kubernetes.io/name=argocd-application-controller --tail=50
```
- Verificar que el namespace existe:
```bash
kubectl get namespace penpot
```
- Si tu NPM (reverse proxy) apunta al “nodo padre” y el ingress-nginx está por NodePort:
  - NPM debe forwardear a `NODE_IP:30080` (http) y/o `NODE_IP:30443` (https), según tu instalación de ingress-nginx.
- Si ves errores “Bad Request” al crear archivos, revisá que:
  - `config.publicUri` y el host real coincidan
  - el proxy preserve headers (Host, X-Forwarded-Proto, etc.)
- Si el plugin no conecta:
  - confirmá que el navegador puede llegar a `penpot-plugin.finalq.xyz` y `penpot-mcp.finalq.xyz`
  - evitá `localhost` por los bloqueos de PNA mencionados por el repo MCP citeturn0search2

