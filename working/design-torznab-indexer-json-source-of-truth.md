# Documento de diseño exhaustivo — Indexer Torznab interno (Prowlarr → LazyLibrarian → qBittorrent) usando JSON como única fuente de verdad

**Objetivo**  
Construir un servicio **Torznab/Newznab-compatible** (“indexer interno”) para que **Prowlarr** lo consulte y pueda proveer resultados a **LazyLibrarian**, con el fin de validar el **plumbing end‑to‑end** hasta **qBittorrent**.

**Restricción clave (acordada)**  
✅ **No se modifica la estructura del JSON**.  
✅ El JSON es la **única fuente de verdad**.  
✅ No se agregan campos (ISBN u otros).  
✅ Para pruebas de conectividad, se usará un **magnet dummy** (hash falso, estable) generado por el servicio.

> Este documento define un MVP implementable ya, sin ES/MariaDB. A futuro, el storage/backing store cambia, pero el contrato Torznab queda.

---

## 1) Stack actual (infra)

- Namespace: `media`
- Argo CD Application despliega:
  - `lazylibrarian` (pod)
  - `prowlarr` (pod)
  - `qbittorrent` (pod)
- PVC: `local-path` (sin NAS)

**Nuevo componente**: `internal-torznab-indexer` (pod)  
- Monta un volumen con records JSON para pruebas.
- Expone un Service ClusterIP.

---

## 2) Flujo end‑to‑end esperado (plumbing)

1. **LazyLibrarian** crea búsqueda por `title/author` o `isbn` (si corresponde).
2. Lazy consulta a **Prowlarr** (Prowlarr es el agregador de indexers).
3. **Prowlarr** consulta al indexer interno vía Torznab:
   - `GET /api?t=search&q=<texto>`
   - o `GET /api?t=book&isbn=<isbn>` (si el cliente lo usa)
4. `internal-torznab-indexer`:
   - carga records JSON desde el filesystem
   - filtra/scorea por query
   - si el record tiene `additional.torrent_paths[]`, devuelve items RSS Torznab
5. Prowlarr reexpone resultados a Lazy.
6. Lazy selecciona un release y lo “envía” a qBittorrent (con magnet dummy).

**Criterio de éxito**: el release aparece en Lazy (vía Prowlarr) y se observa el intento de add en qBittorrent (aunque no descargue nada por ser dummy).

---

## 3) JSON “record” como fuente de verdad (input)

### 3.1 Campos del JSON que vamos a usar (sin agregar nada)

Del ejemplo que compartiste, los campos relevantes son:

#### Datos bibliográficos (para título visible y búsqueda)
- `file_unified_data.title_best`
- `file_unified_data.author_best`
- `file_unified_data.extension_best`
- `file_unified_data.filesize_best`
- `file_unified_data.year_best`
- `file_unified_data.language_codes`

#### Ayuda para búsqueda (cuando exista)
- `search_only_fields.search_title`
- `search_only_fields.search_author`
- `search_only_fields.search_isbn13` (en el ejemplo está vacío)
- `search_only_fields.search_text` (campo grande útil para full text match)

#### Señal “tiene torrents”
- `additional.torrent_paths[]` (**source of truth**)
  - `collection`
  - `torrent_path`
  - `file_level1`
  - `file_level2`

**Nota**  
- `additional.download_urls[]` se considera UI-only. No se parsea HTML.
- La detección “bulk”/torrents se hace por `additional.torrent_paths`.

### 3.2 Qué significa “tiene torrents”
Un record se considera “torrenteable” si:

- `additional` existe
- `additional.torrent_paths` es array no vacío

---

## 4) Contrato Torznab (salida)

### 4.1 Endpoints mínimos

#### `GET /api?t=caps`
Devuelve capacidades del indexer:
- categorías (Books / EBooks)
- tipos de búsqueda soportados
- límites

#### `GET /api?t=search&q=<query>`
Búsqueda general por texto.

#### `GET /api?t=book&isbn=<isbn>` (y/o `q=...`)
Búsqueda “book aware”.  
**Importante**: si no hay ISBN en el JSON, esta query devolverá 0 resultados (por restricción).

