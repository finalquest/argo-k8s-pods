# Frontend - Módulos del Sistema

## 📋 Visión General

El frontend de Appium Orchestrator Web está construido con **vanilla JavaScript** utilizando una arquitectura modular que separa las responsabilidades en diferentes módulos. Esta organización permite un mantenimiento más sencillo, mejor testabilidad y una clara separación de conceptos.

## 🏗️ Arquitectura Modular

### 1. Estructura de Módulos

```javascript
// Estructura principal de módulos
public/js/
├── api.js              # Comunicación con el backend
├── main.js             # Lógica principal y orquestación
├── ui.js               # Componentes de UI y manipulación DOM
├── socket.js           # Eventos Socket.IO
├── wiremock.js         # Gestión de WireMock
├── progress-indicator-manager.js  # Indicadores de progreso
├── state/              # Sistema de gestión de estado
│   ├── state-manager.js    # Gestor centralizado de estado
│   └── event-manager.js    # Sistema de eventos desacoplado
└── utils/              # Utilidades centralizadas
    └── error-handling.js  # Manejo de errores
```

### 2. Patrón de Módulos ES6

```javascript
// api.js - Patrón de exportación modular
export async function fetchFeatures(branch, client) {
  // Implementación...
}

export async function getFeatureContent(branch, client, feature) {
  // Implementación...
}

// main.js - Importación de módulos
import { fetchFeatures, getFeatureContent } from './api.js';
import { initIdeView, renderFeatureTree } from './ui.js';
import { initializeSocketListeners } from './socket.js';
```

## 🔧 Módulo API (`api.js`)

### 1. Funciones Principales

```javascript
// public/js/api.js - Comunicación HTTP con el backend
export async function fetchFeatures(branch, client) {
  try {
    const response = await fetch(`/api/features/${branch}/${client}`);
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching features:', error);
    throw error;
  }
}

export async function getFeatureContent(branch, client, feature) {
  try {
    const response = await fetch(
      `/api/features/${branch}/${client}/${feature}`,
    );
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('Error getting feature content:', error);
    throw error;
  }
}

export async function saveFeatureContent(branch, client, feature, content) {
  try {
    const response = await fetch(
      `/api/features/${branch}/${client}/${feature}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      },
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving feature content:', error);
    throw error;
  }
}
```

### 2. Gestión de Workspaces

```javascript
// public/js/api.js - Operaciones de workspace
export async function getWorkspaceStatus(branch) {
  try {
    const response = await fetch(`/api/workspace/${branch}/status`);
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting workspace status:', error);
    throw error;
  }
}

