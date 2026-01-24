# IMPLEMENTACIÓN — Buscador Local de EPUBs (Biblioteca Secreta) con Meilisearch + k3s + NFS

## Objetivo

Tener un **buscador “tipo Netflix/Google”** para la biblioteca masiva (152.080 EPUBs) usando:

- **Meilisearch** como motor de búsqueda (typos, ranking, filtros, etc.)
- **Un Job indexador** que carga `indice.json` a Meilisearch
- **UI Web existente** (`indice-web`) servida con **nginx**
- **Descarga directa** de `.epub` via HTTP desde el mismo dataset del NAS
- Más adelante: **bot de Telegram** que hace búsqueda cross (local → Lazy)

> Nota: esta implementación NO requiere Calibre, NO genera `metadata.db`, y NO duplica los EPUBs.

---

## Dataset (NAS)

Se asume este layout en el NAS:

```
/data/exports/media/books/Biblioteca-Secreta-2026/
├── indice-web/              # UI web ya armada (HTML/CSS/JS)
├── indice.json              # índice descomprimido (JSON array gigante)
├── indice.json.gz           # comprimido original (opcional)
└── biblioteca/              # árbol con EPUBs
    ├── _Otros/...
    ├── Whitney_G/...
    └── ...
```

Y el NAS está accesible desde k3s por NFS en `10.1.0.152`.

---

## Namespace y Stack

Namespace usado:

- `media`

Servicios existentes (referencia):

- `lazylibrarian` (books.finalq.xyz)
- `prowlarr` (prowlarr.finalq.xyz)
- `qbittorrent` (qbittorrent.finalq.xyz)

Vamos a agregar:

- `biblioteca-secreta-web` (biblioteca.finalq.xyz)  ✅ ya lo tenés andando
- `meilisearch` (interno o opcional por Ingress)
- `biblioteca-indexer` (Job, manual)

---

# Parte A — Servir la web del dump (`indice-web`) (nginx)

✅ Ya lo tenés funcionando, pero dejo el concepto para contexto.

La web se expone en:

- `https://biblioteca.finalq.xyz`

Y los `.epub` se acceden en:

- `https://biblioteca.finalq.xyz/biblioteca/<filename>`

Ejemplo:

- `https://biblioteca.finalq.xyz/biblioteca/_Otros/Alexander-Luis_de_Carlos_Bertran.epub`

---

# Parte B — Meilisearch (motor de búsqueda)

## 1) PVC de Meilisearch

Archivo: `pvc-meili.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: meili-data
  namespace: media
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: local-path
```

> Este PVC guarda el índice interno de Meilisearch.
> 20Gi suele sobrar para 152k documentos con metadatos moderados.

---

## 2) Deployment de Meilisearch

Archivo: `deployment-meili.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meilisearch
  namespace: media
  labels:
    app: meilisearch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: meilisearch
  template:
    metadata:
      labels:
        app: meilisearch
    spec:
      nodeSelector:
        media-node: "true"
      containers:
        - name: meilisearch
          image: getmeili/meilisearch:v1.12
          ports:
            - name: http
              containerPort: 7700
          env:
            - name: MEILI_ENV
              value: "production"
            - name: MEILI_NO_ANALYTICS
              value: "true"

            # Recomendado: habilitar master key (ver sección Secrets)
            # - name: MEILI_MASTER_KEY
            #   valueFrom:
            #     secretKeyRef:
            #       name: meili-secret
            #       key: MASTER_KEY

          volumeMounts:
            - name: data
              mountPath: /meili_data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: meili-data
```

---

## 3) Service interno

Archivo: `service-meili.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: meilisearch
  namespace: media
spec:
  selector:
    app: meilisearch
  ports:
    - name: http
      port: 7700
      targetPort: 7700
```

Esto permite que el indexer hable con Meili por:

- `http://meilisearch:7700`

---

## 4) (Opcional) Secret MEILI_MASTER_KEY

**Recomendado** si vas a exponer el search por Ingress o usarlo desde clientes externos.

Archivo: `secret-meili.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: meili-secret
  namespace: media
type: Opaque
stringData:
  MASTER_KEY: "CAMBIAR_ESTE_VALOR"
```

Luego habilitás en el deployment:

```yaml
- name: MEILI_MASTER_KEY
  valueFrom:
    secretKeyRef:
      name: meili-secret
      key: MASTER_KEY
```

---

# Parte C — Montaje NFS del dataset para el indexer

## PV/PVC NFS del dataset
La opción limpia es tener un PV/PVC que monte:

- `/data/exports/media/books/Biblioteca-Secreta-2026`

Montado en el pod como:

- `/data`

✅ Si ya existe un PVC como `biblioteca-secreta-nfs`, se reutiliza.

Si no existe, ejemplo (manual):

Archivo: `pv-pvc-biblioteca-secreta-nfs.yaml`

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-biblioteca-secreta-nfs
spec:
  capacity:
    storage: 400Gi
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: nfs-manual
  mountOptions:
    - vers=4
  nfs:
    server: 10.1.0.152
    path: /data/exports/media/books/Biblioteca-Secreta-2026
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: biblioteca-secreta-nfs
  namespace: media
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 400Gi
  storageClassName: nfs-manual
  volumeName: pv-biblioteca-secreta-nfs