> MVP: `t=book` puede internamente delegar en el mismo motor de `search`, solo cambiando el modo/target.

### 4.2 Formato de respuesta
RSS con namespaces de Torznab/Newznab, con `<item>` por release.

Campos mínimos por item:
- `<title>`
- `<guid isPermaLink="false">`
- `<pubDate>`
- `<size>`
- `<category>`
- `<enclosure url="..." length="..." type="application/x-bittorrent" />`
- `<torznab:attr name="seeders" value="0" />` (opcional)
- `<torznab:attr name="peers" value="0" />` (opcional)

### 4.3 Categoría recomendada (MVP)
Para pruebas:
- Usar categoría **Books / EBooks** con ID **7000** (estándar de Newznab).
- En `t=caps` publicar exactamente esa misma categoría y devolver el **mismo ID** en cada `<category>`.
- Evitar variaciones de texto/ID para que Prowlarr no marque incompatibilidades.

### 4.4 Ejemplo mínimo de `<item>` (con magnet dummy)
```xml
<item>
  <title>Example Title — Example Author (2021) [epub]</title>
  <guid isPermaLink="false">12345#path/to/torrent#level1</guid>
  <pubDate>Sat, 17 Jan 2026 10:00:00 GMT</pubDate>
  <size>1048576</size>
  <category>7000</category>
  <enclosure url="magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&amp;dn=Example%20Title" length="1048576" type="application/x-bittorrent" />
  <torznab:attr name="seeders" value="0" />
  <torznab:attr name="peers" value="0" />
</item>
```

---

## 5) Cómo se transforma un record JSON a un release Torznab

### 5.1 1 record → N releases
Decisión recomendada:
- Devolver **un release por cada entrada** de `additional.torrent_paths[]`

Esto se alinea con el comportamiento típico de indexers: múltiples opciones por resultado.

### 5.2 `title` del release
Construcción sugerida (determinista y legible):

- `"{title_best} — {author_best} ({year_best}) [{extension_best}]"`
- si falta `year_best`, omitir año.

### 5.3 `guid`
Debe ser único y estable. Sugerencia:

- `"{id}#{torrent_path}#{file_level1}"`
  - Si hay caracteres problemáticos, usar hash estable (p. ej. SHA1 del string completo) y devolver el hex.

### 5.4 `size`
- `file_unified_data.filesize_best`
  - Si falta o no es numérico, usar `0` para no romper el RSS.

### 5.5 `enclosure url` (clave para qBittorrent)
Restricción: tu JSON no trae magnet real.  
Para pruebas, generamos **magnet dummy** estable.

Ejemplo:
- `btih` dummy = hash estable derivado del `id` (p. ej. SHA1 del string y truncado a 40 hex)
- `dn` = display name (urlencoded title)

Magnet:
- `magnet:?xt=urn:btih:<BTIH_DUMMY>&dn=<DN>`

**Propósito**: validar que Lazy + qBittorrent aceptan el release y la cadena de llamadas funciona.

---

## 6) Motor de búsqueda (MVP)

### 6.1 Entradas de búsqueda
- `q` (texto libre)
- `isbn` (si llega por `t=book`)

### 6.2 Campos de match (en orden)
Para `q`:
1) `search_only_fields.search_title` (si existe)
2) `search_only_fields.search_author` (si existe)
3) `file_unified_data.title_best`
4) `file_unified_data.author_best`
5) `search_only_fields.search_text` (si existe)

Para `isbn`:
1) `search_only_fields.search_isbn13[]` (si existe y no vacío)
2) (opcional) buscar string dentro de `search_only_fields.search_text` si lo trae

### 6.3 Tokenización y score
- Normalizar a lowercase
- Tokenizar por whitespace y signos
- Opcional: normalizar diacríticos (NFD → sin acentos) para mejorar match en ES/EN
- Score simple:
  - match exacto token en título: +2
  - match exacto token en autor: +1
  - substring match en `search_text`: +0.5
- Ordenar por score desc, luego por tamaño desc (opcional)

