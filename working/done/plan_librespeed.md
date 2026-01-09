# Plan detallado: LibreSpeed como pod en k3s

## Objetivo
Desplegar LibreSpeed dentro del clúster k3s, gestionado por Argo CD, para medir velocidades LAN/WAN sin depender de servicios externos.

## Estructura propuesta
- Crear directorio `librespeed/` en la raíz del repo (misma convención que `grocy`, `vault`, etc.).
- Incluir `namespace.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml` y `kustomization.yaml`.
- Añadir `applications/librespeed.yaml` para registrarlo en Argo CD.

## Recursos Kubernetes
1. **Namespace**
   - Crear namespace dedicado `speedtest` para aislar LibreSpeed. Mantendremos el patrón `namespace.yaml` + `CreateNamespace=true`.

2. **Deployment**
   - Imagen sugerida: `lscr.io/linuxserver/librespeed:latest` (soporta modo standalone, auth básica y métricas).
   - Réplicas: 1.
   - `nodeSelector: role=worker`.
   - Variables requeridas:
     - `PUID` / `PGID` (probablemente 1000/1000 como en otras apps).
     - `TZ` (ej. `America/Argentina/Buenos_Aires`).
     - `TELEMETRY=true` para habilitar historial.
     - `PASSWORD` para administrar resultados (se inyectará vía Secret simple).
     - `TITLE` / `DESCRIPTION` opcionales para personalizar UI.
   - Puerto expuesto: 80.
   - Probes HTTP `/`.
   - Necesitamos almacenamiento persistente para el historial: PVC montado en `/config` (ruta usada por LinuxServer para SQLite/telemetry).

3. **PersistentVolumeClaim**
   - Tipo `ReadWriteOnce`, `storageClassName: local-path`, tamaño inicial 5 Gi (ajustable).

4. **Service**
   - Tipo `ClusterIP`, puerto 80.

5. **Ingress**
   - Host definido: `speed.finalq.xyz`.
   - `ingressClassName: nginx`, sin TLS interno (NPM termina certificados).
   - Permitir websockets (LibreSpeed usa fetch long-running; Nginx por defecto está bien, pero revisar `nginx.ingress.kubernetes.io/proxy-read-timeout`).

6. **Argo CD Application**
   - `applications/librespeed.yaml` apuntando a `librespeed/`.
   - `syncPolicy.automated` con `CreateNamespace=true` si se crea namespace nuevo.

## Configuración / Opciones a definir
- `PASSWORD`: definir valor (puede ser guardado en Secret `librespeed-env`) para limitar acceso al panel.
- Historial: habilitar `TELEMETRY` y usar el PVC en `/config`.
- Hostname: `speed.finalq.xyz` (configurar en NPM).
- Namespace: `speedtest`.
- ¿Se limitará acceso sólo desde LAN? Podríamos usar reglas en NPM o habilitar Basic Auth.

## Pruebas previstas
1. `kubectl apply -k librespeed/ --dry-run=server` antes del sync.
2. Sync de la Application en Argo CD y ver rollout del Deployment.
3. `kubectl -n <namespace> port-forward svc/librespeed 8081:80` para smoke-test interno antes de publicar.
4. Medición contra LAN: ejecutar test desde un dispositivo en la misma red apuntando al host interno.
5. Medición WAN: exponer vía NPM y apuntar a `speed.finalq.xyz` desde Internet.

## Next steps
- Definir valor concreto para `PASSWORD` y si se almacenará en Secret o env directo.
- Implementar manifests (`namespace/pvc/deployment/service/ingress/kustomization`) bajo `librespeed/`.
- Crear `applications/librespeed.yaml` y preparar checklist similar a Kuma para validación/pre-NPM pruebas.
