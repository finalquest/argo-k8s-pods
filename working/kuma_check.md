# Checklist de implementación y pruebas

## Implementación
- [ ] `namespace.yaml` creado con `monitoring-lite` y agregado al kustomize.
- [ ] `pvc.yaml` define `uptime-kuma`, 5Gi, `local-path`, `ReadWriteOnce`.
- [ ] `deployment.yaml` usa imagen `louislam/uptime-kuma:latest`, monta `/app/data`, `nodeSelector: role=worker`, requests/limits definidos, puerto 3001 expuesto y probes configurados.
- [ ] `service.yaml` tipo ClusterIP expone puerto 3001 y selector coincide con el Deployment.
- [ ] `ingress.yaml` host `kuma.finalq.xyz`, `ingressClassName: nginx`, backend al Service sin TLS.
- [ ] `kustomization.yaml` referencia namespace, pvc, deployment, service e ingress.
- [ ] `applications/uptime-kuma.yaml` apuntando a `uptime-kuma/`, `syncPolicy.automated`, `CreateNamespace=true`.

## Pruebas pre-NPM
- [ ] `kubectl apply -k uptime-kuma/ --dry-run=server` ejecutado sin errores.
- [ ] Argo CD Application sincronizada correctamente y recursos creados.
- [ ] `kubectl -n monitoring-lite get pods` muestra el Deployment listo.
- [ ] `kubectl -n monitoring-lite logs deploy/uptime-kuma` confirma que la app arrancó.
- [ ] `kubectl -n monitoring-lite get pvc uptime-kuma` en estado `Bound`.
- [ ] Prueba local via `kubectl -n monitoring-lite port-forward svc/uptime-kuma 8080:3001` y acceso a `http://localhost:8080` desde la red local.
- [ ] Tras validación local, configurar host `kuma.finalq.xyz` en Nginx Proxy Manager apuntando al Ingress.
