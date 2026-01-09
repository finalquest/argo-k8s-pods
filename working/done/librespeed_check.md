# Checklist LibreSpeed

## Implementación
- [x] `namespace.yaml` creado para `speedtest` y agregado al kustomize.
- [x] Secret o env config con `PASSWORD` (definir método) disponible para el Deployment.
- [x] `pvc.yaml` (5Gi, `local-path`, `ReadWriteOnce`) montado en `/config`.
- [x] `deployment.yaml` usa imagen `lscr.io/linuxserver/librespeed:latest`, `TELEMETRY=true`, `nodeSelector: role=worker`, probes HTTP y monta el PVC + env `PUID/PGID/TZ/PASSWORD`.
- [x] `service.yaml` tipo ClusterIP expone puerto 80 hacia el pod.
- [x] `ingress.yaml` host `speed.finalq.xyz`, `ingressClassName: nginx`, sin TLS.
- [x] `kustomization.yaml` referencia namespace, secret/config (si aplica), pvc, deployment, service, ingress.
- [x] `applications/librespeed.yaml` con `syncPolicy.automated` y `CreateNamespace=true`.

## Pruebas / Validación
- [ ] `kubectl apply -k librespeed/ --dry-run=server` sin errores.
- [ ] Sync de Argo CD completado y recursos en estado Healthy.
- [ ] `kubectl -n speedtest get pods` muestra el pod listo.
- [ ] `kubectl -n speedtest logs deploy/librespeed` sin errores al iniciar.
- [ ] Port-forward (`kubectl -n speedtest port-forward svc/librespeed 8082:80`) y prueba desde LAN para validar UI/telemetry.
- [ ] Ejecutar test LAN (cliente dentro de la red) y verificar que se registra en el historial.
- [ ] Configurar Proxy Host en NPM para `speed.finalq.xyz` → Ingress y probar desde WAN.
- [ ] Confirmar autenticación (`PASSWORD`) funciona para ver historial/administrar.
