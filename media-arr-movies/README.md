# media-arr-movies

Stack para descargar y ver películas en la red. Reutiliza Prowlarr y qBittorrent del stack `media-arr-books`.

## Componentes

| App | Imagen | Puerto | URL |
| --- | --- | --- | --- |
| Radarr | `lscr.io/linuxserver/radarr` | 7878 | `https://radarr.finalq.xyz` |
| Jellyfin | `lscr.io/linuxserver/jellyfin` | 8096 | `https://jellyfin.finalq.xyz` |
| Jellyseerr | `ghcr.io/fallenbagel/jellyseerr` | 5055 | `https://jellyseerr.finalq.xyz` |
| Bazarr | `lscr.io/linuxserver/bazarr` | 6767 | `https://bazarr.finalq.xyz` |

## Storage

- `movies-nfs` -> NFS `10.1.0.152:/data/exports/media/movies` (biblioteca final, RWX).
- `downloads-nfs` -> PVC existente del stack de libros (descargas en curso).
- `movies-nfs` también se monta en Bazarr en `/movies` (escribe los subtítulos junto al video).
- Configs en `local-path`: `radarr-config`, `jellyfin-config`, `jellyseerr-config`, `bazarr-config`.

## Conexiones manuales (una vez)

Estos pasos se hacen por UI. Necesitan las API keys, así que no se versionan.

### 1. Radarr -> qBittorrent

En Radarr: **Settings -> Download Clients -> + -> qBittorrent**

- Host: `qbittorrent.media.svc.cluster.local`
- Port: `8080`
- Username / Password: los del secret `qbittorrent-credentials`.

### 2. Prowlarr -> Radarr

En Prowlarr: **Settings -> Apps -> + -> Radarr**

- Prowlarr Server: `http://prowlarr.media.svc.cluster.local:9696`
- Radarr Server: `http://radarr.media.svc.cluster.local:7878`
- API Key: la de Radarr (**Settings -> General**).

Guarda con **Test**.

### 3. Radarr -> carpeta de películas

En Radarr: **Settings -> Media Management -> Root Folder -> Add Root Folder**

- Ruta: `/movies` (mapea a la biblioteca NFS).

### 4. Jellyfin

En el asistente inicial, agrega la biblioteca:

- Tipo: **Movies**.
- Folder: `/data/movies`.

### 5. Jellyseerr

El asistente pide conectar Jellyfin, Radarr y (opcional) Prowlarr:

- Jellyfin URL: `http://jellyfin.media.svc.cluster.local:8096`
- Radarr URL: `http://radarr.media.svc.cluster.local:7878`

Luego los usuarios piden películas desde `https://jellyseerr.finalq.xyz`.

### 6. Bazarr (subtítulos)

Bazarr solo trackea películas que ya tienen archivo en `/movies`.

- **Settings -> Radarr**: host `radarr.media.svc.cluster.local`, puerto `7878`, API key de Radarr.
- **Settings -> Languages**: perfil `Español Latam > España > Inglés`, cutoff en Inglés. Asignarlo como default de películas.
- **Settings -> Providers**: habilitar OpenSubtitles.com con usuario y contraseña. Bazarr usa su propia API key.
- **Settings -> Jellyfin**: URL `http://jellyfin.media.svc.cluster.local:8096`, API key de Jellyfin, activar "Update movie library". Así Jellyfin detecta el subtítulo al instante (NFS no dispara el monitoreo en tiempo real).

### 7. Radarr -> Jellyfin al importar

Jellyfin no detecta archivos nuevos por NFS (inotify no ve los cambios de otro contenedor). Para que la película aparezca al instante, Radarr ejecuta un script al importar.

- El script vive en el ConfigMap `radarr-scripts` y se monta en `/scripts/refresh-jellyfin.sh`.
- El token de Jellyfin viene del secret `jellyfin-api-key` (clave `api-key`), montado en `/scripts/secret`.

El secret se crea a mano (no se versiona):

```bash
kubectl -n media create secret generic jellyfin-api-key \
  --from-literal=api-key='<JELLYFIN_API_KEY>'
```

Conexión en Radarr: **Settings -> Connect -> Custom Script**

- Path: `/scripts/refresh-jellyfin.sh`
- Events: **On Import** y **On Upgrade**.

### 8. Trackers de qBittorrent (CronJob)

qBittorrent solo acepta **una** URL en "Automatically append trackers from URL". Para combinar varias fuentes hay un CronJob diario:

- `configmap-trackers-cron.yaml`: script Python que descarga y mezcla.
- `cronjob-trackers.yaml`: corre todos los días a las 04:00.

Fuentes: XIU2 `all.txt`, NewTrackon `live` y ngosang `best`. El script las une, saca repetidos, y escribe la lista en `add_trackers` de qBittorrent. Usa el secret `qbittorrent-credentials`.

Notas:

- `add_trackers_from_url` queda desactivado: el CronJob es la única fuente.
- Prueba manual:
  ```bash
  kubectl -n media create job trackers-test --from=cronjob/qbittorrent-trackers
  ```

## Notas

- Todos los pods usan `nodeSelector: media-node=true` y `fsGroup: 1000`.
- Si cambias la ruta NFS, edita `pv-pvc-movies-nfs.yaml`.
