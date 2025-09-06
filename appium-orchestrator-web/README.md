# Appium Orchestrator Web - Documentación del Flujo de Ejecución de Tests

Este documento detalla el flujo completo de ejecución de un test en el sistema Appium Orchestrator Web, desde la interacción del usuario en la interfaz web hasta la finalización del test y la generación de reportes. Se describen los componentes principales, su interacción y los mensajes internos que se intercambian.

## 1. Introducción

Appium Orchestrator Web es una aplicación diseñada para orquestar la ejecución de tests de automatización de Appium en dispositivos móviles (emuladores o físicos). Permite a los usuarios seleccionar branches, clientes y features, y ejecutar tests, gestionando la infraestructura necesaria (Appium, emuladores, APKs) de forma automatizada.

## 2. Arquitectura General

El sistema se compone principalmente de tres capas:

- **Frontend (UI Web):** Interfaz de usuario construida con HTML, CSS y JavaScript (en `public/`). Permite la interacción del usuario para iniciar y monitorear tests.
- **Backend (`server.js`):** Servidor Node.js (Express y Socket.IO) que actúa como el cerebro del sistema. Gestiona la cola de trabajos, orquesta la creación y comunicación con los workers, y sirve la API para el frontend.
- **Workers (`worker.js` y Scripts Shell):** Procesos Node.js (`worker.js`) que se ejecutan en segundo plano. Cada worker es responsable de la ejecución de uno o más tests de forma secuencial. Orquestan una serie de scripts shell (`scripts/`) para configurar el entorno, interactuar con Appium y los dispositivos, y ejecutar los tests reales.

## 3. Flujo Detallado de Ejecución de Tests

A continuación, se describe el flujo paso a paso desde que un usuario inicia un test hasta su finalización.

### 3.1. Interacción del Frontend (UI)

El frontend ahora utiliza módulos ES para una mejor organización del código. `public/js/main.js` actúa como el punto de entrada principal, importando funcionalidades de otros módulos como `api.js`, `ui.js`, `socket.js` y `wiremock.js`.

1.  **Selección de Test:** El usuario navega por la interfaz web (`public/index.html`), selecciona una `branch`, un `cliente` y una `feature` específica (o un lote de features).
2.  **Acción "Run" (Individual Feature):**
    - **Elemento:** Botón `Run` o `⚡️` (Alta Prioridad) asociado a cada feature individual en la lista (`<ul id="features-list">`). Estos botones son creados dinámicamente por la función `fetchFeatures` (importada de `public/js/api.js`).
    - **Archivo:** `public/js/main.js`
    - **Event Listener:** `featuresList.addEventListener('click', (e) => { ... });` (adjunto al `<ul>` con `id="features-list"`, utilizando delegación de eventos).
    - **Evento:** `click` en el botón `Run` (clase `run-btn`) o `⚡️` (clase `priority-btn`).
    - **Función Llamada:** `runTest(socket, featureName, highPriority)`.
      - `runTest` es una función importada de `public/js/socket.js`.
      - `socket` es la instancia de Socket.IO.
      - `featureName` se obtiene de `e.target.dataset.feature`.
      - `highPriority` es `true` si el botón tiene la clase `priority-btn`, `false` en caso contrario.
    - **Lógica de `runTest` (en `public/js/socket.js`):**
      - Esta función recolecta los valores actuales de los selectores de `branch`, `client`, `apkVersion`, `device` (si aplica), y los estados de los checkboxes `record-mappings-checkbox` y `use-local-mappings-checkbox`.
      - Construye un objeto `jobData` con toda esta información.
      - **Mensaje Socket.IO:** Emite un evento `run_test` al backend a través de `socket.emit('run_test', jobData);`.

3.  **Acción "Run Selected" (Batch Execution):**
    - **Elemento:** Botón `Ejecutar Selección (X)` con `id="run-selected-btn"`.
    - **Archivo:** `public/js/main.js`
    - **Event Listener:** `runSelectedBtn.addEventListener('click', () => runSelectedTests(socket));`
    - **Evento:** `click` en el botón `Ejecutar Selección`.
    - **Función Llamada:** `runSelectedTests(socket)`.
      - `runSelectedTests` es una función importada de `public/js/socket.js`.
      - `socket` es la instancia de Socket.IO.
    - **Lógica de `runSelectedTests` (en `public/js/socket.js`):**
      - Esta función identifica todas las features seleccionadas (checkboxes con clase `feature-checkbox:checked`).
      - Recolecta los valores actuales de los selectores de `branch`, `client`, `apkVersion`, `device` (si aplica), y los estados de los checkboxes `batch-priority-checkbox`, `record-mappings-checkbox` y `use-local-mappings-checkbox`.
      - Construye un array de objetos `jobData`, uno por cada feature seleccionada.
      - **Mensaje Socket.IO:** Emite un evento `run_batch` al backend a través de `socket.emit('run_batch', { jobs: jobsData, record: record, usePreexistingMapping: usePreexistingMapping, highPriority: highPriority });`.

