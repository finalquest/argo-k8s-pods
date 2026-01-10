# Tokyo Bot — Consultas de trenes (Google Transit) — Plan de implementación

**Objetivo:** extender el bot de Telegram (tokyo-bot) para que pueda responder consultas del tipo:
- “Estoy en *Itabashi* y quiero hacer el itinerario de *Chichibu* mañana, ¿qué trenes hay?, ¿desde qué estación conviene salir?, ¿requiere reserva?”

La solución usará **Google Directions API (mode=transit)**, ejecutada por scripts del bot (ya tiene API key disponible), y Codex quedará como **capa de explicación** (no como ejecutor de la API).

---

## 1) Alcance y criterios de éxito

### 1.1 Alcance
- Resolver **rutas en transporte público** (tren/subte) entre:
  - **Origen:** ubicación actual (texto) o estación recomendada cercana
  - **Destino:** estación / punto de arranque del itinerario (idealmente estación) o POI principal
- Devolver:
  1) Estación de salida recomendada
  2) 1–3 opciones de tren (con horarios, duración, transbordos)
  3) Heurística “requiere reserva / recomendado reservar”
  4) Notas de contexto (primer tren, alternativa sin reserva, etc.)

### 1.2 Fuera de alcance (por ahora)
- Tarifas exactas (precio) por opción.
- Confirmación real de disponibilidad de asientos / compra de tickets.
- Cambios en tiempo real (alertas de demoras).

### 1.3 Criterios de éxito
- Para una query típica (ej. Itabashi → Chichibu), el bot responde con:
  - una estación de salida razonable (ej. Ikebukuro),
  - opciones transit plausibles (Seibu/JR según corresponda),
  - horarios coherentes para la fecha/hora pedida,
  - y un campo claro de reserva (aunque sea heurístico).

---

## 2) Arquitectura propuesta

### 2.1 Principio clave
**Codex NO llama a Google.**  
El bot:
1) detecta intención de “direcciones / trenes / horarios”
2) llama al script `transit_directions`
3) normaliza a un JSON estable
4) le pasa a Codex ese JSON para que lo explique en lenguaje natural

Esto evita:
- alucinaciones de horarios,
- prompts gigantes,
- y acoplar Codex a detalles de API.

### 2.2 Diagrama (alto nivel)

```
Telegram → Bot Router
             ├─ Itinerary Mode (crear/editar itinerarios con Codex)
             └─ Transit Mode (direcciones)
                    ├─ Script: transit_directions (Google Directions API)
                    ├─ Script: itinerary_resolve (parse del .md y destino)
                    └─ Codex: explain_transit (resumen humano + recomendaciones)
```

---

## 3) Cambios funcionales en el bot

### 3.1 Nuevo “modo” / intención: TRANSIT_QUERY
Detectar cuando el usuario pide:
- “cómo llegar”, “direcciones”, “trenes”, “horarios”, “timing”, “salidas”, “estación”, “reservar”, “limited express”, “seat”, “特急”, etc.

**Regla práctica:** si el mensaje contiene señales de transporte **y** referencia a un itinerario/POI, entra en TRANSIT_QUERY.

### 3.2 Cambios en el prompt actual de Codex

En el prompt que hoy usás para generar/editar itinerarios, agregá explícitamente una rama:

- Si el usuario pide **direcciones / trenes / horarios**, el bot debe:
  1. Ejecutar el script `transit_directions` con los parámetros normalizados.
  2. Incluir el JSON de resultado (normalizado) en el contexto.
  3. Pedirle a Codex que **solo explique y recomiende**, sin inventar horarios.

#### 3.2.1 Contrato de “tools” (alto nivel)
Si tu integración con Codex soporta “tool calling”, definí un tool:
- `transit_directions(input) -> TransitPlan`
- (y opcionalmente) `itinerary_resolve(input) -> ItineraryTarget`

