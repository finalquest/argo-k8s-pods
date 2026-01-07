# Plan detallado: Uptime Kuma con Argo CD

1. **Estructura del repositorio**
   - Crear directorio `uptime-kuma/` en la raíz para seguir el patrón del resto de las apps.
   - Dentro, agregar `kustomization.yaml` que incluya `namespace.yaml`, `pvc.yaml`, `deployment.yaml`, `service.yaml` e `ingress.yaml`.

2. **Namespace**
   - Manifiesto `namespace.yaml` con `monitoring-lite` para aislar la app.
   - Argo CD usará `syncOptions: CreateNamespace=true`, pero declaramos el namespace explícitamente para mantener consistencia.

3. **PersistentVolumeClaim**
   - Archivo `pvc.yaml` para `uptime-kuma` en `monitoring-lite`.
   - `storageClassName: local-path`, `requests.storage: 5Gi`, modo `ReadWriteOnce`.
   - Este PVC se monta en `/app/data` dentro del pod.

4. **Deployment**
   - `deployment.yaml` con metadatos/labels `app: uptime-kuma`.
   - Imagen `louislam/uptime-kuma:latest`; `replicas: 1`; `restartPolicy: Always`.
   - `nodeSelector: role=worker` como en las otras apps.
   - Exponer `containerPort: 3001`; definir probes HTTP sobre `/` en el puerto 3001.
   - `volumeMounts` que conecten el PVC a `/app/data`.
   - Establecer recursos: requests `cpu: 100m`, `memory: 256Mi`; limits `cpu: 500m`, `memory: 512Mi`.

5. **Service**
   - `service.yaml` tipo `ClusterIP`, nombre `uptime-kuma`, mismo namespace.
   - Selector `app: uptime-kuma`.
   - Puerto `port: 3001`, `targetPort: 3001`.

6. **Ingress**
   - `ingress.yaml` con `ingressClassName: nginx`.
   - Host `kuma.finalq.xyz`, sin bloque TLS (NPM termina el certificado fuera del cluster).
   - Backend apunta al Service `uptime-kuma` puerto 3001.

7. **Argo CD Application**
   - `applications/uptime-kuma.yaml`:
     - `metadata.name: uptime-kuma`, namespace `argocd`.
     - `spec.project: default`.
     - `spec.source.repoURL`: repositorio actual, `targetRevision: main`, `path: uptime-kuma`.
     - `spec.destination.namespace: monitoring-lite`.
     - `syncPolicy.automated` con `prune: true`, `selfHeal: true` y `syncOptions: CreateNamespace=true`.

8. **Despliegue inicial**
   - Aplicar `kubectl apply -k uptime-kuma/ --dry-run=server` para verificar.
   - Crear Application en Argo CD y sincronizar.
   - Validar que el namespace, PVC, Deployment, Service e Ingress se creen correctamente.

