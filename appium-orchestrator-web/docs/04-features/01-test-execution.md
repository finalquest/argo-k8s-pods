# Features - Ejecución de Tests

## 📋 Visión General

La ejecución de tests es la funcionalidad principal de Appium Orchestrator Web. Esta feature permite ejecutar tests Appium de forma individual o por lotes, con soporte para múltiples dispositivos, gestión de APKs, y monitoreo en tiempo real del progreso de ejecución.

## 🏗️ Arquitectura de la Feature

### 1. Componentes Principales

```javascript
// Flujo completo de ejecución
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend     │    │   Socket.IO     │    │   Backend       │
│   UI Controls  │────│   Communication │────│   Job Queue     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Worker Pool   │
                    │   Execution     │
                    └─────────────────┘
```

### 2. Estados de Ejecución

```javascript
// public/js/progress-indicator-manager.js - Estados de test
const TEST_STATES = {
  IDLE: 'idle',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Estados de UI
const EXECUTION_STATES = {
  READY: 'ready',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  ERROR: 'error',
};
```

## 🚀 Flujo de Ejecución Individual

### 1. Inicio desde el Frontend

```javascript
// public/js/main.js - Integración con tree view
function executeTestWithSaveCheck(featureName, highPriority = false) {
  // Verificar cambios no guardados
  if (hasUnsavedChanges()) {
    const shouldSave = confirm('¿Guardar cambios antes de ejecutar?');
    if (shouldSave) {
      const saved = handleSave();
      if (!saved) return;
    }
  }

  // Abrir feature en editor
  openFeatureFromTree(featureName);

  // Ejecutar test
  runTest(
    socket,
    getCurrentBranch(),
    getCurrentClient(),
    featureName,
    highPriority,
  );
}

// public/js/socket.js - Envío de test al servidor
export function runTest(
  socket,
  branch,
  client,
  feature,
  highPriority = false,
  record = false,
) {
  const selectedApk = document.getElementById('apk-version-select').value;
  const deviceSerial = document.getElementById('device-select').value;

  const jobPayload = {
    branch,
    client,
    feature,
    highPriority,
    record,
    deviceSerial,
  };

  // Configurar fuente de APK
  if (apkSource === 'local') {
    jobPayload.localApk = selectedApk;
  } else {
    jobPayload.apkVersion = selectedApk;
  }

  // Configurar opciones adicionales
  jobPayload.usePreexistingMapping = document.getElementById(
    'use-local-mappings-checkbox',
  ).checked;
  jobPayload.persistentWorkspace = document.getElementById(
    'persistent-workspace-checkbox',
  ).checked;

  // Enviar al servidor
  socket.emit('run_test', jobPayload);
}
```

### 2. Recepción y Procesamiento en Backend

```javascript
// server.js - Manejo de run_test
socket.on('run_test', (data) => {
  const job = {
    id: generateJobId(),
    type: 'single',
    branch: data.branch,
    client: data.client,
    feature: data.feature,
    highPriority: data.highPriority || false,
    deviceSerial: data.deviceSerial,
    localApk: data.localApk,
    apkVersion: data.apkVersion,
    record: data.record || false,
    usePreexistingMapping: data.usePreexistingMapping || false,
    persistentWorkspace: data.persistentWorkspace || false,
    userId: socket.userId,
    timestamp: Date.now(),
  };

  console.log(`[${socket.userName}] Iniciando test: ${job.feature}`);

  // Asignar job a worker o agregar a cola
  if (!assignJob(job)) {
    jobQueue.push(job);
    io.emit('queue_status_update', getQueueStatus());
  }

  // Notificar inicio del job
  io.emit('job_started', {
    jobId: job.id,
    slotId: getWorkerSlotForJob(job.id),
    featureName: job.feature,
    userId: job.userId,
    userName: socket.userName,
    timestamp: job.timestamp,
  });
});
```

### 3. Ejecución en Worker