### 3.2. Backend (`server.js`) - Encolamiento de Trabajos y Gestión de Workers

El `server.js` es el punto central que recibe las solicitudes del frontend y gestiona la orquestación de los workers.

1.  **Recepción de Solicitud (Socket.IO Events):**
    - `server.js` escucha los siguientes eventos de Socket.IO emitidos por el frontend:
      - `socket.on('run_test', (data) => { ... });`
        - **Datos:** Objeto `jobData` conteniendo `branch`, `client`, `feature`, `apkVersion`, `localApk` (si aplica), `deviceSerial` (si `DEVICE_SOURCE` es `local`), `highPriority`, `record`, `usePreexistingMapping`.
      - `socket.on('run_batch', (data) => { ... });`
        - **Datos:** Objeto `{ jobs: jobsData[], record: boolean, usePreexistingMapping: boolean, highPriority: boolean }`.
      - `socket.on('cancel_job', (data) => { ... });`
        - **Datos:** `{ jobId: number }`.
      - `socket.on('stop_test', (data) => { ... });`
        - **Datos:** `{ slotId: number, jobId: number }`.
      - `socket.on('stop_all_execution', () => { ... });`

2.  **Creación y Encolamiento de Job:**
    - Para `run_test` y `run_batch`, se crea un objeto `job` único con un `id` (`jobIdCounter`).
    - **Lógica de Record & Verify:** Si `data.record` es `true`, se crean dos jobs: uno de grabación (`record: true`) y otro de verificación (`record: false`, `mappingToLoad: <feature>.json`). El job de verificación se marca con `highPriority`.
    - El `job` (o los jobs) se añade a la `jobQueue` (un array simple). Si es de alta prioridad, se añade al principio (`unshift`), de lo contrario al final (`push`).
    - **Mensaje Interno (Socket.IO):** `io.emit('log_update', { logLine: '...' })` para informar al frontend que el job ha sido encolado.

3.  **Procesamiento de la Cola (`processQueue()`):**
    - Esta función se llama cada vez que se añade un job o un worker termina un job.
    - Itera sobre la `jobQueue` intentando asignar jobs a workers disponibles.
    - **`assignJobToWorker(job)`:**
      - Busca un worker existente en `workerPool` que esté en estado `'ready'` y que coincida con los criterios del job (misma `branch`, `client`, `apkIdentifier`, `apkSourceType`).
      - **Para `DEVICE_SOURCE=local`:** También verifica que el `deviceSerial` del worker coincida con el `job.deviceSerial`.
      - Si encuentra un worker coincidente, llama a `runJobOnWorker(job, worker)`.
      - Si no encuentra un worker coincidente y el número de workers activos (`workerPool.length`) es menor que `maxWorkers` (definido por `process.env.MAX_PARALLEL_TESTS`, por defecto 2):
        - Llama a `createWorker(...)` para generar un nuevo proceso worker.
        - **Para `DEVICE_SOURCE=local`:** Pasa el `job.deviceSerial` al `createWorker` para que el nuevo worker se asocie con ese dispositivo específico.
        - Luego llama a `runJobOnWorker(job, newWorker)`.
      - Si no se puede asignar el job (no hay workers listos y se alcanzó `maxWorkers`), el job permanece en la cola.
    - **Mensaje Interno (Socket.IO):** `broadcastStatus()` (`io.emit('queue_status_update', ...)`, `io.emit('worker_pool_update', ...)`) para actualizar el estado de la cola y los workers en el frontend.

