# Grocy deployment checklist

- [x] Crear carpeta `grocy/` con `kustomization.yaml`.
- [x] Definir `grocy/namespace.yaml`.
- [x] Definir `grocy/pvc.yaml` (PVC `grocy-data`, storageClass `local-path`, 1Gi).
- [x] Definir `grocy/deployment.yaml` (linuxserver/grocy, env vars, probes, strategy Recreate, montaje `/config`).
- [x] Definir `grocy/service.yaml` (Service tipo NodePort, 80→80, nodePort 30880).
- [x] Agregar `applications/grocy.yaml` apuntando a `path: grocy`.
- [ ] Commit + push de manifests y Application.
- [ ] Sincronizar app `grocy` desde Argo CD y verificar pod/PVC/Service.
- [ ] Configurar Nginx Proxy Manager para exponer el NodePort 30880 con TLS.
- [ ] Cambiar contraseña admin y ajustar base config (ubicaciones, categorías).
- [ ] Documentar o automatizar backup del PVC (`local-path`).
