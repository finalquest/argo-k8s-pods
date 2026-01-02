# Implementación de un Identity Provider (IdP) con Keycloak en Homelab

## 1. Objetivo y alcance

Implementar un **IdP centralizado** con Keycloak que cubra:

* Cluster k3s desplegado en Proxmox, gestionado vía Argo CD (GitOps).
* Reverse proxy y TLS a cargo de **Nginx Proxy Manager** que corre como VM en Proxmox.
* Federar Google como IdP externo para evitar manejar passwords locales.
* Integrar inicialmente Argo CD y Grafana (en k3s) y dejar preparado el onboarding de otras apps locales (Vaultwarden, Pi-hole, Home Assistant).

El objetivo es tener un setup reproducible, versionado y entendible, listo para iterar con buenas prácticas OIDC.

---

## 2. Decisiones de diseño

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Ubicación Keycloak | StatefulSet en k3s | Permite GitOps con Argo, recicla monitoreo existente y evita mantener otra VM. |
| Base de datos | PostgreSQL single-replica en k3s | Simplifica el MVP. Se usará `local-path` StorageClass con PVC dedicado. Documentar backup/restore por ser almacenamiento local. |
| Exposición | Service `NodePort` + Proxy desde Nginx Proxy Manager | Ya existe NPM con TLS; evita mantener Ingress Controller adicional y reutiliza certificados válidos. |
| Secrets | `Secret` estándar en namespace `keycloak` (KEYCLOAK_ADMIN, DB) sincronizado vía Argo | Homologa con el resto del cluster mientras no haya un gestor dedicado. Ningún valor sensible se versiona en Git; solo plantillas/ejemplos respaldadas con comandos `kubectl create secret`. |
| Federación | Google OAuth Web Client (`auth.finalq.xyz`) | Requisito para no administrar passwords. |
| HA | No en esta fase | MVP, replica única. Se documentan mejoras futuras. |

Riesgo aceptado: el storage `local-path` ata PostgreSQL y Keycloak al nodo donde se agende. Se anotan backups y recuperación como tareas de seguimiento.

---

## 3. Arquitectura

Componentes principales:

* **Proxmox**: hostea la VM de k3s y las VMs auxiliares (Pi-hole, NPM, Home Assistant).
* **k3s cluster**:
  * Namespace `keycloak`: StatefulSets de PostgreSQL y Keycloak, Services y Secrets.
  * Namespace `argocd` / `monitoring`: Argo CD y Grafana que actuarán como Service Providers.
* **Nginx Proxy Manager**: Termina TLS para `auth.finalq.xyz` y `argo.finalq.xyz`, y enruta hacia los NodePorts internos.
* **Google Cloud**: proyecto con OAuth consent screen y OAuth client ID/secret.

### Flujo OIDC resumido

1. Usuario accede a `https://argo.finalq.xyz`.
2. Argo detecta sesión inexistente y redirige a `https://auth.finalq.xyz/realms/homelab/protocol/openid-connect/auth`.
3. Keycloak fuerza login con Google (`/broker/google`).
4. Google autentica, devuelve `code` a Keycloak.
5. Keycloak intercambia `code` por tokens con Google, crea/actualiza el usuario federado.
6. Keycloak emite ID/Access token firmados para Argo.
7. Argo valida los tokens, aplica RBAC y abre sesión.

---

## 4. Despliegue en k3s

### 4.1 Namespaces y labels

* `keycloak`: recursos propios del IdP.
* Considerar agregar label `purpose=identity` para ayudar con políticas futuras.

### 4.2 Storage

* `StorageClass`: `local-path (rancher.io/local-path)`.
* PVCs planificados:
  * `pgdata-keycloak` (PostgreSQL) – 10 Gi de inicio.
  * `keycloak-data` (opcional, para providers que demanden persistencia adicional).
* Documentar que la restauración requiere capturar snapshots en Proxmox o backups lógicos (`pg_dump`/`pg_basebackup`).

### 4.3 PostgreSQL

* StatefulSet con:
  * Imagen `postgres:15`.
  * Recursos moderados (1 CPU / 1.5 Gi).
  * PVC `pgdata-keycloak`.
  * ConfigMap para `postgresql.conf` mínimo (fsync, max connections).
