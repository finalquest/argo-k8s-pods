# Backend - Sistema de Workers

## 📋 Visión General

El sistema de workers de Appium Orchestrator Web es un componente fundamental que gestiona la ejecución paralela de tests Appium. Utiliza **Node.js child processes** para crear un pool de workers independientes que pueden ejecutar tests simultáneamente, optimizando el uso de recursos y reduciendo tiempos de ejecución.

## 🏗️ Arquitectura del Sistema

### 1. Estructura General

```javascript
// server.js - Sistema de workers
const workerPool = new Map();
const jobQueue = [];
const maxWorkers = process.env.MAX_WORKERS || 5;

// Estados de los workers
const WORKER_STATES = {
  IDLE: 'idle',
  BUSY: 'busy',
  STARTING: 'starting',
  CLEANING: 'cleaning',
};
```

### 2. Ciclo de Vida de un Worker

```javascript
// server.js - Gestión del ciclo de vida
function createWorker(slotId) {
  const worker = fork('./worker.js', [slotId]);

  worker.on('message', (msg) => {
    handleWorkerMessage(worker, slotId, msg);
  });

  worker.on('exit', (code) => {
    handleWorkerExit(slotId, code);
  });

  worker.on('error', (err) => {
    handleWorkerError(slotId, err);
  });

  return worker;
}
```

## 🔧 Componentes del Worker

### 1. Inicialización del Worker

```javascript
// worker.js - Manejo de inicialización
process.on('message', (message) => {
  switch (message.type) {
    case 'INIT':
      initializeWorker(message);
      break;
    case 'START':
      executeJob(message.job);
      break;
    case 'TERMINATE':
      cleanupAndExit(0);
      break;
  }
});

function initializeWorker(message) {
  const {
    branch,
    client,
    apkVersion,
    localApkPath,
    deviceSerial,
    workerWorkspacePath,
    isPersistent,
  } = message;

  // Configurar entorno del worker
  workspaceDir = workerWorkspacePath;
  branch = branch;
  client = client;
  apkVersion = apkVersion;
  localApkPath = localApkPath;
  deviceSerialForLocalWorker = deviceSerial;
  isWorkspacePersistent = isPersistent;

  // Iniciar configuración del entorno
  setupWorkerEnvironment();
}
```

### 2. Sistema de Progreso (LogProgressParser)

```javascript
// worker.js - Parser de progreso de ejecución
class LogProgressParser {
  constructor() {
    this.currentState = {
      feature: null,
      scenario: null,
      currentStep: null,
      stepHistory: [],
      startTime: null,
    };
    this.jobId = null;
  }

  parseLogLine(logLine) {
    const cleanLine = this.cleanLogLine(logLine);

    // Intentar diferentes patrones
    const patterns = [
      this.tryStepPattern.bind(this),
      this.tryScenarioPattern.bind(this),
      this.tryFeaturePattern.bind(this),
      this.tryErrorPattern.bind(this),
    ];

    for (const pattern of patterns) {
      const result = pattern(cleanLine);
      if (result) return result;
    }

    return null;
  }

  tryStepPattern(logLine) {
    const stepPatterns = [
      // Patrones para diferentes formatos de logs
      /^\[0-0\]\s*➡️\s+(Given|When|Then|And|But)\s+(.+)$/i,
      /^✅.*:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      /^❌ Fail:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      /^(Given|When|Then|And|But)\s+(.+)$/i,
    ];

    for (const pattern of stepPatterns) {
      const match = logLine.match(pattern);
      if (match) {
        const [, keyword, stepText] = match;
        return this.handleStepStart(keyword, stepText);
      }
    }

    return null;
  }

  emitProgress(type, data) {
    // Enviar actualización de progreso al servidor
    sendToParent({
      type: 'PROGRESS_UPDATE',
      event: type,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }
}
```

## 🚀 Flujo de Ejecución

### 1. Preparación del Entorno

```javascript
// worker.js - Configuración del entorno
function setupWorkerEnvironment() {
  const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');

  runScript(setupScript, [workspaceDir, branch], null, (code) => {
    if (code !== 0) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Falló la preparación del workspace. Terminando.`,
      });
      return process.exit(1);
    }

    // Continuar con la configuración
    setupDeviceAndAppium();
  });
}

