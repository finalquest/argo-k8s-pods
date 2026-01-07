# Plan: App de inventario con escaneo y lookup (Node + TS)

## 1. Objetivo
Construir una aplicación ligera para inventariar herramientas/insumos via **escaneo de códigos de barras desde el celular**:
- Escaneo usa la cámara del browser (zxing-js) para leer EAN/UPC.
- Se intenta un **lookup externo** automático; si no hay resultados se permite alta manual.
- Backend en **Node.js + TypeScript** con API REST/GraphQL.
- Persistencia relacional (PostgreSQL) para ítems, categorías, ubicaciones y movimientos de stock.
- Despliegue GitOps en k3s (Argo CD + manifests versionados en este repo).

## 2. Requisitos clave
- **Funcionales:**
  - Escanear códigos desde UI móvil (PWA responsive).
  - Buscar información del barcode en proveedores externos configurables.
  - Alta manual rápida (nombre, categoría, ubicación, unidades).
  - Ajustes de stock (ingreso/consumo) con historial.
  - Búsqueda/listados por barcode, texto o categoría.
- **No funcionales:**
  - Todo auto-hosted dentro del clúster.
  - Offline básico (caché local para formularios) deseable.
  - API documentada (OpenAPI) para futuras integraciones.
  - Autenticación simple inicialmente (Basic/JWT), extensible a Keycloak.

## 3. Arquitectura propuesta
```
[ Browser móvil ]
    |
    v
[ Frontend SPA (React+TS) ]
    |
    v  (REST/GraphQL)
[ Inventory API (Node+TS) ] ----> [ PostgreSQL ]
          |
          '----> [ Lookup Service ] --> UPCitemdb / OpenFoodFacts / catálogos locales
```
- **Frontend**: Vite + React + TypeScript, PWA + service worker para acceso desde home screen.
- **Backend**: NestJS (o Express + tRPC) con módulos `items`, `stock`, `lookup`, `auth`.
- **DB**: PostgreSQL (puede reutilizar patrón `keycloak-postgres` para despliegue stateful).
- **Lookup**: servicio in-process con estrategia `Provider` (HTTP client + caching en Redis opcional).
- **Infra**: Docker multi-stage, deployments separados para API y Frontend, Service NodePort (detrás de NPM) + optional Ingress.

## 4. Fases de implementación

### Fase 1 – Fundaciones backend
1. Crear paquete `inventory-api/` (NestJS):
   - Configuración de linters, tsconfig, scripts npm.
   - Variables de entorno (`POSTGRES_*`, `JWT_SECRET`, `LOOKUP_PROVIDERS`).
2. Añadir ORM (Prisma o TypeORM). Decidir:
   - Esquema inicial: `items`, `categories`, `locations`, `barcodes`, `stock_movements`, `users`.
   - Scripts de migración + seed con categorías/ubicaciones base.
3. Implementar endpoints base:
   - CRUD Item (con barcode único).
   - CRUD Category/Location.
   - Stock adjustments (`POST /items/:id/adjust`).
4. Autenticación mínima:
   - Por ahora `Basic` o `JWT` con usuarios en tabla `users`.
   - Middleware para proteger POST/PUT/DELETE.

### Fase 2 – Lookup y lógica de escaneo
1. Definir interfaz `LookupProvider` y registrar proveedores:
   - `upcitemdb` (requiere API key).
   - `openfoodfacts` (gratuito).
   - `local-catalog` (JSON/CSV).
2. Implementar endpoint `GET /lookup/:barcode` que:
   - Consulta cache local (DB).
   - Itera proveedores hasta encontrar coincidencia.
   - Devuelve payload normalizado (`name`, `brand`, `description`, `image`).
3. Agregar job de caching opcional (Redis o tabla `barcode_cache`).
4. Tests unitarios/integración para la lógica de lookup.

### Fase 3 – Frontend (SPA/PWA)
1. Crear `inventory-web/` (Vite + React + TS):
   - Config PWA (manifest, service worker).
   - UI responsive con Tailwind o Chakra.
2. Implementar flujo de escaneo:
   - Componente `BarcodeScanner` usando `@zxing/browser`.
   - Vista principal con botón “Escanear” → abre cámara → al leer, llama a `/lookup`.
3. Formularios:
   - Alta rápida: prellenar con datos del lookup, permitir editar.
   - Ajuste de stock: sumar/restar unidades.
   - Listado + búsqueda con filtros.
4. Autenticación front:
   - Login view simple (username/password) → obtiene JWT para API.
5. Testing:
   - E2E básicos (Playwright) para flujo escaneo → alta.

### Fase 4 – Contenerización y despliegue
1. Dockerfiles multi-stage:
   - `inventory-api/Dockerfile`: build ts → node runtime.
   - `inventory-web/Dockerfile`: build static → nginx/alpine.
2. Crear manifiestos Kustomize:
   - `inventory/namespace.yaml`.
   - `postgres` StatefulSet + PVC (puede reutilizar pattern de Keycloak).
   - `api` Deployment + Service (ClusterIP).
   - `web` Deployment + Service (NodePort para NPM).
   - ConfigMaps/Secrets para env vars.
3. Argo CD Application (`applications/inventory.yaml`) apuntando a `inventory/`.
4. Ajustar NPM para `https://inventario.finalq.xyz` → Service web.

### Fase 5 – Hardening y extras
1. Backups:
   - Snapshot PVC Postgres (restic o cronjob).
   - Export CSV desde API para respaldo rápido.
2. Observabilidad:
   - Exponer métricas Prometheus (NestJS + prom-client).
   - Health check endpoints (`/healthz`, `/readyz`).
3. Roadmap:
   - Integrar Keycloak (OIDC) más adelante.
   - Notificaciones (telegram/email) para bajos stocks.
   - Soporte multi-warehouse.

## 5. Entregables para el repo
- `working/plan_inventory_scanner.md` (este documento) para referencia.
- Checklist en `working/checklist_inventory_scanner.md` con tareas específicas.
- Directorios `inventory-api/`, `inventory-web/`, `inventory/` (manifiestos) cuando arranque el desarrollo.

Este plan sirve de base para el MD de implementación; cada fase puede desglosarse en tickets subtareas en el checklist.
