# Checklist implementación Keycloak IdP

Seguimiento de tareas derivadas del plan en `working/plan_idp.md`. Marcar `[x]` al completar.

1. [x] Crear proyecto de Google Cloud (`homelab-auth`), consent screen y OAuth client Web para `auth.finalq.xyz`. Guardar `client_id` y `client_secret` de forma segura.
2. [x] Agregar carpeta `keycloak/` con chart/manifiestos (PostgreSQL + Keycloak + Services + PVCs + plantillas de Secrets) y publicar `applications/keycloak.yaml`. Ajustar `root-application.yaml` si corresponde.
3. [x] Ejecutar los comandos `kubectl create secret` para `keycloak-admin`, `keycloak-db` y `keycloak-google` con los valores reales (no versionados).
4. [ ] Sincronizar el nuevo Application en Argo CD y validar pods listos + NodePort accesible para que Nginx Proxy Manager pueda apuntar a `auth.finalq.xyz`.
5. [ ] Configurar Keycloak: realm `homelab`, usuario local de emergencia, IdP de Google y clientes `argocd`/`grafana`.
6. [ ] Actualizar configuraciones de Argo CD y Grafana para usar OIDC con Keycloak, sincronizar vía Argo y probar login end-to-end.
7. [ ] Documentar y automatizar backups (`pg_dump`) y definir plan para integrar servicios externos (Vaultwarden, Pi-hole, Home Assistant) mediante OIDC.