export async function prepareWorkspace(branch) {
  try {
    const response = await fetch(`/api/workspace/${branch}/prepare`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error preparing workspace:', error);
    throw error;
  }
}
```

### 3. Gestión Git

```javascript
// public/js/api.js - Operaciones Git
export async function getCommitStatus(branch) {
  try {
    const response = await fetch(`/api/git/${branch}/commit-status`);
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error getting commit status:', error);
    throw error;
  }
}

export async function commitChanges(branch, files, message) {
  try {
    const response = await fetch(`/api/git/${branch}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files, message }),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error committing changes:', error);
    throw error;
  }
}

export async function pushChanges(branch) {
  try {
    const response = await fetch(`/api/git/${branch}/push`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error pushing changes:', error);
    throw error;
  }
}
```

## 🎨 Módulo UI (`ui.js`)

### 1. Inicialización del IDE

```javascript
// public/js/ui.js - Configuración del editor CodeMirror
export function initIdeView({ onSave, onCommit, onRun }) {
  const ideContent = document.getElementById('ide-content');

  // Configurar CodeMirror
  window.ideCodeMirror = CodeMirror(ideContent, {
    mode: 'gherkin',
    theme: 'default',
    lineNumbers: true,
    lineWrapping: true,
    extraKeys: {
      'Ctrl-S': () => onSave(),
      'Cmd-S': () => onSave(),
      F5: () => onRun(),
    },
    viewportMargin: Infinity,
  });

  // Configurar estado inicial
  setIdeEditorContent({
    content:
      '// Selecciona una branch y luego un archivo para ver su contenido.',
    isReadOnly: true,
    isModified: false,
  });

  return window.ideCodeMirror;
}

export function setIdeEditorContent({ content, isReadOnly, isModified }) {
  if (!window.ideCodeMirror) return;

  window.ideCodeMirror.setValue(content || '');
  window.ideCodeMirror.setOption('readOnly', isReadOnly);

  // Manejar estado de modificación
  if (!isModified) {
    window.ideCodeMirror.markClean();
  }

  // Actualizar botones
  updateIdeButtons(isReadOnly, isModified);
}

function updateIdeButtons(isReadOnly, isModified) {
  const saveBtn = document.getElementById('ide-save-btn');
  const commitBtn = document.getElementById('ide-commit-btn');
  const runBtn = document.getElementById('ide-run-btn');

  if (saveBtn) {
    saveBtn.disabled = isReadOnly || !isModified;
  }

  if (commitBtn) {
    commitBtn.disabled = isReadOnly || !isModified;
  }

  if (runBtn) {
    runBtn.disabled = isReadOnly;
  }
}
```

### 2. Renderizado de Árbol de Features

```javascript
// public/js/ui.js - Gestión del árbol de features
export function renderFeatureTree(parentElement, nodes, config) {
  parentElement.innerHTML = '';

  nodes.forEach((node) => {
    const li = createFeatureNode(node, config);
    parentElement.appendChild(li);
  });

  // Configurar event delegation
  setupFeatureTreeEvents(parentElement, config);
}

function createFeatureNode(node, config) {
  const li = document.createElement('li');
  li.className = node.type;
  li.dataset.featureName = node.name;

  // Contenido del nodo
  const content = document.createElement('span');
  content.className = 'node-content';
  content.textContent = node.name;

  // Acciones para features
  if (node.type === 'file') {
    const actions = document.createElement('div');
    actions.className = 'feature-actions';

    // Botón de ejecución
    const runButton = document.createElement('button');
    runButton.className = 'run-btn btn-run';
    runButton.textContent = 'Run';
    runButton.title = 'Ejecutar test';
    actions.appendChild(runButton);

    li.appendChild(actions);
  }

  li.appendChild(content);

  // Manejar expansión/contracción
  if (node.children && node.children.length > 0) {
    const childrenContainer = document.createElement('ul');
    childrenContainer.className = 'children';
    childrenContainer.style.display = 'none';

    node.children.forEach((child) => {
      childrenContainer.appendChild(createFeatureNode(child, config));
    });

    li.appendChild(childrenContainer);

    // Toggle al hacer click en el contenido
    content.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNode(li);
    });
  }

  return li;
}

function setupFeatureTreeEvents(parentElement, config) {
  // Event delegation para clicks en archivos
  parentElement.addEventListener('click', (e) => {
    const fileElement = e.target.closest('li.file');
    if (!fileElement) return;

    // Si es un botón de acción, no abrir el archivo
    if (e.target.closest('.feature-actions')) {
      e.stopPropagation();
      return;
    }

    // Abrir archivo en el editor
    const featureName = fileElement.dataset.featureName;
    if (featureName && config.onFileSelect) {
      config.onFileSelect(featureName);
    }
  });

  // Event delegation para botones de ejecución
  parentElement.addEventListener('click', (e) => {
    if (e.target.classList.contains('run-btn')) {
      e.stopPropagation();
      const featureElement = e.target.closest('li.file');
      const featureName = featureElement.dataset.featureName;

      if (featureName && config.onRunTest) {
        config.onRunTest(featureName);
      }
    }
  });
}
```

### 3. Gestión de Workers y Colas

```javascript
// public/js/ui.js - Visualización del estado del sistema
export function renderWorkerPool(slots, socket) {
  const container = document.getElementById('worker-pool');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(slots).forEach(([slotId, slot]) => {
    const slotElement = createWorkerSlotElement(slotId, slot, socket);
    container.appendChild(slotElement);
  });
}

function createWorkerSlotElement(slotId, slot, socket) {
  const div = document.createElement('div');
  div.className = `worker-slot ${slot.status}`;
  div.dataset.slotId = slotId;

  const header = document.createElement('div');
  header.className = 'slot-header';
  header.textContent = `Slot ${slotId}`;

  const status = document.createElement('div');
  status.className = 'slot-status';
  status.textContent = slot.status;

  const content = document.createElement('div');
  content.className = 'slot-content';

  if (slot.currentJob) {
    content.innerHTML = `
      <div class="job-info">
        <div class="job-feature">${slot.currentJob.feature}</div>
        <div class="job-client">${slot.currentJob.client}</div>
        <div class="job-time">Iniciado: ${new Date(slot.currentJob.startTime).toLocaleTimeString()}</div>
      </div>
    `;
  }

  div.appendChild(header);
  div.appendChild(status);
  div.appendChild(content);

  return div;
}

export function updateQueueStatus(status) {
  const container = document.getElementById('queue-status');
  if (!container) return;

  container.innerHTML = `
    <div class="queue-info">
      <div class="queue-length">Jobs en cola: ${status.length}</div>
      <div class="queue-jobs">
        ${status.jobs
          .map(
            (job) => `
          <div class="queue-job">
            <span class="job-feature">${job.feature}</span>
            <span class="job-client">${job.client}</span>
            <span class="job-priority ${job.priority}">${job.priority}</span>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}
```

## 📡 Módulo Socket (`socket.js`)

### 1. Eventos de Ejecución

```javascript
// public/js/socket.js - Gestión de eventos Socket.IO
export function runTest(
  socket,
  branch,
  client,
  feature,
  highPriority = false,
  record = false,
) {
  const selectedApk = document.getElementById('apk-version-select').value;

  const jobPayload = {
    branch,
    client,
    feature,
    highPriority,
    record,
    deviceSerial: document.getElementById('device-select').value,
  };

  // Configurar APK según fuente
  if (apkSource === 'local') {
    jobPayload.localApk = selectedApk;
  } else {
    jobPayload.apkVersion = selectedApk;
  }

  // Configurar opciones adicionales
  const useLocalMappingsCheckbox = document.getElementById(
    'use-local-mappings-checkbox',
  );
  jobPayload.usePreexistingMapping = useLocalMappingsCheckbox.checked;

  const persistentWorkspaceCheckbox = document.getElementById(
    'persistent-workspace-checkbox',
  );
  jobPayload.persistentWorkspace = persistentWorkspaceCheckbox.checked;

  // Enviar job al servidor
  socket.emit('run_test', jobPayload);
}

export function runSelectedTests(socket) {
  const selectedCheckboxes = document.querySelectorAll(
    '.feature-checkbox:checked',
  );
  if (selectedCheckboxes.length === 0) {
    alert('No hay features seleccionados para ejecutar.');
    return;
  }

  const jobs = Array.from(selectedCheckboxes).map((cb) => ({
    branch: document.getElementById('branch-select').value,
    client: document.getElementById('client-select').value,
    feature: cb.dataset.featureName,
    highPriority: document.getElementById('batch-priority-checkbox').checked,
    deviceSerial: document.getElementById('device-select').value,
  }));

  socket.emit('run_batch', {
    jobs,
    record: document.getElementById('record-mappings-checkbox').checked,
    usePreexistingMapping: document.getElementById(
      'use-local-mappings-checkbox',
    ).checked,
    persistentWorkspace: document.getElementById(
      'persistent-workspace-checkbox',
    ).checked,
  });
}
```

### 2. Manejo de Estados de Ejecución

```javascript
// public/js/socket.js - Gestión de estados
function setFeatureRowExecutionState(featureName, isExecuting) {
  const featureRow = document.querySelector(
    `li.file[data-feature-name="${featureName}"]`,
  );
  if (featureRow) {
    if (isExecuting) {
      featureRow.classList.add('executing');
    } else {
      featureRow.classList.remove('executing');
    }
  }
}

export function initializeSocketListeners(socket) {
  socket.on('job_started', (data) => {
    runningJobs.set(data.slotId, data);

    // Marcar feature como en ejecución
    if (data.featureName) {
      setFeatureRowExecutionState(data.featureName, true);
    }

    // Configurar gestor de progreso
    if (window.progressIndicatorManager && data.jobId) {
      window.progressIndicatorManager.setCurrentJob(data.jobId.toString());

      if (data.featureName) {
        window.progressIndicatorManager.setJobFeature(
          data.jobId.toString(),
          data.featureName,
        );

        const testFileName = data.featureName.endsWith('.feature')
          ? data.featureName
          : `${data.featureName}.feature`;
        window.progressIndicatorManager.setTestState(
          testFileName,
          window.progressIndicatorManager.TEST_STATES.RUNNING,
          data.jobId.toString(),
        );
      }
    }
  });

  socket.on('job_finished', (data) => {
    const jobDetails = runningJobs.get(data.slotId);
    if (!jobDetails) return;

    // Limpiar estado de ejecución
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
  });
}
```

## 🔄 Módulo Main (`main.js`)

### 1. Inicialización de la Aplicación

```javascript
// public/js/main.js - Punto de entrada principal
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Verificar autenticación
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    // Inicializar Socket.IO
    const socket = io();

    // Inicializar componentes
    initializeApp(socket);
  } catch (error) {
    console.error('Error initializing app:', error);
    showError('Error al inicializar la aplicación');
  }
});

async function initializeApp(socket) {
  // Configurar listeners de Socket.IO
  initializeSocketListeners(socket);

  // Inicializar UI
  initIdeView({
    onSave: () => handleSave(),
    onCommit: () => handleCommit(),
    onRun: () => handleIdeRun(socket),
  });

  // Configurar controles de la aplicación
  initializeAppControls(socket);

  // Cargar estado inicial
  await loadInitialData();

  console.log('Aplicación inicializada correctamente');
}
```

### 2. Manejo de Eventos de Usuario

```javascript
// public/js/main.js - Gestión de eventos
function initializeAppControls(socket) {
  // Branch selector
  const branchSelect = document.getElementById('branch-select');
  branchSelect.addEventListener('change', () => handleBranchChange(socket));

  // Client selector
  const clientSelect = document.getElementById('client-select');
  clientSelect.addEventListener('change', () => handleClientChange(socket));

  // Botones de acción
  document
    .getElementById('fetch-features-btn')
    .addEventListener('click', () => {
      handleFetchFeatures(socket);
    });

  document
    .getElementById('prepare-workspace-btn')
    .addEventListener('click', () => {
      handlePrepareWorkspace(socket);
    });

  // Botones del IDE
  document.getElementById('ide-save-btn').addEventListener('click', () => {
    handleSave();
  });

  document.getElementById('ide-commit-btn').addEventListener('click', () => {
    handleCommit();
  });

  document.getElementById('ide-run-btn').addEventListener('click', () => {
    handleIdeRun(socket);
  });
}

async function handleBranchChange(socket) {
  const branch = document.getElementById('branch-select').value;

  // Limpiar selector de clientes
  const clientSelect = document.getElementById('client-select');
  clientSelect.innerHTML = '<option value="">Seleccionar cliente...</option>';

  // Actualizar estado de workspace
  updateWorkspaceStatus(branch);

  // Limpiar editor
  setIdeEditorContent({
    content: '// Selecciona una branch y cliente para ver features.',
    isReadOnly: true,
    isModified: false,
  });
}

async function handleClientChange(socket) {
  const branch = document.getElementById('branch-select').value;
  const client = document.getElementById('client-select').value;

  if (!branch || !client) return;

  // Cargar features
  await loadFeatures(socket, branch, client);
}
```

### 3. Integración con Tree View

```javascript
// public/js/main.js - Integración con botones del árbol
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

function openFeatureFromTree(featureName) {
  const branch = getCurrentBranch();
  const client = getCurrentClient();

  if (!branch || !client) {
    alert('Por favor selecciona una branch y cliente primero.');
    return;
  }

  // Cargar contenido del feature
  getFeatureContent(branch, client, featureName)
    .then((content) => {
      setIdeEditorContent({
        content,
        isReadOnly: false,
        isModified: false,
      });

      // Actualizar estado actual
      currentFeature = { branch, client, feature: featureName };

      // Cambiar a tab del editor
      switchTab('editor');
    })
    .catch((error) => {
      console.error('Error loading feature:', error);
      showError('Error al cargar el feature');
    });
}
```

## 📈 Módulo Progress Indicator (`progress-indicator-manager.js`)

### 1. Gestión de Progreso

```javascript
// public/js/progress-indicator-manager.js - Sistema de indicadores
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

  clearTestState(testFileName) {
    this.testStates.delete(testFileName);
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

  updateEditorStateForCurrentFile() {
    if (!window.ideCodeMirror || !this.currentJobId) return;

    const currentFeature = this.jobFeatures.get(this.currentJobId);
    if (!currentFeature) return;

    const testFileName = currentFeature.endsWith('.feature')
      ? currentFeature
      : `${currentFeature}.feature`;

    const testState = this.testStates.get(testFileName);
    if (testState) {
      this.updateEditorBasedOnTestState(testState.state);
    }
  }
}
```

## 📖 Documentos Relacionados

- [01-module-overview.md](./01-module-overview.md) - Visión general de los módulos
- [02-api-integration.md](./02-api-integration.md) - Integración con API del backend
- [04-features/01-test-execution.md](../04-features/01-test-execution.md) - Ejecución de tests
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