function setupDeviceAndAppium() {
  if (process.env.DEVICE_SOURCE === 'local') {
    // Configurar dispositivo local
    environment.adbHost = deviceSerialForLocalWorker;
    finishSetup();
  } else {
    // Buscar y bloquear emulador remoto
    const findEmulatorScript = path.join(
      __dirname,
      'scripts',
      'find-and-lock-emulator.sh',
    );
    runScript(findEmulatorScript, [], null, (code, output) => {
      if (code !== 0) {
        sendToParent({
          type: 'LOG',
          data: `[worker] ❌ No se pudo bloquear un emulador. Terminando.`,
        });
        return process.exit(1);
      }

      const { EMULATOR_ID, ADB_HOST } = parseScriptOutput(output);
      environment.emulatorId = EMULATOR_ID;
      environment.adbHost = ADB_HOST;
      finishSetup();
    });
  }
}
```

### 2. Ejecución de Tests

```javascript
// worker.js - Ejecución principal
function runTest(job) {
  const { client, feature, mappingToLoad, deviceSerial, jobId } = job;

  // Inicializar parser de progreso
  logProgressParser = new LogProgressParser();
  logProgressParser.reset(jobId);

  const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');
  const deviceIdentifier = deviceSerial || environment.adbHost;

  const args = [
    workspaceDir,
    branch,
    client,
    feature,
    deviceIdentifier,
    environment.appiumPort,
  ];

  const env = {};
  if (deviceSerial) {
    env.ANDROID_SERIAL = deviceSerial;
  }

  // Ejecutar test con parsing de progreso habilitado
  runScript(
    runnerScript,
    args,
    env,
    (code) => {
      // Limpiar parser
      if (logProgressParser) {
        logProgressParser.reset();
      }

      sendToParent({
        type: 'READY_FOR_NEXT_JOB',
        data: { exitCode: code, reportPath: null },
      });
    },
    true,
  ); // true habilita parsing de progreso
}
```

## 📊 Gestión del Worker Pool

### 1. Asignación de Jobs

```javascript
// server.js - Lógica de asignación
function assignJob(job) {
  const availableSlot = findAvailableWorkerSlot();
  if (availableSlot !== null) {
    const worker = createWorker(availableSlot);
    workerPool.set(availableSlot, {
      worker,
      status: WORKER_STATES.STARTING,
      currentJob: job,
      startTime: Date.now(),
    });

    worker.send({ type: 'INIT', ...getWorkerConfig(job) });
    return true;
  }
  return false;
}

function findAvailableWorkerSlot() {
  for (let i = 0; i < maxWorkers; i++) {
    if (!workerPool.has(i)) {
      return i;
    }
  }
  return null;
}
```

### 2. Manejo de Mensajes del Worker

```javascript
// server.js - Procesamiento de mensajes
function handleWorkerMessage(worker, slotId, msg) {
  const workerInfo = workerPool.get(slotId);
  if (!workerInfo) return;

  switch (msg.type) {
    case 'LOG':
      // Reenviar logs a clientes
      io.emit('log_update', {
        slotId,
        logLine: msg.data,
        timestamp: Date.now(),
      });
      break;

    case 'PROGRESS_UPDATE':
      // Procesar actualizaciones de progreso
      handleProgressUpdate(slotId, msg);
      break;

    case 'READY':
      // Worker listo para recibir jobs
      workerInfo.status = WORKER_STATES.IDLE;
      io.emit('worker_pool_update', getWorkerPoolStatus());

      // Asignar siguiente job de la cola
      if (jobQueue.length > 0) {
        const nextJob = jobQueue.shift();
        startJob(nextJob, slotId);
      }
      break;

    case 'READY_FOR_NEXT_JOB':
      // Worker listo para siguiente job
      handleJobCompletion(slotId, msg.data);
      break;

    case 'ERROR':
      // Manejar errores del worker
      handleWorkerError(slotId, msg.data);
      break;
  }
}
```

## 🔧 Scripts del Sistema

### 1. Script de Ejecución de Features

```bash
#!/bin/bash
# scripts/feature-runner.sh

WORKSPACE_DIR=$1
BRANCH=$2
CLIENT=$3
FEATURE=$4
DEVICE_ID=$5
APPIUM_PORT=$6

cd "$WORKSPACE_DIR"

# Ejecutar test con WDIO
npx wdio run wdio.conf.js \
  --spec "features/${CLIENT}/${FEATURE}.feature" \
  --capabilities "device.udid=$DEVICE_ID" \
  --capabilities "appium.port=$APPIUM_PORT"
```

### 2. Script de Configuración de Workspace

```bash
#!/bin/bash
# scripts/setup-workspace.sh

WORKSPACE_DIR=$1
BRANCH=$2

# Crear directorio
mkdir -p "$WORKSPACE_DIR"
cd "$WORKSPACE_DIR"

# Clonar repositorio
git clone <repo-url> .
git checkout "$BRANCH"

# Instalar dependencias
npm install
```

## 📈 Monitoreo y Estadísticas

### 1. Estado del Worker Pool

```javascript
// server.js - Funciones de monitoreo
function getWorkerPoolStatus() {
  const status = {};
  workerPool.forEach((workerInfo, slotId) => {
    status[slotId] = {
      status: workerInfo.status,
      currentJob: workerInfo.currentJob
        ? {
            id: workerInfo.currentJob.id,
            feature: workerInfo.currentJob.feature,
            client: workerInfo.currentJob.client,
            startTime: workerInfo.currentJob.startTime,
          }
        : null,
      uptime: workerInfo.startTime ? Date.now() - workerInfo.startTime : 0,
      environment: workerInfo.environment || {},
    };
  });
  return status;
}

