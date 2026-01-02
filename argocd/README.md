# Argo CD configuration backup & restore

Este directorio versiona la configuración de Argo CD que no se gestiona con aplicaciones de Argo (ConfigMaps y reglas RBAC). Sirve como respaldo declarativo para reinstalar el stack.

## Archivos versionados

- `config/argocd-cm.yaml`: ConfigMap `argocd-cm` con:
  - `oidc.config` apuntando a Keycloak (`auth.finalq.xyz`).
  - `url: https://argo.finalq.xyz`.
  - `admin.enabled: "false"` para deshabilitar el login local.
- `config/argocd-rbac-cm.yaml`: ConfigMap `argocd-rbac-cm` con las políticas RBAC. Actualmente solo el grupo Keycloak `argocd-admin` recibe `role:admin`.

> **Nota:** Ningún secret real se versiona aquí. El client secret de Keycloak se carga manualmente en `argocd-secret`.

## Restaurar Argo CD tras reinstalar k3s/Argo

1. **Instalar Argo CD base** (Helm o manifiestos oficiales).
2. **Aplicar ConfigMaps versionados** desde este repo:
   ```bash
   kubectl apply -f argocd/config/argocd-cm.yaml
   kubectl apply -f argocd/config/argocd-rbac-cm.yaml
   ```
3. **Recrear `argocd-secret`** con los datos reales:
   ```bash
   kubectl -n argocd create secret generic argocd-secret \
     --from-literal=oidc.keycloak.clientSecret='<client-secret>' \
     --from-literal=admin.password='<admin-password-opcional>' \
     --dry-run=client -o yaml | kubectl apply -f -
   ```
   *(O bien editar el secreto existente para actualizar el client secret.)*
4. **Reiniciar `argocd-server`** para que tome la configuración:
   ```bash
   kubectl -n argocd rollout restart deploy argocd-server
   kubectl -n argocd rollout status deploy argocd-server
   ```
5. **Aplicar `root-application.yaml`** (si no está en el cluster) para que Argo sincronice todas las Applications, incluyendo `applications/keycloak.yaml`.
6. **Validar login OIDC** (`https://argo.finalq.xyz`) y confirmar que los usuarios del grupo `argocd-admin` tienen acceso.

## Actualizar los backups

Cada vez que modifiques la configuración desde el cluster (por ejemplo, agregando un nuevo grupo en RBAC), exportá los cambios:

```bash
kubectl -n argocd get cm argocd-cm -o yaml > argocd/config/argocd-cm.yaml
kubectl -n argocd get cm argocd-rbac-cm -o yaml > argocd/config/argocd-rbac-cm.yaml
```

Hacé commit en este repo para mantener la configuración declarativa al día.
