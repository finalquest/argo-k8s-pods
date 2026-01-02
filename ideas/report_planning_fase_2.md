# Plan de Reportes - Fase 2: Reportes Agregados Automáticos

## 1. Objetivo

Extender la funcionalidad de reportes para generar automáticamente un **reporte agregado de Allure por cada `branch`** una vez que un ciclo de ejecuciones de tests ha finalizado. Esto proporcionará una visión consolidada del estado de una branch, complementando los reportes individuales de cada ejecución.

---

## 2. Prerrequisitos

Esta fase asume que la **Fase 1** (descrita en `report_planning.md`) ha sido implementada con una modificación clave:

- El **Orquestador** (`server.js`) es responsable de guardar los datos crudos (`allure-results`) de cada ejecución individual en una estructura de directorios persistente (`public/reports/<branch>/<feature>/<timestamp>/allure-results`).
- El Orquestador también genera el reporte HTML individual a partir de esos datos crudos.

---

## 3. Estrategia de Agregación Automática

### a. Disparador (Trigger)

- La generación de reportes agregados se activará de forma automática, sin intervención del usuario.
- El disparador será la función `checkIdleAndCleanup` en `server.js`, que se ejecuta cuando se cumplen dos condiciones: 1) la cola global de jobs (`jobQueue`) está vacía y 2) todos los workers del pool están en estado `ready` (libres).

### b. Lógica de Backend (`server.js`)

Se modificará la función `checkIdleAndCleanup` para que, antes de dar la orden de terminar los workers, realice los siguientes pasos:

1.  **Identificar Branches Activas:** La función obtendrá una lista de las `branch` únicas que tienen workers asociados en el `workerPool`.
2.  **Iterar y Agregar:** Para cada `branch` en esa lista:
    a.  **Recolectar Resultados:** Buscará y encontrará todos los directorios `allure-results` almacenados bajo la ruta de esa branch (ej: `public/reports/<branch_sanitizada>/**/allure-results`).
    b.  **Preparar Agregación:** Creará un directorio temporal.
    c.  **Copiar Resultados:** Copiará todos los `allure-results` encontrados al directorio temporal.
    d.  **Generar Reporte Agregado:** Ejecutará `yarn run allure generate` sobre el directorio temporal.
    e.  **Guardar Reporte:** Guardará el reporte HTML agregado resultante en una ruta pública, conocida y estable. Este reporte **sobrescribirá** al anterior para esa branch, representando siempre "el último reporte agregado".

### c. Estructura de Directorios para Reportes Agregados

Los reportes agregados se guardarán en una carpeta separada para no mezclarlos con los individuales:

```
public/reports/
└── _aggregated/
    ├── <branch_sanitizada_1>/
    │   └── index.html (y demás archivos del reporte)
    └── <branch_sanitizada_2>/
        └── index.html (y demás archivos del reporte)
```

La URL para acceder a un reporte agregado será predecible, ej: `http://localhost:3000/reports/_aggregated/develop/`.

---

## 4. Plan de Acción Detallado

### a. Modificaciones en el Orquestador (`server.js`)

1.  **Actualizar `checkIdleAndCleanup`:**
    *   Añadir la lógica de agregación descrita anteriormente.
    *   Asegurarse de que este proceso se complete antes de que se envíe la señal `TERMINATE` a los workers.
    *   Manejar posibles errores durante la generación del reporte agregado para que no impida el proceso de limpieza de los workers.

### b. Modificaciones en la Interfaz (UI)

1.  **Conservar Reportes Individuales:** El botón "Ver Reporte" en cada job finalizado (que apunta al reporte de esa ejecución única) se debe mantener sin cambios.
2.  **Añadir Acceso a Reportes Agregados:**
    *   Se propone añadir una nueva sección en la UI, posiblemente en la pestaña "Workers" o en una nueva pestaña "Reportes Agregados".
    *   Esta sección listará las branches para las cuales existe un reporte agregado.
    *   Junto a cada nombre de branch, habrá un botón "Ver Último Reporte Agregado" que enlazará a la ruta correspondiente (ej: `/reports/_aggregated/develop/`).
    *   Esta lista se podría poblar mediante un nuevo endpoint de API (ej. `/api/aggregated-reports`) que devuelva las branches que tienen reportes generados.