### 6.4 Filtros
- Solo devolver records con `additional.torrent_paths` no vacío (para este MVP “torrent only”).
  - (si querés también “descarga directa”, se agrega después; hoy es out of scope)

---

## 7) Diseño del servicio `internal-torznab-indexer`

### 7.1 Responsabilidades
- Cargar records desde `/data/records/*.json` (en startup)
- Exponer endpoints Torznab
- Responder RSS válido
- Loguear solicitudes y resultados

### 7.2 Configuración (env vars)
- `PORT` (default 8080)
- `DATA_DIR` (default `/data/records`)
- `BASE_URL` (opcional; si no, se construye por request host)

### 7.3 Estructura de proyecto sugerida
- `cmd/` (si Go) o raíz (si Node)
- `data/` (si empaquetás ejemplos)
- `README.md`
- `k8s/` manifests (Deployment/Service/PVC)

---

## 8) Kubernetes / Argo CD (namespace media)

### 8.1 Manifests mínimos
- `Deployment`:
  - 1 réplica
  - monta volumen `/data/records`
  - expone `containerPort: 8080`
- `Service` ClusterIP:
  - `name: internal-torznab-indexer`
  - `port: 8080 → targetPort: 8080`
- `PVC` local-path:
  - size mínimo para JSON (p. ej. 100Mi)

### 8.2 DNS interno a usar en Prowlarr
- `http://internal-torznab-indexer.media.svc.cluster.local:8080/api`

---

## 9) Configuración en Prowlarr

1. Settings → Indexers → Add Indexer
2. Torznab → “Custom Torznab”
3. URL:
   - `http://internal-torznab-indexer:8080/api`
4. Test:
   - Debe llamar `t=caps` y validar OK.

> Nota: Prowlarr dentro del mismo namespace puede resolver por service name sin FQDN.

---

## 10) Pruebas (manuales y de integración)

### 10.1 Pruebas con curl
- `GET /api?t=caps`
- `GET /api?t=search&q=tolkien`
- `GET /api?t=book&isbn=978...` (si el JSON tiene ISBN, si no: 0 resultados)

### 10.2 Validación de plumbing
1. En Prowlarr: Test del indexer OK
2. En Lazy: ejecutar búsqueda y ver resultados
3. Seleccionar release → enviar a qBittorrent
4. En qBittorrent: observar el intento de add (quedará “stalled” o fallará, esperado)

---

## 11) Observabilidad y debugging

### Logs recomendados
- request: método, params (`t`, `q`, `isbn`)
- resultado: cantidad de matches, cantidad de items devueltos
- parsing: errores de JSON (archivo corrupto)

### Errores esperados
- magnet dummy no descarga → OK (objetivo es plumbing)

---

## 12) Preguntas de implementación (para empezar ya)

Ya respondidas:
- Namespace: `media`
- Dataset: manual local (PVC local-path)
- Búsqueda: title/author/isbn (solo si existe en JSON)
- JSON: no se modifica

Faltaría decidir (pero el documento asume una opción razonable):
- **1 record → N releases** (uno por `torrent_paths[]`)
- `enclosure` = **magnet dummy** (más simple y compatible)

---

## 13) Checklist de arranque (lo necesario para implementar)

1. Elegir lenguaje (Node o Go).
2. Implementar parser de records desde filesystem.
3. Implementar:
   - `/api?t=caps`
   - `/api?t=search&q=...`
   - `/api?t=book&isbn=...` (alias)
4. Serializar RSS Torznab.
5. K8s manifests en `media`:
   - Deployment + Service + PVC
6. Configurar indexer en Prowlarr y testear.
7. Validar Lazy → qBittorrent.

---

## 14) Apéndice: Qué NO vamos a usar del JSON (en este MVP)

- `additional.download_urls[]` (UI)
- Cualquier HTML embebido en hints
- `partner_url_paths` (no aplica al MVP)
- Descargas directas (HTTP) (fuera de alcance)

---

## 15) Apéndice: Reglas claras de “source of truth”

- **Torrents disponibles**: `additional.torrent_paths[]`
- **Tamaño/metadata**: `file_unified_data.*` (best)
- **Búsqueda textual**: `search_only_fields.*` cuando exista

