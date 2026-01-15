# Implementación (K3s) — Prowlarr + Readarr + qBittorrent (stack “arr” para libros) — sin NAS (local-path)

## Objetivo
Tener una **web local** donde:
1) Buscás libros (Readarr)
2) Readarr consulta indexers gestionados en UI (Prowlarr)
3) Readarr manda a descargar (qBittorrent)
4) Se guarda en volúmenes persistentes (PVC local-path)
5) Queda listo para escalar a otros *arr* (Sonarr/Radarr/etc.)

---

## 0) Decisión de arquitectura: ¿qBittorrent en el mismo pod o separado?

### ✅ Recomendación: **separado**
**qBittorrent debe ir como Deployment propio**, no dentro del mismo pod que Readarr, por estos motivos:

- **Reutilización**: el mismo qBittorrent puede servir a Readarr + Sonarr + Radarr.
- **Escalabilidad y aislamiento**: si un downloader se cuelga o se reinicia, no te tira Readarr.
- **Seguridad**: podés aplicar NetworkPolicies / Ingress / credenciales por componente.
- **Mantenibilidad**: upgrades y debugging más simples (logs separados, healthchecks).
- **Evolución del stack**: si mañana cambiás qBittorrent por Transmission o SABnzbd, no tocás Readarr.

📌 Nota:
- qBittorrent no es “multi-replica friendly” con el mismo /downloads. Lo normal es **1 réplica**.

---

## 1) Requisitos / Supuestos

### Cluster
- Tenés K3s funcional.
- Tenés StorageClass `local-path` disponible (por defecto en K3s).

Verificar:
```bash
kubectl get storageclass
```

### Limitación por no tener NAS
- `local-path` crea el PV **en el nodo donde corre el pod**.
- Para evitar que te rompa por reschedule, vamos a “pinear” todo a un nodo.

---

## 2) Selección y “pin” de nodo (recomendado)

### 2.1 Ver nodos
```bash
kubectl get nodes -o wide
```

### 2.2 Elegir un nodo para “media”
Ejemplo: `k3s-worker-1`

### 2.3 Etiquetarlo
```bash
kubectl label node k3s-worker-1 media-node=true
```

Esto permite que todas las apps queden en el mismo nodo (y por lo tanto los PVC `local-path` también).

---

## 3) Diseño de volúmenes y paths

Vamos a usar estos volúmenes persistentes:

### qBittorrent
- `/config` → config del cliente
- `/downloads` → donde descarga los torrents

### Readarr
- `/config` → base de datos + config
- `/downloads` → para importar desde el downloader
- `/books` → librería final

### Prowlarr
- `/config` → base de datos + config

📌 Importante:
- Readarr y qBittorrent deben compartir el concepto de “downloads path”.
- En Kubernetes eso se hace con **PVCs separados** (cada uno con su PV) pero apuntando al mismo “tipo de ruta” dentro del contenedor.
- Sin NAS, lo más fácil es que Readarr use **su propio `/downloads`**, y que la importación se haga porque Readarr ve el “completed dir” (en su volumen).  
  Para que sea 100% consistente, lo ideal es **un PVC de downloads compartido** entre Readarr y qBittorrent.

✅ Por eso vamos a crear un **PVC común**: `downloads-data`.

---

## 4) Manifiestos (stack completo)

Guardá esto como:
`media-arr-books-stack.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: media
---
############################################################
# PVC compartido: Downloads
############################################################
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: downloads-data
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 200Gi
  storageClassName: local-path
---
############################################################
# Prowlarr PVC
############################################################
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prowlarr-config
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: local-path
---
############################################################
# Readarr PVC
############################################################
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: readarr-config
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: local-path
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: readarr-books
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 200Gi
  storageClassName: local-path
---
############################################################
# qBittorrent PVC
############################################################
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qbittorrent-config
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: local-path
---
############################################################
# qBittorrent
############################################################
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qbittorrent
  namespace: media
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qbittorrent
  template:
    metadata:
      labels:
        app: qbittorrent
    spec:
      nodeSelector:
        media-node: "true"
      containers:
        - name: qbittorrent
          image: lscr.io/linuxserver/qbittorrent:latest
          env:
            - name: PUID
              value: "1000"
            - name: PGID
              value: "1000"
            - name: TZ
              value: "America/Argentina/Buenos_Aires"
            # Opcional: fijar el puerto del WebUI
            - name: WEBUI_PORT
              value: "8080"
          ports:
            - name: webui
              containerPort: 8080
          volumeMounts:
            - name: config
              mountPath: /config
            - name: downloads
              mountPath: /downloads
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: qbittorrent-config
        - name: downloads
          persistentVolumeClaim:
            claimName: downloads-data
---
apiVersion: v1
kind: Service
metadata:
  name: qbittorrent
  namespace: media
spec:
  selector:
    app: qbittorrent
  ports:
    - name: webui
      port: 8080
      targetPort: 8080
---
############################################################
# Prowlarr
############################################################
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prowlarr
  namespace: media
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prowlarr
  template:
    metadata:
      labels:
        app: prowlarr
    spec:
      nodeSelector:
        media-node: "true"
      containers:
        - name: prowlarr
          image: lscr.io/linuxserver/prowlarr:latest
          env:
            - name: PUID
              value: "1000"
            - name: PGID
              value: "1000"
            - name: TZ
              value: "America/Argentina/Buenos_Aires"
          ports:
            - name: http
              containerPort: 9696
          volumeMounts:
            - name: config
              mountPath: /config
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: prowlarr-config
---
apiVersion: v1
kind: Service
metadata:
  name: prowlarr
  namespace: media
spec:
  selector:
    app: prowlarr
  ports:
    - name: http
      port: 9696
      targetPort: 9696
---
############################################################
# Readarr
############################################################
apiVersion: apps/v1
kind: Deployment
metadata:
  name: readarr
  namespace: media
spec:
  replicas: 1
  selector:
    matchLabels:
      app: readarr
  template:
    metadata:
      labels:
        app: readarr
    spec:
      nodeSelector:
        media-node: "true"
      containers:
        - name: readarr
          image: lscr.io/linuxserver/readarr:latest
          env:
            - name: PUID
              value: "1000"
            - name: PGID
              value: "1000"
            - name: TZ
              value: "America/Argentina/Buenos_Aires"
          ports:
            - name: http
              containerPort: 8787
          volumeMounts:
            - name: config
              mountPath: /config
            - name: downloads
              mountPath: /downloads
            - name: books
              mountPath: /books
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: readarr-config
        - name: downloads
          persistentVolumeClaim:
            claimName: downloads-data
        - name: books
          persistentVolumeClaim:
            claimName: readarr-books
---
apiVersion: v1
kind: Service
metadata:
  name: readarr
  namespace: media
spec:
  selector:
    app: readarr
  ports:
    - name: http
      port: 8787
      targetPort: 8787
```

