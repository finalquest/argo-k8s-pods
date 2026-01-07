# Checklist: Inventario con escaneo (Node + TS)

## Preparación
- [x] Crear estructura `inventory/{api,web,config}`.
- [x] Añadir `inventory/config/docker-compose.db.yml` + script `scripts/run_inventory_db.sh`.
- [x] Levantar Postgres local (puerto 5544) con Docker Compose.

## Backend (Fase 1)
- [x] Bootstrap NestJS (o Express) en `inventory/api` con TypeScript, ESLint, scripts npm.
- [x] Configurar Prisma + modelos base + migraciones iniciales contra Postgres local.
- [x] Seed de datos base (usuario admin/admin).
- [x] Implementar endpoints CRUD de categorías.
- [x] Implementar endpoints CRUD de items + ajustes de stock.
- [x] Agregar autenticación básica (JWT/local users).

## Lookup (Fase 2)
- [ ] Implementar interfaz `LookupProvider` y proveedores (UPCitemdb, OpenFoodFacts, local).
- [ ] Endpoint `GET /lookup/:barcode` con cache local.
- [ ] Tests para la lógica de lookup/caching.

## Frontend (Fase 3)
- [x] Bootstrap `inventory-web/` (Vite + React + TS, PWA config).
- [ ] Implementar componente de escaneo (zxing) y flujo principal.
- [x] Formularios de alta y ajuste de stock.
- [x] Login/JWT + estado global.
- [x] Tests básicos (Playwright/React Testing Library).

## Contenedores y despliegue (Fase 4)
- [x] Dockerfiles multi-stage para API y Web.
- [x] Manifiestos Kustomize (`inventory/config/k8s`): namespace, postgres StatefulSet, api/web deployments + services, secrets.
- [x] Application de Argo CD (`applications/inventory.yaml`).
- [ ] Configurar NPM / rutas externas.

## Hardening (Fase 5)
- [ ] Backups del PVC de Postgres + export CSV.
- [ ] Health checks/métricas (Prometheus).
- [ ] Documentar roadmap (Keycloak, alertas, multi-warehouse).