Si NO soporta tool calling, lo implementás como:
- bot detecta intención
- bot corre script
- bot inyecta resultado al prompt

### 3.3 Mensajería: el bot debe ser explícito
Cuando la consulta entra en TRANSIT_QUERY, la respuesta debe incluir:
- Fecha y hora tomadas como “salida” (y la zona horaria JST)
- Estación de salida elegida (y por qué)
- 1–3 opciones resumidas
- Reserva: “requiere / recomendado / no” (heurístico)

---

## 4) Diseño del script principal: `transit_directions`

### 4.1 Ubicación y estructura
Dentro del repo del bot (tokyo-bot):
- `src/scripts/transit/transit_directions.js` (módulo ES6 exportable)
- `src/scripts/transit/normalize.js` (funciones de normalización)
- `src/scripts/transit/types.js` (definiciones de tipos como JSDoc o comentarios)
- `src/scripts/transit/cache.js` (opcional, cache en memoria)

**Nota:** Los scripts son módulos ES6 que se importan en `src/index.js` usando `import`. No son comandos ejecutables, sino funciones exportadas.

### 4.2 Entradas (Input JSON)
```json
{
  "origin": {
    "label": "Itabashi",
    "lat": null,
    "lng": null
  },
  "destination": {
    "label": "Seibu-Chichibu Station",
    "lat": null,
    "lng": null
  },
  "departure": {
    "iso": "2026-03-28T07:30:00+09:00",
    "tz": "Asia/Tokyo"
  },
  "preferences": {
    "alternatives": true,
    "max_transfers": 2,
    "max_walk_minutes": 15
  }
}
```

Notas:
- Si no tenés lat/lng, Google Directions acepta texto (recomendado: “Station, City”).
- `departure.iso` debe ser JST (Asia/Tokyo).

### 4.3 Llamada a Google Directions API

Endpoint:
- `GET https://maps.googleapis.com/maps/api/directions/json`

Params mínimos:
- `origin`
- `destination`
- `mode=transit`
- `departure_time=<unix epoch seconds>`
- `alternatives=true`
- `region=jp`
- `language=en` (o `ja` si preferís nombres en japonés)
- `key=$GOOGLE_MAPS_API_KEY` (variable de entorno del secret `tokyo-bot-secrets`)

**Nota:** `departure_time` debe ser epoch en segundos. Para JST, convertir desde ISO con TZ.

### 4.4 Normalización (output estable para Codex)

El script debe retornar un JSON “limpio” con:
- `query` (origen/destino/fecha)
- `best` (opción principal)
- `alternatives[]` (0..N)
- `warnings[]` (si hubo fallback, ambigüedad, etc.)

#### 4.4.1 Esquema sugerido: `TransitPlan`
```json
{
  "query": {
    "origin": "Ikebukuro Station, Tokyo",
    "destination": "Seibu-Chichibu Station, Saitama",
    "departure_iso": "2026-03-28T07:30:00+09:00"
  },
  "best": {
    "summary": "Ikebukuro → Seibu-Chichibu (Seibu Limited Express)",
    "departure": "07:30",
    "arrival": "08:50",
    "duration_minutes": 80,
    "transfers": 0,
    "walk_minutes_total": 6,
    "legs": [
      {
        "type": "WALK",
        "from": "Ikebukuro Station",
        "to": "Seibu Ikebukuro Line platform",
        "duration_minutes": 4
      },
      {
        "type": "RAIL",
        "from": "Ikebukuro Station",
        "to": "Seibu-Chichibu Station",
        "operator": "Seibu Railway",
        "line": "Limited Express",
        "headsign": "Chichibu",
        "num_stops": 0,
        "duration_minutes": 72
      }
    ],
    "reservation": {
      "required": "heuristic_yes",
      "reason": "Contains 'Limited Express' / 特急 / known service name"
    }
  },
  "alternatives": [],
  "warnings": []
}
```