4.  **Creación de Worker (`createWorker(...)`):**
    - Se genera un nuevo proceso `worker.js` utilizando `child_process.fork(path.join(__dirname, 'worker.js'))`.
    - Se crea un objeto `worker` en `workerPool` para rastrear su estado (`id`, `process`, `branch`, `client`, `apkIdentifier`, `apkSourceType`, `deviceSerial`, `status`, `currentJob`).
    - **Mensaje Interno (`server.js` a `worker.js` - vía `process.send`):** Envía un mensaje `INIT` al proceso `worker.js` recién creado. Este mensaje contiene:
      - `type: 'INIT'`
      - `branch`, `client`
      - `apkVersion` o `localApkPath` (dependiendo de `apkSourceType`)
      - `deviceSerial` (si `DEVICE_SOURCE` es `local`)
    - Se configuran listeners para los mensajes que el worker enviará de vuelta (`message`, `close`, `error`).

5.  **Gestión de Workers y Jobs (Eventos de `worker.js` recibidos por `server.js`):**
    - `server.js` escucha los siguientes mensajes del proceso `worker.js` (vía `workerProcess.on('message', ...)`):
      - `READY`: El worker está completamente inicializado y listo para recibir jobs.
        - **Acción de `server.js`:** Marca el worker como `'ready'` y llama a `processQueue()` para intentar asignarle un job.
      - `READY_FOR_NEXT_JOB`: El worker ha terminado la ejecución de un job y está listo para el siguiente.
        - **Datos:** `{ exitCode: number, reportPath: string | null }`.
        - **Acción de `server.s`:** Si el job era de grabación, detiene la grabación de Wiremock. Marca el worker como `'ready'`, maneja el reporte (`handleReport`), emite `job_finished` a frontend y llama a `processQueue()`.
      - `UNIFIED_REPORT_READY`: El worker ha terminado de generar su reporte unificado (cuando se le pide terminar).
        - **Datos:** `{ reportPath: string | null }`.
        - **Acción de `server.s`:** Maneja el reporte y envía un mensaje `TERMINATE` al worker.
      - `LOG`: Mensajes de log del worker.
        - **Acción de `server.s`:** Emite `log_update` al frontend.
    - `server.js` también escucha el evento `close` del proceso `worker.js`:
      - **Acción de `server.s`:** Elimina el worker del `workerPool`. Si el worker estaba ocupado y no se estaba terminando, re-encola el job y emite un `log_update` y `job_finished`.

### 3.3. Worker (`worker.js`) - Ciclo de Vida y Orquestación de Scripts

Cada proceso `worker.js` es una instancia independiente que gestiona la ejecución de tests.

1.  **Inicialización del Worker (al recibir `INIT` de `server.js`):**
    - `worker.js` recibe el mensaje `INIT`.
    - **`setupWorkerEnvironment()`:**
      - Crea un directorio de trabajo temporal único (`workspaceDir`) en el sistema de archivos (ej. `/tmp/worker-randomhex`).
      - **Ejecuta `scripts/setup-workspace.sh`:**
        - `bash <path_to_scripts>/setup-workspace.sh <workspaceDir> <branch>`
        - Este script clona el repositorio de tests de Appium en `<workspaceDir>/appium` y ejecuta `yarn install` para instalar las dependencias.
      - **Adquisición de Dispositivo:**
        - Si `process.env.DEVICE_SOURCE === 'local'`: Utiliza el `deviceSerial` recibido en el mensaje `INIT` como `environment.adbHost`.
        - Si `process.env.DEVICE_SOURCE` no es `local` (modo remoto):
          - **Ejecuta `scripts/find-and-lock-emulator.sh`:**
            - `bash <path_to_scripts>/find-and-lock-emulator.sh`
            - Este script busca y bloquea un emulador disponible, devolviendo su `EMULATOR_ID` y `ADB_HOST`.
            - El worker almacena `EMULATOR_ID` y `ADB_HOST` en su `environment`.
      - **`finishSetup()`:**
        - **Ejecuta `scripts/start-appium.sh`:**
          - `bash <path_to_scripts>/start-appium.sh <workspaceDir>`
          - Este script inicia una **instancia dedicada del servidor de Appium** en un puerto aleatorio y único (ej. `47xx`) en segundo plano.
          - Devuelve el `APPIUM_PID` y `APPIUM_PORT` de esta instancia.
          - El worker almacena `APPIUM_PID` y `APPIUM_PORT` en su `environment`.
        - **Ejecuta `scripts/install-apk.sh`:**
          - `bash <path_to_scripts>/install-apk.sh <workspaceDir> <adbHost> <client> <apkVersion> <localApkPath>`
          - Este script instala la APK del cliente en el dispositivo adquirido.
      - **Mensaje Interno (`worker.js` a `server.js`):** Envía un mensaje `READY` al `server.js`, indicando que está completamente inicializado y listo para recibir jobs.
        - `process.send({ type: 'READY' })`