```

---

# Parte D — Indexer Job (import JSON → Meilisearch)

## 1) Qué indexamos

Cada documento del JSON tiene campos como:

- `libid` (id único) ✅ será `primaryKey`
- `title`
- `authors[]`
- `description`
- `labels[]`
- `published`
- `pagecount`
- `sha256sum`
- `size`
- `filename` ✅ para construir link de descarga

---

## 2) Settings del índice en Meilisearch

Vamos a setear:

- `primaryKey`: `libid`
- `searchableAttributes`: `title`, `authors`, `labels`, `description`
- `filterableAttributes`: `labels`, `published`
- `sortableAttributes`: `published`, `pagecount`, `size`

Esto permite:

- buscar por autor/título/labels
- filtrar por `labels`, `published`

---

## 3) Job de indexación (Node)

Archivo: `job-biblioteca-indexer.yaml`

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: biblioteca-indexer
  namespace: media
spec:
  backoffLimit: 1
  template:
    spec:
      nodeSelector:
        media-node: "true"
      restartPolicy: Never
      containers:
        - name: indexer
          image: node:20-alpine
          env:
            - name: MEILI_HOST
              value: "http://meilisearch:7700"
            - name: MEILI_INDEX
              value: "biblioteca"
            - name: JSON_PATH
              value: "/data/indice.json"
            - name: BATCH_SIZE
              value: "1000"

            # Si activás MASTER KEY:
            # - name: MEILI_API_KEY
            #   valueFrom:
            #     secretKeyRef:
            #       name: meili-secret
            #       key: MASTER_KEY

          command: ["sh", "-lc"]
          args:
            - |
              set -e

              npm i -g pnpm >/dev/null 2>&1 || true
              mkdir -p /app
              cd /app

              cat > package.json <<'JSON'
              {
                "name": "biblioteca-indexer",
                "type": "module",
                "dependencies": {
                  "meilisearch": "^0.45.0"
                }
              }
              JSON

              pnpm install --silent

              cat > indexer.mjs <<'JS'
              import fs from "node:fs";
              import { MeiliSearch } from "meilisearch";

              const MEILI_HOST = process.env.MEILI_HOST;
              const MEILI_INDEX = process.env.MEILI_INDEX || "biblioteca";
              const JSON_PATH = process.env.JSON_PATH;
              const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "1000", 10);

              const MEILI_API_KEY = process.env.MEILI_API_KEY;

              if (!MEILI_HOST) throw new Error("MEILI_HOST missing");
              if (!JSON_PATH) throw new Error("JSON_PATH missing");

              const client = new MeiliSearch({
                host: MEILI_HOST,
                apiKey: MEILI_API_KEY,
              });

              console.log(`[indexer] reading ${JSON_PATH}...`);
              const raw = fs.readFileSync(JSON_PATH, "utf-8");
              const arr = JSON.parse(raw);

              console.log(`[indexer] items=${arr.length}`);

              const index = client.index(MEILI_INDEX);

              console.log("[indexer] updating settings...");
              await index.updateSettings({
                primaryKey: "libid",
                searchableAttributes: ["title", "authors", "labels", "description"],
                filterableAttributes: ["labels", "published"],
                sortableAttributes: ["published", "pagecount", "size"],
              });

              const docs = arr.map((x) => ({
                libid: x.libid,
                title: x.title,
                authors: x.authors ?? [],
                description: x.description ?? "",
                labels: x.labels ?? [],
                published: x.published ?? null,
                pagecount: x.pagecount ?? null,
                sha256sum: x.sha256sum ?? null,
                size: x.size ?? null,
                filename: x.filename,
              }));

              console.log(`[indexer] uploading batches of ${BATCH_SIZE}...`);

              for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                const batch = docs.slice(i, i + BATCH_SIZE);
                const task = await index.addDocuments(batch);
                console.log(`[indexer] batch ${i}..${i + batch.length - 1} taskUid=${task.taskUid}`);
              }

              console.log("[indexer] done");
              JS

              node indexer.mjs
          volumeMounts:
            - name: biblioteca-data
              mountPath: /data
              readOnly: true
      volumes:
        - name: biblioteca-data
          persistentVolumeClaim:
            claimName: biblioteca-secreta-nfs
```

---

# Parte E — Integración con tu Ingress existente (opcional)

Si querés exponer Meilisearch vía hostname (LAN), agregás una regla:

- `search.finalq.xyz` → `meilisearch:7700`

```yaml
- host: search.finalq.xyz
  http:
    paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: meilisearch
            port:
              number: 7700
```

⚠️ Si hacés esto, activá `MEILI_MASTER_KEY`.

---

# Parte F — Validación (paso a paso)

## 1) Ver pods
```bash
kubectl -n media get pods -o wide | egrep "meili|indexer"
```

## 2) Probar acceso interno (port-forward)
```bash
kubectl -n media port-forward svc/meilisearch 7700:7700
```

Health:
```bash
curl -s http://127.0.0.1:7700/health
```

## 3) Correr el Job (indexar)
Logs:
```bash
kubectl -n media logs -f job/biblioteca-indexer
```

## 4) Probar búsqueda
```bash
curl -s   -X POST "http://127.0.0.1:7700/indexes/biblioteca/search"   -H "Content-Type: application/json"   --data '{"q":"asimov","limit":5}' | jq
```

---

# Parte G — Uso desde Telegram (diseño)

El bot hace:

1) Search (Meili):
- `POST /indexes/biblioteca/search`

2) Cuando elegís un resultado:
- el bot construye URL:
  - `https://biblioteca.finalq.xyz/biblioteca/<filename>`

y manda el link (o descarga y reenvía si querés).

---

# Checklist final

✅ NFS dataset montado en k3s  
✅ nginx sirviendo `indice-web` + `/biblioteca`  
✅ Meilisearch desplegado con PVC  
✅ Job indexer carga `indice.json`  
✅ búsqueda funcionando (`asimov`)  
✅ link directo a epub funciona (via nginx)  
✅ Telegram bot puede consultar Meili