* Service `ClusterIP` (`keycloak-postgres.keycloak.svc`).
* Secret `keycloak-db` con `username`, `password`, `database`.

### 4.4 Keycloak

* Desplegado via Helm chart (Bitnami o chart propio en repo).
* Configuración clave:
  * `KC_HOSTNAME=auth.finalq.xyz`.
  * `KC_PROXY=edge` (porque está detrás de NPM).
  * Variables de DB apuntando al Service anterior.
  * `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` desde `Secret`.
  * Recursos iniciales: 1 CPU / 2 Gi.
* StatefulSet en modo `start` (modo Quarkus).

### 4.5 Servicios y accesos

* Service HTTP `ClusterIP` + `NodePort` fijo (ej. 32080) para exponerlo a NPM.
* Health checks (`/realms/master`). 
* NPM configurado para:
  * `auth.finalq.xyz` → `https://<nodo-k3s>:32080`
  * Certificados ya emitidos (Let's Encrypt) y “Force SSL”.

---

## 5. GitOps con Argo CD

1. Crear carpeta `keycloak/` en este repo con:
   * Chart/HelmRelease o Kustomize que encapsule PostgreSQL + Keycloak.
   * `values.yaml` con overrides (hostnames, NodePort, PVC sizes).
   * Templates para `Secrets` (considerar `argocd-vault-plugin` en el futuro). **Recordatorio**: ningún secret real se sube a Git; los valores se cargan vía `kubectl create secret` o mecanismos externos.
2. Añadir `applications/keycloak.yaml` que apunte a `path: keycloak` y namespace `keycloak`.
3. Ajustar `root-application.yaml` si es necesario para incluir el nuevo Application.
4. Definir `Secret` `argocd/argocd-secret` con la sección `oidc.config` (ver sección 7) bajo control de Git.

### 5.1 Creación de secrets fuera de Git

Los manifests contienen solo plantillas (`Secret` con claves vacías). Los valores reales se cargan manualmente o vía automatización segura usando `kubectl`:

```bash
# Credenciales admin de Keycloak
kubectl -n keycloak create secret generic keycloak-admin \
  --from-literal=KEYCLOAK_ADMIN=admin \
  --from-literal=KEYCLOAK_ADMIN_PASSWORD='<password>'

# Credenciales de PostgreSQL
kubectl -n keycloak create secret generic keycloak-db \
  --from-literal=POSTGRES_DB=keycloak \
  --from-literal=POSTGRES_USER=keycloak \
  --from-literal=POSTGRES_PASSWORD='<password>'

# OAuth client de Google (IdP federado)
kubectl -n keycloak create secret generic keycloak-google \
  --from-literal=GOOGLE_CLIENT_ID='<client-id>' \
  --from-literal=GOOGLE_CLIENT_SECRET='<client-secret>'
```

Estos comandos se pueden ejecutar desde tu terminal o automatizar en un script local; nunca se suben los valores a Git.

---

## 6. Configuración inicial de Keycloak

### 6.1 Realm base

* Nombre: `homelab`.
* Habilitar login por email.
* Theme: default (ajustar más adelante).

### 6.2 Usuario local de emergencia

* Crear usuario `admin@homelab`.
* Forzar password inicial y marcar email como verificado.
* Ubicarlo en grupo `admins` para tener fallback si falla Google.

---

## 7. Federar Google como Identity Provider

### 7.1 Preparación en Google Cloud

1. Crear proyecto (ej. `homelab-auth`).
2. Configurar OAuth consent screen (Internal → dominio verificado `finalq.xyz`).
3. Crear OAuth Client Type “Web application”:
   * Authorized redirect URIs:
     * `https://auth.finalq.xyz/realms/homelab/broker/google/endpoint`.
     * `https://auth.finalq.xyz/realms/master/broker/google/endpoint` (opcional para admins).
4. Descargar `client_id` y `client_secret`.

### 7.2 Configurar en Keycloak

* Identity Providers → Google → agregar provider.
* Completar client ID/secret y scopes `openid email profile`.
* Activar “Trust Email” para auto-verificar.
* Crear mapper `groups` si se quieren mapear Google Workspace groups (futuro).

---

## 8. Service Providers (SP) iniciales

### 8.1 Argo CD (`argo.finalq.xyz`)

* Client en Keycloak:
  * Client ID: `argocd`.
  * Access Type: confidential.
  * Valid redirect URIs: `https://argo.finalq.xyz/auth/callback`.
  * Web origins: `https://argo.finalq.xyz`.
* Configuración en `argocd-cm`:

```yaml
oidc.config: |
  name: Keycloak
  issuer: https://auth.finalq.xyz/realms/homelab
  clientID: argocd
  clientSecret: $keycloak-argocd-client-secret
  requestedScopes: ["openid", "profile", "email"]
```

* RBAC (`argocd-rbac-cm`):

```yaml
p, role:admin, applications, *, */*, allow
g, user:guillermo.finalq@gmail.com, role:admin
```

*(Formatear el `subject` según claim `email`.)*

### 8.2 Grafana

* Client ID: `grafana`.
* Redirect URI: `https://grafana.finalq.xyz/login/generic_oauth`.
* Activar `email` como principal claim en la configuración de Grafana (`auth.generic_oauth`).

### 8.3 Backlog de integraciones

* **Vaultwarden** (ya en k3s): evaluar OIDC o seguir con auth propia.
* **Pi-hole / Home Assistant** (VMs): considerar `oauth2-proxy` frente a cada servicio o migrar a Keycloak Gatekeeper.
* **Servicios futuros**: Android orchestrators, etc.

---

## 9. Validación y observabilidad

* Tests de login:
  * Usuario local → Keycloak.
  * Usuario Google → Keycloak.
  * Login contra Argo/Grafana.
* Revisar logs en `keycloak` y `keycloak-postgres`.
* Exportar métricas:
  * Habilitar `ServiceMonitor` para Keycloak (cuando se integre a Prometheus).
* Backups:
  * Script cron con `kubectl exec pg_dump` + upload a almacenamiento persistente (ej. NFS/Proxmox).

---

## 10. Hardening futuro

1. Doble réplica de Keycloak y Postgres (requiere storage replicado).
2. TLS interno (mTLS o cert-manager) dentro del cluster.
3. Rotación automática de secretos (Vault, SOPS).
4. Implementar PKCE + `offline_access` para apps móviles.
5. Politicas de contraseñas y flujos de recuperación.

---

## 11. Plan de implementación

1. **Preparación Google Cloud**
   * Crear proyecto, consent screen y OAuth client.
   * Guardar client ID/secret en `Secret` `keycloak-google`.
2. **Infraestructura en repo**
   * Crear carpeta `keycloak/` con chart (Subchart Bitnami recomendado) + templates para Secrets, StatefulSets y Services.
   * Añadir manifiesto `applications/keycloak.yaml`.
3. **Secrets y valores**
   * Definir `keycloak/values.yaml` con hostnames, NodePort, recursos, PVC sizes.
   * Incluir `Secret` YAML **solo como plantilla** (sin datos reales) para `keycloak-admin`, `keycloak-db` y `keycloak-google`.
   * Ejecutar los comandos `kubectl create secret` de la sección 5.1 para cargar los valores reales fuera de Git.
4. **Deploy GitOps**
   * Aplicar `root-application.yaml` (si no lo está) y esperar sync de Argo.
   * Verificar pods y NodePort accesible.
5. **Config Keycloak**
   * Ingresar a consola admin (usuario local).
   * Crear realm `homelab`, configurar Google IdP y clientes (Argo, Grafana).
6. **Integrar Argo y Grafana**
   * Actualizar ConfigMaps/Secrets correspondientes y sincronizar via Argo.
   * Validar login end-to-end.
7. **Documentar/automatizar backups**
   * Script o job para `pg_dump`.
8. **Planificar onboarding de servicios externos**
   * Definir si usar `oauth2-proxy` o integración directa para Pi-hole y Home Assistant.

Cada paso se versiona en este repo y se despliega automáticamente mediante Argo CD, manteniendo el IdP alineado con el resto del homelab.