2.  **Ejecución de Test (al recibir `START` de `server.js`):**
    - `worker.js` recibe el mensaje `START` con el objeto `job`.
    - **`runTest(job)`:**
      - Determina el `deviceIdentifier` a usar (el `deviceSerial` del job si es local, o el `environment.adbHost` del emulador remoto).
      - Si el `job` tiene `mappingToLoad` (para tests de verificación o con mappings preexistentes):
        - **Ejecuta `scripts/load-mapping.sh`:**
          - `bash <path_to_scripts>/load-mapping.sh <mappingToLoad>`
          - Este script carga el mapping de Wiremock especificado.
      - **Ejecuta `scripts/feature-runner.sh`:**
        - `bash <path_to_scripts>/feature-runner.sh <workspaceDir> <branch> <client> <feature> <deviceIdentifier> <appiumPort>`
        - Este es el script principal que ejecuta el test real. Configura el archivo `wdio.conf.ts` con el `appiumPort` y `udid` (deviceIdentifier) correctos, y luego ejecuta `yarn run wdio` para iniciar el test de WebdriverIO.
      - **Mensaje Interno (`worker.js` a `server.js`):** Una vez que `feature-runner.sh` finaliza, el worker envía un mensaje `READY_FOR_NEXT_JOB` al `server.js`.
        - `process.send({ type: 'READY_FOR_NEXT_JOB', data: { exitCode: code, reportPath: null } })`
        - Si el job era de grabación (`record: true`), el `server.js` detendrá la grabación de Wiremock y guardará los mappings.

3.  **Generación de Reporte Unificado (al recibir `GENERATE_UNIFIED_REPORT` de `server.js`):**
    - Cuando el `server.js` detecta workers inactivos y la cola vacía, les pide generar un reporte unificado.
    - **Ejecuta `scripts/generate-report.sh`:**
      - `bash <path_to_scripts>/generate-report.sh <workspaceDir>`
      - Este script consolida los reportes de Allure generados por los tests.
    - **Mensaje Interno (`worker.js` a `server.js`):** Envía un mensaje `UNIFIED_REPORT_READY` al `server.js`.
      - `process.send({ type: 'UNIFIED_REPORT_READY', data: { reportPath: <path_to_report> } })`

4.  **Terminación del Worker (al recibir `TERMINATE` de `server.js` o al finalizar):**
    - `worker.js` recibe el mensaje `TERMINATE` o se cierra por otras razones.
    - **`cleanupAndExit()`:**
      - **Ejecuta `scripts/stop-appium.sh`:**
        - `bash <path_to_scripts>/stop-appium.sh <appiumPid>`
        - Detiene la instancia de Appium que inició este worker.
      - **Ejecuta `scripts/release-emulator.sh`:**
        - `bash <path_to_scripts>/release-emulator.sh <emulatorId> <adbHost>`
        - Libera el emulador/dispositivo para que pueda ser utilizado por otro worker.
      - Elimina el `workspaceDir` temporal.
      - El proceso `worker.js` finaliza.
    - **Mensaje Interno (`worker.js` a `server.js`):** El evento `close` del proceso `worker.js` es capturado por `server.js`.

### 3.4. Scripts Shell (`scripts/`)

Estos scripts son ejecutados por el `worker.js` para realizar tareas específicas.

- **`setup-workspace.sh <workspaceDir> <branch>`:**
  - **Descripción:** Clona el repositorio de tests de Appium en `<workspaceDir>/appium` y ejecuta `yarn install` para instalar las dependencias.
  - **Argumentos:**
    - `$1`: `workspaceDir` (directorio de trabajo temporal del worker).
    - `$2`: `branch` (rama del repositorio a clonar).
- **`find-and-lock-emulator.sh`:**
  - **Descripción:** Busca un emulador disponible (generalmente remoto) y lo "bloquea" para su uso exclusivo.
  - **Argumentos:** Ninguno.
  - **Salida (stdout):** Imprime `EMULATOR_ID=<id>` y `ADB_HOST=<host>` para que `worker.js` los capture.