---

## 5) Exposición “rápida” con NodePort (100% local, sin Ingress)

Agregá este bloque al final del mismo YAML (o como archivo separado):

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: qbittorrent-nodeport
  namespace: media
spec:
  type: NodePort
  selector:
    app: qbittorrent
  ports:
    - name: webui
      port: 8080
      targetPort: 8080
      nodePort: 30080
---
apiVersion: v1
kind: Service
metadata:
  name: prowlarr-nodeport
  namespace: media
spec:
  type: NodePort
  selector:
    app: prowlarr
  ports:
    - name: http
      port: 9696
      targetPort: 9696
      nodePort: 30696
---
apiVersion: v1
kind: Service
metadata:
  name: readarr-nodeport
  namespace: media
spec:
  type: NodePort
  selector:
    app: readarr
  ports:
    - name: http
      port: 8787
      targetPort: 8787
      nodePort: 30787
```

Acceso:
- qBittorrent: `http://<IP-NODO>:30080`
- Prowlarr: `http://<IP-NODO>:30696`
- Readarr: `http://<IP-NODO>:30787`

---

## 6) Deploy

```bash
kubectl apply -f media-arr-books-stack.yaml
kubectl -n media get pods -o wide
kubectl -n media get svc
kubectl -n media get pvc
```

---

## 7) Configuración web (lo importante)

### 7.1 qBittorrent (una vez)
Entrá a qBittorrent:
- `http://<IP-NODO>:30080`

En Settings:
- Downloads:
  - Default save path: `/downloads`
  - (opcional) Completed: `/downloads/complete`
  - (opcional) Incomplete: `/downloads/incomplete`

Dejalo simple al principio:
- `/downloads`

---

### 7.2 Readarr → agregar Download Client (qBittorrent)
Entrá a Readarr:
- `http://<IP-NODO>:30787`

Ir a:
**Settings → Download Clients → +**

Elegir: **qBittorrent**

Valores:
- Host: `qbittorrent.media.svc.cluster.local`
- Port: `8080`
- Username/Password: los del WebUI
- Category: `readarr` (recomendado)
- (si pide) URL Base: vacío

**Test → Save**

📌 Path mappings:
- Readarr ve `/downloads` igual que qBittorrent (porque comparten PVC montado en ambos).

---

### 7.3 Prowlarr → Indexers
Entrá a Prowlarr:
- `http://<IP-NODO>:30696`

Ir a:
**Indexers → Add Indexer**

Acá es donde agregás 1 vez las fuentes. Todo por UI.

---

### 7.4 Prowlarr → conectar a Readarr (Apps)
En Prowlarr:
**Settings → Apps → +**

Elegir: **Readarr**

Valores:
- Name: `readarr`
- Readarr Server: `http://readarr.media.svc.cluster.local:8787`
- API Key: (la sacás desde Readarr → Settings → General)
- Sync Profiles: Enabled
- Test → Save

✅ Ahora Prowlarr le “empuja” indexers a Readarr.

---

## 8) Escalar a Sonarr / Radarr después

La gracia de este diseño es que ya dejaste:
- Prowlarr listo (solo sumás “Apps”)
- qBittorrent listo (reusable)

Cuando agregues Sonarr/Radarr:
- Montás el mismo PVC `downloads-data`
- Creás PVC para series/pelis
- En Prowlarr agregás App Sonarr/Radarr
- Listo.

📌 Sugerencia:
- Usá categorías separadas en qBittorrent:
  - `readarr`
  - `sonarr`
  - `radarr`

---

## 9) Notas de operación (sin NAS)

### 9.1 Qué pasa si se mueve un pod
Por eso los fijamos a `media-node=true`.

### 9.2 Backups
Esto no es como PBS de VMs.
Acá lo que te interesa backupear es:
- `/config` de Prowlarr
- `/config` de Readarr
- `/config` de qBittorrent

El resto (downloads/books) es data grande.

Cuando tengas NAS (NFS):
- movés `downloads-data` y `readarr-books` a un StorageClass NFS
- y ya no dependés del nodo.

---

## 10) Checklist final

✅ Namespace `media`  
✅ PVC `downloads-data` compartido  
✅ Deployments separados:
- qBittorrent
- Prowlarr
- Readarr  
✅ NodePorts para acceso local rápido  
✅ Conexiones:
- Readarr → qBittorrent
- Prowlarr → Readarr  

---

Si querés, te lo convierto a estructura GitOps (kustomize) lista para Argo CD.