```javascript
// worker.js - Recepción y ejecución
process.on('message', (message) => {
  switch (message.type) {
    case 'START':
      runTest(message.job);
      break;
  }
});

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

  // Ejecutar test con parsing de progreso
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

## 📊 Ejecución por Lotes

### 1. Selección Múltiple

```javascript
// public/js/socket.js - Ejecución batch
export function runSelectedTests(socket) {
  const selectedCheckboxes = document.querySelectorAll(
    '.feature-checkbox:checked',
  );
  if (selectedCheckboxes.length === 0) {
    alert('No hay features seleccionados para ejecutar.');
    return;
  }

  const branch = document.getElementById('branch-select').value;
  const client = document.getElementById('client-select').value;
  const deviceSerial = document.getElementById('device-select').value;
  const highPriority = document.getElementById(
    'batch-priority-checkbox',
  ).checked;
  const recordMappings = document.getElementById(
    'record-mappings-checkbox',
  ).checked;

  const jobs = Array.from(selectedCheckboxes).map((cb) => ({
    branch,
    client,
    feature: cb.dataset.featureName,
    highPriority,
    deviceSerial,
  }));

  socket.emit('run_batch', {
    jobs,
    record: recordMappings,
    usePreexistingMapping: document.getElementById(
      'use-local-mappings-checkbox',
    ).checked,
    persistentWorkspace: document.getElementById(
      'persistent-workspace-checkbox',
    ).checked,
  });
}
```

### 2. Procesamiento de Lotes

```javascript
// server.js - Manejo de run_batch
socket.on('run_batch', (data) => {
  const jobs = data.jobs.map((job) => ({
    ...job,
    id: generateJobId(),
    type: 'batch',
    record: data.record || false,
    usePreexistingMapping: data.usePreexistingMapping || false,
    persistentWorkspace: data.persistentWorkspace || false,
    userId: socket.userId,
    timestamp: Date.now(),
  }));

  console.log(`[${socket.userName}] Iniciando batch de ${jobs.length} tests`);

  // Procesar cada job individualmente
  jobs.forEach((job) => {
    if (!assignJob(job)) {
      jobQueue.push(job);
    }
  });

  // Actualizar estado de cola
  io.emit('queue_status_update', getQueueStatus());

  // Notificar inicio del batch
  io.emit('batch_started', {
    batchId: generateBatchId(),
    totalJobs: jobs.length,
    jobs: jobs.map((j) => ({ id: j.id, feature: j.feature })),
    userId: socket.userId,
    userName: socket.userName,
  });
});
```

## 📈 Monitoreo en Tiempo Real

### 1. Parser de Progreso

```javascript
// worker.js - LogProgressParser
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
      // Formato WDIO actual
      /^\[Android.*\]\s*[✖✓-]?\s*(Given|When|Then|And|But)\s+(.+)$/i,
      /^➡️\s+(Given|When|Then|And|But)\s+(.+)$/i,
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

  handleStepStart(keyword, stepText, status = 'running') {
    const location = this.estimateStepLocation();

    this.currentState.currentStep = {
      keyword,
      text: stepText,
      location,
      feature: this.currentState.feature,
      scenario: this.currentState.scenario,
      startTime: Date.now(),
      status: status,
    };

    this.emitProgress('step:start', this.currentState.currentStep);
    return this.currentState.currentStep;
  }

  emitProgress(type, data) {
    sendToParent({
      type: 'PROGRESS_UPDATE',
      event: type,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 2. Gestor de Progreso en Frontend

```javascript
// public/js/progress-indicator-manager.js - ProgressIndicatorManager
class ProgressIndicatorManager {
  constructor() {
    this.currentJobId = null;
    this.testStates = new Map();
    this.jobFeatures = new Map();
    this.TEST_STATES = {
      IDLE: 'idle',
      RUNNING: 'running',
      PASSED: 'passed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
    };
  }

  setCurrentJob(jobId) {
    this.currentJobId = jobId;
    this.updateRunButtonState(true);
    this.highlightEditorBorder(true);
  }

  setJobFeature(jobId, featureName) {
    this.jobFeatures.set(jobId, featureName);
  }

  setTestState(testFileName, state, jobId) {
    this.testStates.set(testFileName, {
      state,
      jobId,
      timestamp: Date.now(),
    });

    this.updateEditorStateForCurrentFile();
  }

  handleProgressUpdate(data) {
    if (data.event === 'step:start') {
      this.highlightStep(data.data);
    } else if (data.event === 'step:end') {
      this.clearStepHighlight(data.data);
    } else if (data.event === 'error') {
      this.showErrorStep(data.data);
    }
  }

  highlightStep(stepData) {
    if (!window.ideCodeMirror || !this.currentJobId) return;

    const currentFeature = this.jobFeatures.get(this.currentJobId);
    if (!currentFeature) return;

    const testFileName = currentFeature.endsWith('.feature')
      ? currentFeature
      : `${currentFeature}.feature`;

    // Buscar línea del step en el editor
    const stepText = stepData.text.replace(/"/g, '\\"');
    const stepPattern = new RegExp(`^\\s*${stepData.keyword}\\s+${stepText}`);

    for (let i = 0; i < window.ideCodeMirror.lineCount(); i++) {
      const line = window.ideCodeMirror.getLine(i);
      if (stepPattern.test(line)) {
        // Destacar línea actual
        window.ideCodeMirror.markText(
          { line: i, ch: 0 },
          { line: i, ch: line.length },
          { className: 'current-step-highlight' },
        );

        // Scroll a la línea
        window.ideCodeMirror.scrollIntoView({ line: i, ch: 0 });
        break;
      }
    }
  }
}
```

## 🎛️ Controles de Ejecución

### 1. Botones de Acción

```javascript
// public/js/ui.js - Botones en el árbol de features
function addFeatureControls(li, featureName) {
  const actions = document.createElement('div');
  actions.className = 'feature-actions';

  // Botón de ejecución
  const runButton = document.createElement('button');
  runButton.className = 'run-btn btn-run';
  runButton.textContent = 'Run';
  runButton.title = 'Ejecutar test';
  runButton.onclick = (e) => {
    e.stopPropagation();
    executeTestWithSaveCheck(featureName);
  };
  actions.appendChild(runButton);

  // Checkbox para selección batch
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'feature-checkbox';
  checkbox.dataset.featureName = featureName;
  checkbox.onclick = (e) => {
    e.stopPropagation();
    updateBatchControls();
  };
  actions.appendChild(checkbox);

  li.appendChild(actions);
}

// public/js/main.js - Controles del IDE
function handleIdeRun(socket) {
  if (!currentFeature) {
    alert('Por favor selecciona un feature para ejecutar');
    return;
  }

  executeTestWithSaveCheck(currentFeature.feature);
}
```

### 2. Estados Visuales

```css
/* public/css/styles.css - Estados de ejecución */
.file.executing {
  opacity: 0.6;
}

.file.executing .feature-actions {
  pointer-events: none;
}

.file.executing .run-btn {
  background-color: #6c757d;
  cursor: not-allowed;
}

.file.executing .feature-checkbox {
  opacity: 0.5;
}

/* Resaltado de pasos */
.current-step-highlight {
  background-color: #fff3cd;
  border-left: 3px solid #ffc107;
  padding-left: 2px;
}

.step-passed {
  background-color: #d4edda;
  border-left: 3px solid #28a745;
}

.step-failed {
  background-color: #f8d7da;
  border-left: 3px solid #dc3545;
}
```

## 📊 Gestión de Resultados

### 1. Manejo de Finalización

```javascript
// public/js/socket.js - Manejo de job_finished
socket.on('job_finished', (data) => {
  const jobDetails = runningJobs.get(data.slotId);
  if (!jobDetails) return;

  // Remover estado de ejecución
  if (jobDetails.featureName) {
    setFeatureRowExecutionState(jobDetails.featureName, false);
  }

  // Limpiar gestor de progreso
  if (window.progressIndicatorManager && data.jobId) {
    const currentJobId = window.progressIndicatorManager.currentJobId;
    if (currentJobId === data.jobId.toString()) {
      window.progressIndicatorManager.highlightEditorBorder(false);
      window.progressIndicatorManager.clearEditorDecorations();
      window.progressIndicatorManager.updateRunButtonState(false);
    }

    if (jobDetails.featureName) {
      const testFileName = jobDetails.featureName.endsWith('.feature')
        ? jobDetails.featureName
        : `${jobDetails.featureName}.feature`;
      window.progressIndicatorManager.clearTestState(testFileName);
    }
  }

  runningJobs.delete(data.slotId);

  // Actualizar historial si hay reporte
  if (data.reportUrl) {
    loadHistory();
  }

  // Mostrar resultado
  const status = data.exitCode === 0 ? 'exitoso' : 'con errores';
  const notificationType = data.exitCode === 0 ? 'success' : 'error';
  showNotification(`Test finalizado ${status}`, notificationType);
});
```

### 2. Reportes y Logs

```javascript
// public/js/ui.js - Paneles de log
function createLogPanel(slotId) {
  const panel = document.createElement('div');
  panel.className = 'log-panel';
  panel.id = `log-panel-${slotId}`;

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <span>Slot ${slotId}</span>
    <label>
      <input type="checkbox" class="scroll-lock-checkbox" checked>
      Auto-scroll
    </label>
  `;

  const content = document.createElement('div');
  content.className = 'panel-content';

  panel.appendChild(header);
  panel.appendChild(content);

  return panel;
}

// public/js/socket.js - Actualización de logs
socket.on('log_update', (data) => {
  if (data.slotId === undefined) {
    console.log('Log general:', data.logLine);
    return;
  }

  const panel = document.getElementById(`log-panel-${data.slotId}`);
  if (panel) {
    const content = panel.querySelector('.panel-content');
    const scrollLockCheckbox = panel.querySelector('.scroll-lock-checkbox');

    content.textContent += data.logLine;

    // Auto-scroll si está habilitado
    if (scrollLockCheckbox && scrollLockCheckbox.checked) {
      content.scrollTop = content.scrollHeight;
    }
  }
});
```

## 🛡️ Manejo de Errores y Recuperación

### 1. Errores de Ejecución

```javascript
// server.js - Manejo de errores de workers
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

function shouldRetryJob(job) {
  const maxRetries = 3;
  const retryCount = job.retryCount || 0;

  if (retryCount >= maxRetries) {
    return false;
  }

  job.retryCount = retryCount + 1;
  return true;
}
```

### 2. Timeout y Cancelación

```javascript
// server.js - Timeouts de ejecución
const WORKER_TIMEOUT = process.env.WORKER_TIMEOUT || 300000; // 5 minutos

function startWorkerTimeout(slotId) {
  const timeout = setTimeout(() => {
    const workerInfo = workerPool.get(slotId);
    if (workerInfo && workerInfo.status === WORKER_STATES.BUSY) {
      console.warn(`Worker ${slotId} excedió tiempo límite`);
      handleWorkerError(slotId, new Error('Tiempo de ejecución excedido'));
    }
  }, WORKER_TIMEOUT);

  workerInfo.timeout = timeout;
}

// Manejo de stop_all_execution
socket.on('stop_all_execution', () => {
  console.log(`[${socket.userName}] Solicitando detener toda ejecución`);

  // Limpiar cola de jobs pendientes
  jobQueue.length = 0;

  // Detener workers activos
  workerPool.forEach((worker, slotId) => {
    worker.send({ type: 'stop' });
  });

  // Notificar detención
  io.emit('execution_stopped', {
    message: 'Ejecución detenida por usuario',
    timestamp: Date.now(),
    userId: socket.userId,
  });
});
```

## 📖 Documentos Relacionados

- [01-overview.md](./01-overview.md) - Visión general de features
- [02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [03-git-integration.md](./03-git-integration.md) - Integración Git
- [04-real-time-progress.md](./04-real-time-progress.md) - Progreso en tiempo real
- [02-backend/04-worker-system.md](../02-backend/04-worker-system.md) - Sistema de workers