#### 4.4.2 Heurística de reserva (v1)
Marcar `reservation.required = heuristic_yes` si:
- `transit_details.line.name` o `short_name` contiene:
  - “Limited Express”, “Ltd. Exp”, “特急”, “Reserved”, “Laview”, “Romancecar”, “Azusa”, etc.
- o si el `vehicle.type` es `RAIL` y el servicio está en una lista configurable.

Marcar `heuristic_no` si:
- solo hay trenes locales/rapid sin señales de Limited Express.

Marcar `unknown` si:
- la ruta no tiene `transit_details` claros (edge cases).

⚠️ Importante: explicitar “heurístico” en la UI para no afirmar con certeza absoluta.

### 4.5 Filtrado / scoring de rutas
Al normalizar, asignar un `score` para ordenar rutas:
- penalizar: transfers altos, caminatas largas, duración total mayor
- bonus: menos transfers, menos walk, salida cercana al rango pedido

Ejemplo:
- `score = duration + transfers*20 + walk_minutes*2` (simple y efectivo)

### 4.6 Caching (recomendado)
Para evitar costos y latencia:
- cachear por `(origin,destination,departure_time_bucket)`.
- bucket: cada 5–10 min.
- TTL: 15–30 min.

Cache en:
- memoria (si el pod es único)
- o Redis (si ya lo usás en tu cluster)

---

## 5) Script auxiliar: `itinerary_resolve` (destino real)

### 5.1 Motivación
No pasar “Chichibu” genérico. Pasar:
- estación o POI inicial del itinerario

### 5.2 Input
```json
{
  "itinerary_id": "chichibu",
  "repo_path": "/data/tokyo2026",
  "date": "2026-03-28"
}
```

### 5.3 Output
```json
{
  "destination": {
    "label": "Seibu-Chichibu Station, Saitama"
  },
  "first_poi": "Hitsujiyama Park",
  "notes": ["Destination station inferred from itinerary frontmatter/stops"]
}
```

### 5.4 Estrategia v1
- Si el `.md` tiene frontmatter con `start_station` o similar → usarlo.
- Si no, buscar en el texto “Station” / “駅” cercano al inicio.
- Fallback: usar el título del itinerary + “Station”.

Esto se puede ir puliendo después con Places API, pero no es necesario para arrancar.

---

## 6) Integración con Codex: `explain_transit`

### 6.1 Prompt (lineamientos)
El prompt debe decirle a Codex:
- “Usá el JSON provisto como fuente de verdad”
- “No inventes horarios ni estaciones”
- “Si faltan datos, decí que faltan (warnings) y proponé una pregunta breve”
- Output: Markdown para Telegram

### 6.2 Output esperado (formato)
- título: `🚆 Origen → Destino`
- bloque “Salida recomendada” (best)
- bloque “Alternativas” (si hay)
- bloque “Reserva” (marcando heurístico)
- bloque “Notas” (transfers, walk, última salida razonable, etc.)

---

## 7) Variables de entorno / Secrets

### 7.1 Requeridas (ya disponibles)
- `GOOGLE_MAPS_API_KEY` (Directions API habilitada) - **Ya existe en secret `tokyo-bot-secrets`**
- `TZ=Asia/Tokyo` (ideal para consistencia) - Puede agregarse al ConfigMap si no está

### 7.2 Opcionales (agregar al ConfigMap)
- `TRANSIT_ENABLED=true` (feature flag)
- `TRANSIT_LANGUAGE=en|ja` (default: `en`)
- `TRANSIT_REGION=jp` (default: `jp`)
- `TRANSIT_CACHE_TTL_SECONDS=1800` (default: 30 min)
- `TRANSIT_MAX_TRANSFERS=2` (default: 2)
- `TRANSIT_MAX_WALK_MINUTES=15` (default: 15)

---

## 8) Observabilidad

