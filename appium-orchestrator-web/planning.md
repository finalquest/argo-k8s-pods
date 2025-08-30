# Plan de Refactorización del Ejecutor de Tests

## 1. Objetivo

El objetivo de esta refactorización es desacoplar la preparación del entorno de la ejecución de los tests. Actualmente, el script `feature-runner.sh` es responsable de ambas cosas, lo que genera una ineficiencia significativa al repetir la configuración del entorno para cada test.

El nuevo enfoque busca que un "worker" prepare un entorno completo y reutilizable (emulador, Appium, APK) una sola vez, y que el `feature-runner.sh` se dedique exclusivamente a ejecutar la lógica del test de WDIO.

## 2. Plan de Implementación por Etapas

Para minimizar riesgos y permitir pruebas incrementales, el refactor se realizará en 3 etapas.

### Etapa 1: Centralizar el Ciclo de Vida de Appium

**Objetivo:** Hacer que Appium sea un proceso de larga duración que viva y muera con el worker, eliminando el costo de iniciar/detener Appium para cada test.

*   **Acciones:**
    1.  Crear `start-appium.sh`: Inicia Appium en segundo plano y reporta su PID y puerto.
    2.  Crear `stop-appium.sh`: Detiene el proceso de Appium usando su PID.
    3.  Modificar `worker.js` para orquestar estos scripts: llama a `start-appium.sh` al inicio y a `stop-appium.sh` al final.
    4.  Modificar `feature-runner.sh` para que use el servidor Appium existente en lugar de crear uno nuevo. Seguirá manejando la instalación del APK y el bloqueo del emulador.

### Etapa 2: Centralizar la Gestión del Emulador y el APK

**Objetivo:** Asignar un emulador y una versión del APK al worker de forma fija durante su ciclo de vida.

*   **Acciones:**
    1.  Crear `acquire-emulator-and-install-apk.sh`: Contendrá la lógica para buscar y bloquear un emulador en Redis, y para descargar e instalar el APK.
    2.  Crear `release-emulator.sh`: Liberará el emulador en Redis.
    3.  Modificar `worker.js` para llamar a estos scripts en su ciclo de vida.
    4.  Simplificar `feature-runner.sh` eliminando la lógica de gestión de emulador e instalación de APK.

### Etapa 3: Consolidación y Limpieza

**Objetivo:** Organizar el código final para que sea limpio, mantenible y coincida con el diseño propuesto.

*   **Acciones:**
    1.  Unir los scripts de la Etapa 1 y 2 en `prepare-worker-environment.sh` (para el inicio) y `teardown-worker.sh` (para el final).
    2.  Actualizar `worker.js` para que llame a estos scripts consolidados.
    3.  Eliminar los scripts intermedios creados en las etapas anteriores.

---
*El plan original detallado se encuentra debajo para referencia.*
---

## Plan Original Detallado

### Estado Actual

1.  Un `worker` se inicializa para una `branch` específica (`setup-workspace.sh`), clonando el repo e instalando dependencias.
2.  Para **cada test** en la cola, se ejecuta `feature-runner.sh`, que realiza la secuencia completa:
    *   Descarga el APK.
    *   Busca y bloquea un emulador en Redis.
    *   Desinstala e instala el APK en el emulador.
    *   **Inicia un servidor Appium.**
    *   Ejecuta el test con `wdio`.
    *   **Detiene el servidor Appium.**
    *   Libera el emulador.

### Problemas del Estado Actual

*   **Ineficiencia:** El ciclo de iniciar/detener Appium y reinstalar el APK para cada test añade una sobrecarga de tiempo considerable (decenas de segundos por test).
*   **Complejidad:** El script `feature-runner.sh` tiene demasiadas responsabilidades, lo que dificulta su mantenimiento.
*   **Fragilidad:** El inicio y parada constante de servicios aumenta la probabilidad de fallos intermitentes.

### Plan Propuesto (Diseño Final)

Se propone dividir la lógica en tres scripts especializados, orquestados por `worker.js`.

#### a. Nuevo Script: `prepare-worker-environment.sh`

Este script se ejecutará **una sola vez** después de `setup-workspace.sh`, cuando el worker se crea.

**Responsabilidades:**

1.  Buscar un emulador disponible en Redis y **bloquearlo durante toda la vida del worker**.
2.  Descargar el APK necesario.
3.  Conectarse al emulador, desinstalar cualquier versión anterior del APK e instalar la nueva versión.
4.  **Iniciar un servidor Appium y mantenerlo corriendo en segundo plano.**
5.  Devolver al proceso `worker.js` la información clave del entorno: `ADB_HOST`, `APPIUM_PORT` y `APPIUM_PID`.

#### b. Script Modificado: `feature-runner.sh`

Este script será mucho más simple y se ejecutará para cada test.

**Responsabilidades:**

1.  Recibir como argumentos la información del entorno (`ADB_HOST`, `APPIUM_PORT`, `FEATURE_NAME`, etc.).
2.  Generar dinámicamente el archivo `wdio.conf.ts` para apuntar al servidor Appium ya en ejecución.
3.  Ejecutar el comando `wdio` para el feature específico.
4.  **NO** debe gestionar Appium, la instalación del APK ni el bloqueo del emulador.

#### c. Script Modificado: `teardown-worker.sh`

Este script se ejecutará **una sola vez** cuando el worker sea destruido.

**Responsabilidades:**

1.  Recibir el `APPIUM_PID` y el `ADB_HOST` como argumentos.
2.  Detener el proceso del servidor Appium.
3.  Desconectarse del emulador.
4.  Liberar el bloqueo del emulador en Redis para que otros workers puedan usarlo.

#### d. Cambios en `worker.js`

El worker gestionará el nuevo ciclo de vida:

1.  **Fase `INIT`:**
    *   Ejecutar `setup-workspace.sh` (clonar repo, `yarn install`).
    *   Ejecutar `prepare-worker-environment.sh` y almacenar los datos del entorno (ADB_HOST, APPIUM_PID, etc.).
    *   Informar al orquestador que está `READY`.

2.  **Fase `START` (ejecutar test):**
    *   Ejecutar el `feature-runner.sh` simplificado, pasándole los datos del entorno.
    *   Al finalizar, informar que está `READY_FOR_NEXT_JOB`.

3.  **Fase `TERMINATE`:**
    *   Ejecutar `teardown-worker.sh` para limpiar el entorno.
    *   Borrar el directorio de trabajo.
    *   Terminar el proceso.