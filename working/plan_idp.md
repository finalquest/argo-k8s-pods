# Implementación de un Identity Provider (IdP) con Keycloak en Homelab

## 1. Objetivo del documento

Este documento describe **cómo implementar un IdP real usando Keycloak** en un homelab basado en:

* Proxmox
* k3s
* Argo CD
* Nginx Proxy Manager
* Autenticación federada con Google

El objetivo **no es solo que funcione**, sino **entender el modelo de identidad moderno (OIDC/OAuth2)** y poder aplicarlo luego en otros entornos.

---

## 2. Arquitectura general

### Componentes

* **Keycloak**: Identity Provider (IdP)
* **Google OAuth**: proveedor externo de identidad
* **Argo CD / Grafana**: Service Providers (SP)
* **Nginx Proxy Manager**: reverse proxy TLS

### Flujo de autenticación (OIDC)

1. Usuario accede a Argo / Grafana
2. La app redirige al IdP (Keycloak)
3. Keycloak redirige a Google
4. Google autentica al usuario
5. Google devuelve un token a Keycloak
6. Keycloak emite un ID Token OIDC
7. La app valida el token y crea sesión

Resultado: **la aplicación sabe quién es el usuario y qué permisos tiene**.

---

## 3. Conceptos clave (mínimos)

| Concepto | Descripción                                       |
| -------- | ------------------------------------------------- |
| Realm    | Dominio lógico de identidad (ej: `homelab`)       |
| Client   | Aplicación que confía en Keycloak (Argo, Grafana) |
| IdP      | Sistema que autentica usuarios                    |
| OIDC     | Protocolo de identidad basado en OAuth2           |
| ID Token | Token firmado que representa al usuario           |
| Claims   | Datos del usuario (email, grupos, roles)          |

---

## 4. Deploy de Keycloak en k3s

### 4.1 Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: keycloak
```

---

### 4.2 Base de datos (PostgreSQL mínima)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak-postgres
  namespace: keycloak
spec:
  replicas: 1
  selector:
    matchLabels:
      app: keycloak-postgres
  template:
    metadata:
      labels:
        app: keycloak-postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: keycloak
        - name: POSTGRES_USER
          value: keycloak
        - name: POSTGRES_PASSWORD
          value: keycloak
        ports:
        - containerPort: 5432
```

---

### 4.3 Keycloak

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
  namespace: keycloak
spec:
  replicas: 1
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
    spec:
      containers:
      - name: keycloak
        image: quay.io/keycloak/keycloak:24.0
        args:
          - start
        env:
          - name: KC_DB
            value: postgres
          - name: KC_DB_URL
            value: jdbc:postgresql://keycloak-postgres:5432/keycloak
          - name: KC_DB_USERNAME
            value: keycloak
          - name: KC_DB_PASSWORD
            value: keycloak
          - name: KEYCLOAK_ADMIN
            value: admin
          - name: KEYCLOAK_ADMIN_PASSWORD
            value: admin
        ports:
          - containerPort: 8080
```

---

## 5. Exposición vía Nginx Proxy Manager

* Dominio: `keycloak.homelab.tu-dominio`
* Proxy a: `keycloak.keycloak.svc.cluster.local:8080`
* TLS activo

⚠️ Keycloak **debe tener URL pública estable** para OIDC.

---

## 6. Configuración inicial de Keycloak

### 6.1 Crear Realm

* Nombre: `homelab`
* Habilitar login por email

---

### 6.2 Crear usuario local (prueba)

* Email
* Password
* Email verified = true

---

## 7. Integrar Google como Identity Provider

### 7.1 Crear OAuth Client en Google Cloud

* Tipo: Web
* Redirect URI:

```
https://keycloak.homelab.tu-dominio/realms/homelab/broker/google/endpoint
```

---

### 7.2 Configurar IdP en Keycloak

* Identity Providers → Google
* Client ID / Secret
* Scope: `openid email profile`

Resultado: Google → Keycloak

---

## 8. Configurar Argo CD con OIDC

### 8.1 Client en Keycloak

* Client ID: `argocd`
* Access Type: confidential
* Redirect URI:

```
https://argo.homelab.tu-dominio/auth/callback
```

---

### 8.2 Configuración en Argo CD

```yaml
oidc.config: |
  name: Keycloak
  issuer: https://keycloak.homelab.tu-dominio/realms/homelab
  clientID: argocd
  clientSecret: <secret>
  requestedScopes: ["openid", "profile", "email"]
```

---

## 9. RBAC básico en Argo

```yaml
p, role:admin, applications, *, */*, allow
g, tuusuario@gmail.com, role:admin
```

---

## 10. Validaciones finales

* Login Google → Keycloak
* Keycloak → Argo
* Sesión persistente
* Logout correcto

---

## 11. Qué aprendés con este setup

* Flujo OIDC real
* Separación IdP / SP
* Federar identidad externa
* RBAC basado en claims

Este modelo es **idéntico al usado en cloud y entornos enterprise**.

---

## 12. Próximos pasos sugeridos

* Integrar Grafana
* Centralizar logs de auth
* Rotar secretos
* Hardening (HTTPS-only, PKCE)