Loggear (sin filtrar data sensible):
- request_id
- origin/destination (strings)
- departure_time
- status de Google (`OK`, `ZERO_RESULTS`, etc.)
- latencia total
- ruta seleccionada (resumen)

Métricas útiles:
- count por status
- cache hit rate
- p95 latency

---

## 9) Testing

### 9.1 Unit tests
- normalización: transformar respuesta de Google a `TransitPlan`
- heurística reserva: casos “Limited Express” / “local”

### 9.2 Integration tests (mock)
- fixture JSON de Google (grabado)
- validar que `best` y `alternatives` salen ordenadas

### 9.3 Smoke manual
- Itabashi → Chichibu
- Asakusa → Nikko
- Shinjuku → Hakone-Yumoto

---

## 10) Plan de rollout

1) Implementar scripts + normalizador
2) Integrar router del bot para detectar TRANSIT_QUERY
3) Añadir prompt `explain_transit`
4) Activar detrás de feature flag:
   - `TRANSIT_ENABLED=true`
5) Monitorear logs y costos 48–72h
6) Ajustar scoring / heurística

---

## 11) Apéndice — Respuestas de error (UX)

- `ZERO_RESULTS`:
  - “No encontré rutas de transporte público para ese horario. Probá ampliar el rango (ej. 06:00–10:00).”

- `OVER_QUERY_LIMIT`:
  - “Llegué al límite de consultas; probá de nuevo en unos minutos.”
  - (y alertar por métricas)

- Ambigüedad origen/destino:
  - “¿Querés decir Itabashi (Tokyo) o Itabashi (otra zona)? Confirmame con una estación o barrio.”

---

## 12) Checklist de implementación (tareas)

### Fase 1: Estructura y scripts
- [ ] Crear `src/scripts/transit/transit_directions.js`
- [ ] Crear `src/scripts/transit/normalize.js` y `types.js`
- [ ] (Opcional) Crear `src/scripts/transit/cache.js`
- [ ] Crear `src/scripts/itinerary/itinerary_resolve.js`
- [ ] Agregar dependencia HTTP (axios o node-fetch) a `package.json`

### Fase 2: Integración con bot
- [ ] Implementar `detectTransitQuery(text)` en `src/index.js`
- [ ] Implementar `parseTransitQuery(text)` para extraer origen/destino/fecha
- [ ] Agregar lógica de interceptación antes de `codexManager.send()`
- [ ] Implementar `buildTransitPrompt(TransitPlan, originalMessage)`

### Fase 3: Configuración
- [ ] Agregar variables opcionales al `configmap.yaml`
- [ ] Verificar que `GOOGLE_MAPS_API_KEY` esté en el secret
- [ ] Documentar uso en README (si existe) o crear uno

### Fase 4: Testing y rollout
- [ ] Probar con queries de ejemplo (Itabashi → Chichibu)
- [ ] Verificar manejo de errores (ZERO_RESULTS, etc.)
- [ ] Activar con `TRANSIT_ENABLED=true` en ConfigMap
- [ ] Monitorear logs y costos

---

## 13) Notas de implementación

### 13.1 Ajustes aplicados al plan original
- ✅ Variable de entorno: `GOOGLE_API_KEY` → `GOOGLE_MAPS_API_KEY` (ya existe en secret `tokyo-bot-secrets`)
- ✅ Estructura de scripts: módulos ES6 en `src/scripts/transit/` (no comandos ejecutables)
- ✅ Flujo: interceptar antes de Codex en `src/index.js`, ejecutar scripts directamente
- ✅ Dependencias: agregar librería HTTP (axios o node-fetch) a `package.json`

### 13.2 Detección de intención (pendiente de especificar)
La función `detectTransitQuery()` debe implementarse con:
- Regex o búsqueda de keywords case-insensitive
- Combinación de keywords de transporte + nombres de lugares/itinerarios
- Ubicación: antes de `codexManager.send()` en el handler de mensajes
