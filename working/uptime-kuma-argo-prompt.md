# Prompt – Deploy de Uptime Kuma con Argo CD (k3s)

Quiero que agregues **Uptime Kuma** a mi repositorio de aplicaciones gestionadas por **Argo CD**.

## Contexto del entorno

- Kubernetes: **k3s**
- GitOps: **Argo CD**
- Ingress y certificados: **Nginx Proxy Manager**
  - ❌ No usar cert-manager
- Storage: **PVC local**
  - No RWX
  - No Ceph
- Autenticación: **auth nativa de Uptime Kuma**
  - No SSO / OAuth por ahora

## Requerimientos

### 1. Estructura
- Crear un directorio nuevo para la app, por ejemplo:
  ```
  apps/uptime-kuma/
  ```

### 2. Manifests Kubernetes (YAML plano, NO Helm)

Crear los siguientes recursos:

- `Namespace` dedicado  
  - Nombre sugerido: `monitoring-lite`

- `PersistentVolumeClaim`
  - Para datos persistentes
  - Montado en `/app/data`

- `Deployment`
  - 1 réplica
  - Imagen oficial:
    ```
    louislam/uptime-kuma:latest
    ```
  - Puerto expuesto: `3001`
  - `restartPolicy: Always`
  - Montar el PVC en `/app/data`

- `Service`
  - Tipo: `ClusterIP`
  - Exponer el puerto `3001`

- `Ingress`
  - Hostname genérico, por ejemplo:
    ```
    uptime.internal
    ```
  - ❌ Sin TLS
  - ❌ Sin anotaciones de cert-manager
  - Compatible con **Nginx Proxy Manager**
  - El TLS termina en NPM, no en Kubernetes

### 3. Argo CD Application

Crear un manifiesto `Application` de Argo CD que:

- Apunte al path del repo donde vive `apps/uptime-kuma`
- Use:
  - `syncPolicy.automated`
  - `prune: true`
  - `selfHeal: true`
- No usar Helm
- Namespace destino: `monitoring-lite`

## Suposiciones

- El Ingress Controller ya existe en el cluster
- El `StorageClass` por defecto ya está configurado
- No es necesario crear Secrets adicionales

## Entregable esperado

- Estructura de carpetas clara
- Todos los archivos YAML necesarios
- Sin explicaciones largas
- Solo los manifests y su contenido