function getQueueStatus() {
  return {
    length: jobQueue.length,
    jobs: jobQueue.map((job) => ({
      id: job.id,
      feature: job.feature,
      client: job.client,
      priority: job.highPriority ? 'high' : 'normal',
      timestamp: job.timestamp,
    })),
  };
}
```

### 2. Métricas de Rendimiento

```javascript
// server.js - Colección de métricas
const workerMetrics = {
  totalJobs: 0,
  successfulJobs: 0,
  failedJobs: 0,
  averageExecutionTime: 0,
  workersUsed: new Set(),
};

function updateJobMetrics(exitCode, executionTime, slotId) {
  workerMetrics.totalJobs++;
  workerMetrics.workersUsed.add(slotId);

  if (exitCode === 0) {
    workerMetrics.successfulJobs++;
  } else {
    workerMetrics.failedJobs++;
  }

  // Actualizar tiempo promedio
  workerMetrics.averageExecutionTime =
    (workerMetrics.averageExecutionTime * (workerMetrics.totalJobs - 1) +
      executionTime) /
    workerMetrics.totalJobs;
}
```

## 🛡️ Manejo de Errores y Recuperación

### 1. Errores de Worker

```javascript
// server.js - Manejo de errores
function handleWorkerError(slotId, error) {
  console.error(`Error en worker ${slotId}:`, error);

  const workerInfo = workerPool.get(slotId);
  if (workerInfo && workerInfo.currentJob) {
    // Notificar error del job
    io.emit('job_error', {
      jobId: workerInfo.currentJob.id,
      slotId,
      error: error.message || 'Error desconocido en worker',
      timestamp: Date.now(),
    });

    // Mover job a la cola para reintento
    if (shouldRetryJob(workerInfo.currentJob)) {
      jobQueue.unshift(workerInfo.currentJob);
    }
  }

  // Limpiar worker
  cleanupWorker(slotId);
}

function cleanupWorker(slotId) {
  const workerInfo = workerPool.get(slotId);
  if (workerInfo) {
    try {
      workerInfo.worker.kill();
    } catch (e) {
      console.error(`Error matando worker ${slotId}:`, e);
    }
    workerPool.delete(slotId);
    io.emit('worker_pool_update', getWorkerPoolStatus());
  }
}
```

### 2. Límites y Timeouts

```javascript
// server.js - Configuración de límites
const WORKER_TIMEOUT = process.env.WORKER_TIMEOUT || 300000; // 5 minutos
const MAX_RETRIES = 3;

function startWorkerTimeout(slotId) {
  const timeout = setTimeout(() => {
    const workerInfo = workerPool.get(slotId);
    if (workerInfo && workerInfo.status === WORKER_STATES.BUSY) {
      console.warn(`Worker ${slotId} excedió tiempo límite`);
      handleWorkerError(slotId, new Error('Tiempo de ejecución excedido'));
    }
  }, WORKER_TIMEOUT);

  // Almacenar referencia para limpieza
  workerInfo.timeout = timeout;
}

function clearWorkerTimeout(slotId) {
  const workerInfo = workerPool.get(slotId);
  if (workerInfo && workerInfo.timeout) {
    clearTimeout(workerInfo.timeout);
    workerInfo.timeout = null;
  }
}
```

## 🔄 Integración con Socket.IO

### 1. Eventos de Estado

```javascript
// server.js - Eventos de actualización de estado
function emitWorkerStatusUpdate() {
  io.emit('worker_pool_update', getWorkerPoolStatus());
  io.emit('queue_status_update', getQueueStatus());
}

function emitJobProgress(slotId, progress) {
  io.emit('job_progress', {
    slotId,
    progress,
    timestamp: Date.now(),
  });
}
```

### 2. Comunicación Bidireccional

```javascript
// worker.js - Comunicación con el servidor
function sendToParent(message) {
  if (process.send) {
    process.send(message);
  } else {
    console.log('[WORKER] No se puede enviar mensaje al padre:', message);
  }
}

// Enviar actualizaciones de progreso
function emitProgressUpdate(type, data) {
  sendToParent({
    type: 'PROGRESS_UPDATE',
    event: type,
    data: data,
    timestamp: new Date().toISOString(),
  });
}
```

## 📖 Documentos Relacionados

- [01-server-architecture.md](./01-server-architecture.md) - Arquitectura general del servidor
- [03-socket-events.md](./03-socket-events.md) - Eventos Socket.IO y comunicación
- [02-authentication-system.md](./02-authentication-system.md) - Sistema de autenticación
- [03-frontend/03-worker-integration.md](../03-frontend/03-worker-integration.md) - Integración desde el frontend
