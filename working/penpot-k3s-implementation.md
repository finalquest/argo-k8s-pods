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

### 1.3 Crear el “umbrella chart” del servicio
En `penpot/Chart.yaml`:

```yaml
apiVersion: v2
name: penpot-bundle
version: 0.1.0
type: application

dependencies:
  - name: penpot
    version: "*"        # en producción: fijar versión
    repository: "https://helm.penpot.app/"
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
helm show values penpot/penpot > /tmp/penpot-upstream-values.yaml
```

Buscá las keys reales de:
- habilitar `postgres`/`redis` como subcharts
- naming del service
- config `publicUri`
- persistence de assets

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

### 1.8 Deploy (fase 1)
1) Commit + push del servicio y Application.
2) En Argo CD: Sync `penpot`.

Validación:
```bash
kubectl -n penpot get pods
kubectl -n penpot get svc
kubectl -n penpot get ingress
```

Desde tu LAN:
- Abrí `http://penpot.finalq.xyz`

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
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/penpot/penpot-mcp.git .
RUN npm run bootstrap

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=build /app /app

ENV NODE_ENV=production
ENV PLUGIN_PORT=4400
ENV MCP_PORT=4401

EXPOSE 4400 4401
CMD ["npm","run","start:all"]
```

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
En tu Mac, editá `~/.codex/config.toml` y agregá:

```toml
[mcp_servers.penpot]
url = "http://penpot-mcp.finalq.xyz/mcp"
```

Luego, en Codex:
- Verificá que el server aparezca como conectado (en el TUI suele haber comando `/mcp`).

---


---

## 1.9 Creación de Secrets (OBLIGATORIO – fuera de Git)

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

### 1.9.1 PostgreSQL

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

### 1.9.2 Redis / Valkey

Si Redis requiere auth:

```bash
kubectl -n penpot create secret generic penpot-redis   --from-literal=REDIS_PASSWORD=<PASSWORD_SEGURA>
```

Si Redis **no** usa password, este secret puede omitirse (según values del chart).

---

### 1.9.3 SMTP (opcional, recomendado a futuro)

Si más adelante querés habilitar emails (invitaciones, reset password):

```bash
kubectl -n penpot create secret generic penpot-smtp   --from-literal=SMTP_HOST=smtp.tu-dominio   --from-literal=SMTP_PORT=587   --from-literal=SMTP_USER=penpot@tu-dominio   --from-literal=SMTP_PASSWORD=<PASSWORD_SEGURA>   --from-literal=SMTP_FROM=penpot@tu-dominio
```

---

### 1.9.4 Verificación

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

### 1.9.5 Documentación operativa (working/)

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
- [ ] Crear carpeta `penpot/` (umbrella chart).
- [ ] `Chart.yaml` con dependencia al chart upstream.
- [ ] `values.yaml` con `publicUri` + persistence (assets) + deps internas.
- [ ] `templates/ingress-penpot.yaml` (host `penpot.finalq.xyz`).
- [ ] `applications/penpot.yaml` (Argo Application, sync manual).
- [ ] Commit + push.
- [ ] Sync en Argo CD.
- [ ] Validar `kubectl -n penpot get pods/svc/ingress`.
- [ ] Abrir UI: `http://penpot.finalq.xyz`.

### Fase 2 — Penpot MCP
- [ ] Crear `penpot-mcp-image/Dockerfile` (Node 20, bootstrap).
- [ ] Build + push con buildx a `harbor.finalq.xyz/tools/penpot-mcp:0.1.0`.
- [ ] Agregar templates `mcp-deploy.yaml` + `mcp-ingress.yaml`.
- [ ] Activar `bundle.mcp.enabled=true` en `penpot/values.yaml`.
- [ ] Commit + push.
- [ ] Sync en Argo CD.
- [ ] `curl http://penpot-plugin.finalq.xyz/manifest.json` responde 200/30x.
- [ ] `curl http://penpot-mcp.finalq.xyz/mcp` responde (200/4xx según handshake, pero reachable).
- [ ] Cargar plugin desde Penpot apuntando al manifest.
- [ ] Configurar `~/.codex/config.toml` con MCP.
- [ ] Validar que Codex vea el server MCP.

---

## 4) Notas rápidas (operativas)
- Si tu NPM (reverse proxy) apunta al “nodo padre” y el ingress-nginx está por NodePort:
  - NPM debe forwardear a `NODE_IP:30080` (http) y/o `NODE_IP:30443` (https), según tu instalación de ingress-nginx.
- Si ves errores “Bad Request” al crear archivos, revisá que:
  - `config.publicUri` y el host real coincidan
  - el proxy preserve headers (Host, X-Forwarded-Proto, etc.)
- Si el plugin no conecta:
  - confirmá que el navegador puede llegar a `penpot-plugin.finalq.xyz` y `penpot-mcp.finalq.xyz`
  - evitá `localhost` por los bloqueos de PNA mencionados por el repo MCP citeturn0search2