- **`start-appium.sh <workspaceDir>`:**
  - **Descripción:** Inicia una instancia dedicada del servidor de Appium en segundo plano en un puerto aleatorio y único.
  - **Argumentos:**
    - `$1`: `workspaceDir` (directorio de trabajo del worker, usado para el log de Appium).
  - **Salida (stdout):** Imprime `APPIUM_PID=<pid>` y `APPIUM_PORT=<port>` para que `worker.js` los capture.
- **`install-apk.sh <workspaceDir> <adbHost> <client> <apkVersion> <localApkPath>`:**
  - **Descripción:** Instala la APK del cliente en el dispositivo especificado por `adbHost`.
  - **Argumentos:**
    - `$1`: `workspaceDir` (directorio de trabajo del worker).
    - `$2`: `adbHost` (host o serial del dispositivo).
    - `$3`: `client` (nombre del cliente, ej. `nbch`).
    - `$4`: `apkVersion` (versión de la APK).
    - `$5`: `localApkPath` (ruta local de la APK si `apkSource` es `local`).
- **`feature-runner.sh <workspaceDir> <branch> <client> <feature> <deviceIdentifier> <appiumPort>`:**
  - **Descripción:** Es el script principal que ejecuta el test real. Configura el archivo `wdio.conf.ts` dinámicamente y luego ejecuta `yarn run wdio` para iniciar el test de WebdriverIO.
  - **Argumentos:**
    - `$1`: `workspaceDir` (directorio de trabajo del worker).
    - `$2`: `branch` (rama del repositorio).
    - `$3`: `client` (nombre del cliente).
    - `$4`: `feature` (nombre de la feature a ejecutar).
    - `$5`: `deviceIdentifier` (UDID del dispositivo o `adbHost`).
    - `$6`: `appiumPort` (puerto de la instancia de Appium).
- **`load-mapping.sh <mappingName>`:**
  - **Descripción:** Carga un archivo de mapping de Wiremock específico.
  - **Argumentos:**
    - `$1`: `mappingName` (nombre del archivo de mapping a cargar).
- **`stop-appium.sh <appiumPid>`:**
  - **Descripción:** Detiene el proceso de Appium con el PID especificado.
  - **Argumentos:**
    - `$1`: `appiumPid` (PID del proceso de Appium a detener).
- **`release-emulator.sh <emulatorId> <adbHost>`:**
  - **Descripción:** Libera el emulador/dispositivo bloqueado.
  - **Argumentos:**
    - `$1`: `emulatorId` (ID del emulador).
    - `$2`: `adbHost` (host o serial del dispositivo).
- **`teardown-worker.sh`:**
  - **Descripción:** Realiza cualquier limpieza final específica del worker. (Actualmente, la limpieza principal la hace `worker.js` directamente).
  - **Argumentos:** Ninguno.
- **`generate-report.sh <workspaceDir>`:**
  - **Descripción:** Genera un reporte unificado de Allure a partir de los resultados de los tests.
  - **Argumentos:**
    - `$1`: `workspaceDir` (directorio de trabajo del worker).

## 4. Consideraciones de Paralelismo

El sistema está diseñado para soportar múltiples workers en paralelo, limitados por la variable `maxWorkers` en `server.js`.

- **Paralelismo Actual:**
  - Cada worker es un proceso independiente.
  - Cada worker puede adquirir su propio dispositivo (remoto a través de `find-and-lock-emulator.sh` o local si se le asigna un `deviceSerial`).
  - Cada worker inicia su propia instancia dedicada de Appium en un puerto único.
  - Esto permite que `maxWorkers` tests se ejecuten simultáneamente, siempre y cuando haya dispositivos disponibles y el `server.js` los asigne correctamente.

- **Mejora para Dispositivos Locales:**
  - Actualmente, para dispositivos locales, el `server.js` espera que el `job` ya contenga el `deviceSerial` del dispositivo al que se debe asignar.
  - Para un paralelismo más robusto con múltiples dispositivos locales, `server.s` debería:
    1.  **Descubrir y mantener un pool de dispositivos locales disponibles** (utilizando `adb devices`).
    2.  **Asignar automáticamente un dispositivo disponible** a un nuevo worker cuando se encola un job para un dispositivo local y hay slots disponibles.
    3.  **Liberar el dispositivo de vuelta al pool** cuando el worker asociado termina o se vuelve inactivo.

Esta documentación proporciona una base sólida para entender el funcionamiento del sistema y planificar futuras mejoras.
