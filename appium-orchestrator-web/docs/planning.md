# Plan de Implementación: Record & Verify

## Objetivo

El objetivo es que al solicitar un test con "Grabar Mappings", el sistema encole automáticamente un segundo test de "verificación" que use esos mappings recién grabados para validar su correctitud.

---

### Etapa 1: Modificar la Lógica de Encolado en `server.js`

**Resumen:** Interceptar las peticiones de tests con `record: true` y duplicarlas para crear un par de jobs (Grabación y Verificación).

1.  **Nuevo Atributo en el Job:** Introducir un nuevo atributo: `mappingToLoad: 'nombre-del-mapping.json'`. La presencia de este atributo le indicará al worker que debe cargar un mapping específico antes de ejecutar el test.

2.  **Manejo de Tests Individuales (`run_test`):**
    - Si un job llega con `record: true`:
      - **Job 1 (Grabación):** Se encola el job original sin cambios.
      - **Job 2 (Verificación):** Se crea y encola un segundo job idéntico pero con los siguientes atributos: `{ record: false, mappingToLoad: 'feature_name.json', highPriority: true }`.

3.  **Manejo de Lotes de Tests (`run_batch`):**
    - Si el lote se solicita con `record: true`:
      - Se itera sobre la lista de jobs recibida.
      - Por cada job, se genera el par "Grabar" y "Verificar".
      - El resultado es una nueva lista de jobs intercalada: `[Grabar A, Verificar A, Grabar B, Verificar B, ...]` que se añade a la cola de ejecución.

---

### Etapa 2: Modificar el Worker (`worker.js`) para la Reproducción

**Resumen:** Enseñar al worker a reaccionar al nuevo tipo de job de "Verificación".

1.  **Detectar el Job de Verificación:** En la lógica `runTest` del worker, comprobar si el atributo `job.mappingToLoad` existe.

2.  **Ejecutar Script de Carga:**
    - Si el atributo existe, el worker debe ejecutar un nuevo script (`scripts/load-mapping.sh`), pasándole el nombre del archivo de mapping como argumento.
    - Solo tras la ejecución exitosa de este script, se procederá a correr el test con `feature-runner.sh`.

---

### Etapa 3: Crear el Script `load-mapping.sh`

**Resumen:** Crear un script dedicado a preparar el entorno de Wiremock para un test de verificación.

1.  **Argumentos:** El script aceptará un único argumento: el nombre del archivo de mapping a cargar.

2.  **Acciones:**
    - **Limpiar Mappings:** Ejecutar una llamada a la API de Wiremock para borrar todos los mappings (`POST /__admin/mappings/reset`).
    - **Cargar Mapping Específico:** Leer el contenido del archivo JSON desde `wiremock/mappings/` y enviarlo a Wiremock (`POST /__admin/mappings/import`).
    - El script debe incluir manejo de errores.
