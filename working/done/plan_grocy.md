# Plan: Grocy en k3s vía Argo CD

## 1. Objetivo y enfoque

Implementar Grocy como solución sencilla de inventario de supplies (códigos de barras, altas/bajas, UI móvil) dentro del clúster **k3s** usando la misma estrategia GitOps del repositorio:

* Manifiestos versionados (Kustomize) bajo `./grocy`.
* Argo CD _app of apps_ (`root-application.yaml`) para reconciliar el deployment.
* Persistencia local (storage class `local-path`) y acceso HTTP expuesto mediante **NodePort** para que el Nginx Proxy Manager existente enrute tráfico externo.

## 2. Alcance

Incluye:

* App Grocy en un único pod con almacenamiento persistente (SQLite).
* Escaneo de códigos de barras desde UI móvil.
* API REST disponible para integraciones futuras.
* Operación básica (backups de volumen, actualizaciones manuales).

Excluye:

* Integraciones de compras o contables.
* Lookup automático de productos (solo se documenta estrategia futura).
* Ingress/TLS directo: lo gestiona NPM fuera del clúster.

## 3. Arquitectura objetivo

```
[ Usuario / Celular ]
          |
          v
[ Nginx Proxy Manager ]
          |
          v
[ Service NodePort (grocy) ] ---> [ Pod Grocy (linuxserver/grocy) ]
          |                                  |
          '--------------------> [ PVC local-path 1Gi ]
```

* Un namespace dedicado (`grocy`).
* Kustomize reúne namespace + PVC + Deployment + Service.
* Argo CD Application apunta a `./grocy` y crea el namespace automáticamente.

## 4. Componentes y decisiones

### 4.1 Namespace
`grocy/namespace.yaml` define `metadata.name: grocy`. Necesario para aislar recursos.

### 4.2 Almacenamiento
* `PersistentVolumeClaim` `grocy-data`, `storageClassName: local-path`, tamaño inicial 1 Gi (`ReadWriteOnce`).
* Montaje en `/config` para la imagen de `linuxserver/grocy`.
* Recomendación: script de backup host-level (restic/rsync) del path local-path correspondiente.

### 4.3 Imagen y contenedor
* Imagen: `linuxserver/grocy:latest` (compatibilidad con k3s, soporte SQLite, actualizaciones frecuentes).
* Env vars:
  * `PUID`/`PGID`: `1000` (usuario estándar del nodo).
  * `TZ`: `America/Argentina/Buenos_Aires`.
  * `GROCY_BASE_URL`: URL externa publicada por NPM (p. ej. `https://grocy.lab.local`).
  * `GROCY_CULTURE`: `es-AR`.
* Recursos iniciales: `requests` 200m / 256Mi, `limits` 500m / 512Mi (ajustables luego).
* Probes:
  * Readiness: `GET /` puerto 80 tras `initialDelaySeconds: 10`.
  * Liveness: `GET /` con periodo mayor (30 s).

### 4.4 Deployment
* `apps/v1` Deployment `grocy`, réplicas = 1 (stateful app).
* Labels `app: grocy` para Service/Argo rollouts.
* `strategy.type: Recreate` para evitar contención de PVC.
* Monta PVC `grocy-data` en `/config`.
* Define `securityContext.fsGroup: 1000` para que SQLite sea accesible.

### 4.5 Service / Networking
* `Service` tipo **NodePort** (no ClusterIP exclusivo) escuchando en puerto 80 → container 80.
* `nodePort` fijo sugerido: `30880` (dentro del rango k3s por defecto 30000-32767).
* Etiquetas: `app: grocy`, `exposed: npm`.
* Documentar que NPM debe apuntar al Node IP del worker y `30880`.

### 4.6 Configuración inicial
* Usuario/clave por defecto (`admin`/`admin`), obligatorio cambiar post-deploy.
* Ubicaciones sugeridas: Depósito, Taller, Obra.
* Categorías sugeridas: Tornillería, Electricidad, Plomería, Pintura, Herramientas, Consumibles.
* Códigos de barras:
  * Usar función “Scan barcode” desde UI móvil.
  * Alta manual guarda el EAN/UPC para uso futuro.

### 4.7 Argo CD Application
`applications/grocy.yaml` con:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: grocy
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/finalquest/argo-k8s-pods.git
    targetRevision: main
    path: grocy
  destination:
    server: https://kubernetes.default.svc
    namespace: grocy
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Esto integra Grocy al _app of apps_ y mantiene el despliegue reconciliado.

## 5. Seguridad y operación

* **Autenticación:** Grocy auth local suficiente para uso personal; para futuras integraciones se puede poner detrás de Keycloak (OIDC) vía NPM.
* **Acceso externo:** Solo NodePort, detrás de NPM + TLS gestionado externamente.
* **Actualizaciones:** Cambiar `image.tag` y dejar que Argo CD haga rollout (Recreate).
* **Backups:** Programar backup del PVC (Snapshot local-path o `kubectl cp` + `restic` en nodo). Documentar cron en host.
* **Monitoreo:** Opcionalmente agregar `ServiceMonitor` si se requiere uptime básico (pendiente).

## 6. Extensiones futuras

1. Lookup externo de productos (UPCitemdb / OpenFoodFacts) vía microservicio que consuma la API REST de Grocy.
2. Alertas de stock bajo usando webhooks de Grocy o scraping de la API.
3. Integración con Keycloak/Authelia a través de NPM para SSO.

## 7. Próximos pasos para implementación (resumen)

1. **Crear carpeta `grocy/` con Kustomize**: namespace, pvc, deployment, service, `kustomization.yaml`.
2. **Agregar `applications/grocy.yaml`** al árbol Argo y referenciarlo desde `root-application` (ya se sincroniza automáticamente).
3. **Configurar NPM** para apuntar al NodePort 30880 y aplicar TLS externo.
4. **Post-deploy**: cambiar contraseña admin, definir ubicaciones/categorías, probar escaneo desde móvil.
5. **Documentar backup** del PVC (script/cron en host k3s).
