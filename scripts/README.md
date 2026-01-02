# Backup scripts

Helper scripts to back up Keycloak state directly from the cluster. Run them from the repo root with `kubectl` context pointing to k3s.

## `backup-keycloak-db.sh`

Dumps the PostgreSQL database used by Keycloak via `pg_dump`.

```bash
bash scripts/backup-keycloak-db.sh
```

Environment variables:

- `NAMESPACE` (default `keycloak`)
- `SECRET_NAME` for DB credentials (default `keycloak-db`)
- `LABEL_SELECTOR` to pick the Postgres pod (default `app=keycloak-postgres`)
- `BACKUP_DIR` to store the dump (default `./backups`)

The script reads DB name/user/password from the secret, runs `pg_dump`, and writes `backups/keycloak-db-YYYYMMDD-HHMMSS.sql`.

## `export-keycloak-realm.sh`

Exports the Keycloak realm definition using `kcadm.sh`.

```bash
bash scripts/export-keycloak-realm.sh
```

Environment variables:

- `NAMESPACE` (default `keycloak`)
- `ADMIN_SECRET` with admin credentials (default `keycloak-admin`)
- `REALM` to export (default `homelab`)
- `LABEL_SELECTOR` for the Keycloak pod (default `app=keycloak`)
- `BACKUP_DIR` (default `./backups`)

The script logs into the master realm using the admin secret, fetches the realm JSON, and saves it as `backups/keycloak-realm-<realm>-YYYYMMDD-HHMMSS.json`.

> **Nota:** los archivos generados pueden contener datos sensibles (usuarios, grupos, configuraciones). Guardalos en un almacenamiento seguro y limpiá el directorio `backups/` si commiteás el repo.
