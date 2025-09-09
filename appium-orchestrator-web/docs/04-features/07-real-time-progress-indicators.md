# Features - Indicadores de Progreso en Tiempo Real

## 📋 Visión General

Los indicadores de progreso en tiempo real proporcionan una experiencia visual interactiva durante la ejecución de tests, mostrando exactamente qué step está siendo ejecutado en el editor CodeMirror con resaltados visuales, iconos en el gutter y sincronización con el estado del botón de ejecución. Este sistema permite a los desarrolladores seguir el progreso de los tests en tiempo real directamente en el código.

## 🏗️ Arquitectura del Sistema

### 1. Componentes Principales

```javascript
// Arquitectura de indicadores de progreso
const ProgressSystem = {
  Manager: 'ProgressIndicatorManager',
  States: {
    TEST_STATES: {
      AVAILABLE: 'available', // Test disponible para ejecutar
      RUNNING: 'running', // Test actualmente en ejecución
      QUEUED: 'queued', // Test en cola esperando ejecución
    },
    STEP_STATES: {
      PENDING: 'pending',
      RUNNING: 'running',
      PASSED: 'passed',
      FAILED: 'failed',
      SKIPPED: 'skipped',
    },
  },
  UI: {
    Editor: 'CodeMirror Integration',
    Buttons: 'Run Button State',
    Highlights: 'Visual Indicators',
  },
};
```

### 2. Flujo de Datos

```javascript
// Flujo de eventos de progreso
Socket.IO Event → Progress Manager → UI Updates
     ↓
  test:progress → handleProgressUpdate() → updateEditorDecorations()
     ↓
  step:start → updateJobState() → createStepDecoration()
     ↓
  step:end → updateJobState() → updateRunButtonState()
```

## 🔧 ProgressIndicatorManager

### 1. Inicialización y Configuración

```javascript
// public/js/progress-indicator-manager.js - Clase principal
class ProgressIndicatorManager {
  constructor() {
    this.activeJobs = new Map(); // Jobs activos con sus estados
    this.editorDecorations = new Map(); // Decoraciones por job
    this.currentJobId = null; // Job actualmente visible
    this.throttleTimeout = null;

    // Sistema de estados por archivo
    this.testStates = new Map();
    this.TEST_STATES = {
      AVAILABLE: 'available',
      RUNNING: 'running',
      QUEUED: 'queued',
    };
  }
}
```

### 2. Manejo de Eventos de Progreso

```javascript
// public/js/progress-indicator-manager.js - Manejo de eventos
handleProgressUpdate(data) {
  const { jobId, event, data: progressData, timestamp } = data;

  if (!jobId) return;

  const jobIdStr = jobId.toString();

  // Actualizar estado del job
  this.updateJobState(jobIdStr, event, progressData, timestamp);

  // Si este job está visible en el editor, actualizar decoraciones
  if (this.currentJobId === jobIdStr) {
    this.updateEditorDecorations(jobIdStr);
  }
}

updateJobState(jobId, event, progressData, timestamp) {
  if (!this.activeJobs.has(jobId)) {
    this.activeJobs.set(jobId, {
      currentStep: null,
      stepHistory: [],
      feature: null,
      scenario: null,
      lastUpdate: timestamp,
    });
  }

  const jobState = this.activeJobs.get(jobId);
  jobState.lastUpdate = timestamp;

  switch (event) {
    case 'step:start':
      jobState.currentStep = {
        ...progressData,
        startTime: timestamp,
        status: 'running',
      };
      break;

    case 'step:end':
      if (jobState.currentStep) {
        jobState.currentStep.status = progressData.status || 'completed';
        jobState.currentStep.duration = progressData.duration;
        jobState.currentStep.endTime = timestamp;
      }
      // Mover al historial
      if (jobState.currentStep) {
        jobState.stepHistory.push({ ...jobState.currentStep });
      }
      jobState.currentStep = null;
      break;

    case 'scenario:start':
      jobState.scenario = progressData.name;
      jobState.stepHistory = [];
      break;

    case 'feature:start':
      jobState.feature = progressData.name;
      jobState.scenario = null;
      jobState.stepHistory = [];
      break;
  }
}
```

## 🎨 Integración con CodeMirror

### 1. Decoraciones Visuales

```javascript
// public/js/progress-indicator-manager.js - Creación de decoraciones
createStepDecoration(step, status) {
  if (!step.location || !window.ideCodeMirror) return null;

  const { line, file } = step.location;

  // Verificar si el archivo actual coincide
  const currentFile = this.getCurrentEditorFile();
  if (currentFile && file && !this.isSameFile(currentFile, file)) {
    return null;
  }

  try {
    let lineNum = parseInt(line, 10) - 1; // CodeMirror usa 0-indexed

    // Si la línea es 1, buscar el step real en el editor
    if (isNaN(lineNum) || lineNum < 0 || lineNum === 0) {
      lineNum = this.findStepInEditor(step);
      if (lineNum === -1) {
        lineNum = 0; // Usar línea 1 como fallback
      }
    }

    // Crear marcador en el gutter
    const gutterMarker = document.createElement('div');
    gutterMarker.className = `step-indicator step-${status}`;
    gutterMarker.title = `${step.keyword || 'Step'}: ${step.text}`;

    // Iconos según estado
    switch (status) {
      case 'running':
        gutterMarker.innerHTML = '▶️';
        break;
      case 'passed':
        gutterMarker.innerHTML = '✅';
        break;
      case 'failed':
        gutterMarker.innerHTML = '❌';
        break;
      default:
        gutterMarker.innerHTML = '⚪';
    }

    // Resaltar la línea según el estado
    let lineClass = '';
    switch (status) {
      case 'running':
        lineClass = 'step-running-line';
        break;
      case 'passed':
        lineClass = 'step-passed-line';
        break;
      case 'failed':
        lineClass = 'step-failed-line';
        break;
    }

    const lineDecoration = window.ideCodeMirror.addLineClass(
      lineNum,
      'background',
      lineClass
    );

    // Agregar al gutter
    window.ideCodeMirror.setGutterMarker(
      lineNum,
      'progress-gutter',
      gutterMarker,
    );

    return {
      clear: () => {
        window.ideCodeMirror.removeLineClass(lineNum, 'background', lineClass);
        window.ideCodeMirror.setGutterMarker(lineNum, 'progress-gutter', null);
      },
    };
  } catch (error) {
    console.warn('Error creating step decoration:', error);
    return null;
  }
}
```

### 2. Búsqueda Inteligente de Steps

```javascript
// public/js/progress-indicator-manager.js - Búsqueda de steps
findStepInEditor(step) {
  if (!window.ideCodeMirror || !step.keyword || !step.text) return -1;

  console.log('[ProgressIndicatorManager] Searching for step in editor:', step);

  // Estrategia 1: Coincidencia exacta
  const exactPattern = step.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const exactRegex = new RegExp(`^\\s*${step.keyword}\\s+${exactPattern}`, 'i');

  // Estrategia 2: Con placeholders genéricos
  const placeholderPattern = step.text.replace(/"[^"]*"/g, '"[^"]*"');
  const placeholderRegex = new RegExp(`^\\s*${step.keyword}\\s+${placeholderPattern}`, 'i');

  // Estrategia 3: Palabras importantes
  const importantWords = this.extractImportantWords(step.text);
  const importantWordsRegex = new RegExp(`^\\s*${step.keyword}\\s+.*${importantWords.join('.*')}.*`, 'i');

  // Estrategia 4: Palabras únicas
  const uniqueWords = this.getUniqueWords(step.text);
  const uniqueWordsRegex = new RegExp(`^\\s*${step.keyword}\\s+.*${uniqueWords.join('.*')}.*`, 'i');

  const lineCount = window.ideCodeMirror.lineCount();
  const matches = [];

  for (let i = 0; i < lineCount; i++) {
    const lineText = window.ideCodeMirror.getLine(i);

    if (exactRegex.test(lineText)) {
      console.log('[ProgressIndicatorManager] Found exact match at line:', i + 1);
      return i;
    }

    if (placeholderRegex.test(lineText)) {
      matches.push({ line: i, priority: 2 });
    }

    if (importantWordsRegex.test(lineText)) {
      matches.push({ line: i, priority: 1 });
    }

    if (uniqueWordsRegex.test(lineText)) {
      matches.push({ line: i, priority: 0 });
    }
  }

  // Devolver la coincidencia con mayor prioridad
  if (matches.length > 0) {
    matches.sort((a, b) => b.priority - a.priority);
    return matches[0].line;
  }

  return -1;
}

// Extracción de palabras importantes
extractImportantWords(text) {
  const stopWords = ['user', 'the', 'to', 'and', 'on', 'in', 'with', 'for', 'at', 'by', 'from', 'of', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'];

  const words = text.toLowerCase()
    .replace(/"[^"]*"/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));

  return words.slice(0, 5);
}
```

## 🎛️ Gestión de Estados

### 1. Estados de Tests

```javascript
// public/js/progress-indicator-manager.js - Gestión de estados
setTestState(filePath, state, jobId = null) {
  if (!filePath || !Object.values(this.TEST_STATES).includes(state)) {
    console.warn('[ProgressIndicatorManager] Invalid test state parameters:', { filePath, state });
    return;
  }

  const previousState = this.testStates.get(filePath);
  this.testStates.set(filePath, { state, jobId, timestamp: Date.now() });

  if (previousState?.state !== state) {
    console.log(`[ProgressIndicatorManager] Test state changed: ${filePath} ${previousState?.state || 'unknown'} -> ${state}`);
  }

  // Si el test comienza a ejecutarse, establecerlo como job actual
  if (state === this.TEST_STATES.RUNNING && jobId) {
    this.setCurrentJob(jobId);
  }

  // Disparar evento de cambio de estado
  this.dispatchTestStateChange(filePath, state, previousState?.state);
}

// Verificación de estados
isTestAvailable(filePath) {
  return this.isTestState(filePath, this.TEST_STATES.AVAILABLE);
}

isTestRunning(filePath) {
  return this.isTestState(filePath, this.TEST_STATES.RUNNING);
}

isTestQueued(filePath) {
  return this.isTestState(filePath, this.TEST_STATES.QUEUED);
}
```

### 2. Actualización de UI

```javascript
// public/js/progress-indicator-manager.js - Actualización de UI
updateRunButtonState(isRunning) {
  const runBtn = document.getElementById('ide-run-btn');
  if (!runBtn) return;

  const isCurrentTestRunning = this.isCurrentTestRunning();

  if (isCurrentTestRunning) {
    runBtn.textContent = 'Corriendo...';
    runBtn.disabled = true;
    runBtn.classList.add('disabled');
  } else {
    runBtn.textContent = 'Ejecutar';
    runBtn.disabled = false;
    runBtn.classList.remove('disabled');
  }
}

highlightEditorBorder(highlight) {
  const editorControls = document.querySelector('.editor-controls');
  if (!editorControls) return;

  if (highlight) {
    editorControls.classList.add('test-execution-active');
  } else {
    editorControls.classList.remove('test-execution-active');
  }
}

setCurrentJob(jobId) {
  this.currentJobId = jobId;

  // Mostrar indicador de inicialización
  this.showInitializingIndicator(jobId);

  // Resaltar header del editor si el test actual está en ejecución
  const shouldHighlight = this.isCurrentTestRunning();
  this.highlightEditorBorder(shouldHighlight);

  // Actualizar estado del botón
  this.updateRunButtonState(true);

  this.updateEditorDecorations(jobId);
}
```

## 🎨 Estilos Visuales

### 1. CSS para Indicadores

```css
/* public/css/styles.css - Estilos de progreso */
.step-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.step-running {
  background-color: #ffc107;
  animation: pulse 1.5s infinite;
}

.step-passed {
  background-color: #28a745;
}

.step-failed {
  background-color: #dc3545;
}

.step-initializing {
  background-color: #6c757d;
  animation: spin 2s linear infinite;
}

/* Resaltado de líneas */
.step-running-line {
  background-color: rgba(255, 193, 7, 0.2) !important;
  border-left: 4px solid #ffc107 !important;
}

.step-passed-line {
  background-color: rgba(40, 167, 69, 0.1) !important;
  border-left: 4px solid #28a745 !important;
}

.step-failed-line {
  background-color: rgba(220, 53, 69, 0.1) !important;
  border-left: 4px solid #dc3545 !important;
}

/* Animaciones */
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Header del editor durante ejecución */
.test-execution-active {
  border: 2px solid #ffc107;
  box-shadow: 0 0 10px rgba(255, 193, 7, 0.3);
}

/* Gutter personalizado */
.CodeMirror-gutters {
  border-right: 1px solid #ddd;
  background-color: #f7f7f7;
}

.progress-gutter {
  width: 30px;
}
```

## 🔌 Integración con Socket.IO

### 1. Eventos de Progreso

```javascript
// public/js/socket.js - Integración con progreso
socket.on('test:progress', (data) => {
  console.log('[Socket] Received test progress:', data);

  // Manejar con el ProgressIndicatorManager
  if (window.progressIndicatorManager) {
    window.progressIndicatorManager.handleProgressUpdate(data);
  }

  // Actualizar UI adicional si es necesario
  updateTestProgressUI(data);
});

socket.on('test:start', (data) => {
  console.log('[Socket] Test started:', data);

  // Establecer estado del test
  if (window.progressIndicatorManager && data.filePath) {
    window.progressIndicatorManager.setTestState(
      data.filePath,
      'running',
      data.jobId,
    );
  }
});

socket.on('test:complete', (data) => {
  console.log('[Socket] Test completed:', data);

  // Limpiar estado del test
  if (window.progressIndicatorManager && data.filePath) {
    window.progressIndicatorManager.clearTestState(data.filePath);
  }
});
```

### 2. Inicialización del Sistema

```javascript
// public/js/main.js - Inicialización
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar ProgressIndicatorManager
  if (window.progressIndicatorManager) {
    console.log('[Main] ProgressIndicatorManager initialized');

    // Escuchar cambios de estado de tests
    document.addEventListener('testStateChange', (event) => {
      console.log('[Main] Test state changed:', event.detail);
      updateUIForTestState(event.detail);
    });
  }

  // Configurar CodeMirror con gutter de progreso
  if (window.ideCodeMirror) {
    window.ideCodeMirror.setOption('gutters', [
      'CodeMirror-linenumbers',
      'progress-gutter',
      'CodeMirror-foldgutter',
    ]);
  }
});

function updateUIForTestState(testState) {
  const { filePath, newState, oldState } = testState;

  // Actualizar botones de árbol si es necesario
  updateTreeButtonsForTestState(filePath, newState);

  // Actualizar estado general de la UI
  updateApplicationState();
}
```

## 🧹 Limpieza y Mantenimiento

### 1. Limpieza Automática

```javascript
// public/js/progress-indicator-manager.js - Limpieza
cleanup() {
  const now = Date.now();
  const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutos

  for (const [jobId, jobState] of this.activeJobs.entries()) {
    if (now - new Date(jobState.lastUpdate).getTime() > CLEANUP_THRESHOLD) {
      this.activeJobs.delete(jobId);
      if (this.editorDecorations.has(jobId)) {
        const decorations = this.editorDecorations.get(jobId);
        decorations.forEach((decoration) => decoration.clear());
        this.editorDecorations.delete(jobId);
      }
    }
  }
}

startCleanupTimer() {
  setInterval(() => this.cleanup(), 60000); // Limpiar cada minuto
}
```

### 2. Gestión de Memoria

```javascript
// public/js/progress-indicator-manager.js - Gestión de memoria
clearEditorDecorations() {
  if (window.ideCodeMirror && this.editorDecorations.has(this.currentJobId)) {
    const decorations = this.editorDecorations.get(this.currentJobId);
    decorations.forEach((decoration) => decoration.clear());
    this.editorDecorations.delete(this.currentJobId);
  }
}

clearAllTestStates() {
  this.testStates.clear();
  console.log('[ProgressIndicatorManager] All test states cleared');
}
```

## 📊 Depuración y Monitoreo

### 1. Información de Depuración

```javascript
// public/js/progress-indicator-manager.js - Depuración
getTestStatesDebugInfo() {
  const debugInfo = {
    totalTests: this.testStates.size,
    states: {
      available: this.getTestsByState(this.TEST_STATES.AVAILABLE).length,
      running: this.getTestsByState(this.TEST_STATES.RUNNING).length,
      queued: this.getTestsByState(this.TEST_STATES.QUEUED).length
    },
    tests: Array.from(this.testStates.entries()).map(([filePath, data]) => ({
      filePath,
      state: data.state,
      jobId: data.jobId,
      timestamp: new Date(data.timestamp).toISOString()
    }))
  };
  return debugInfo;
}

// Método para depuración en consola
window.debugProgressSystem = () => {
  if (window.progressIndicatorManager) {
    console.log('[Debug] Progress System State:',
      window.progressIndicatorManager.getTestStatesDebugInfo()
    );
  }
};
```

### 2. Manejo de Errores

```javascript
// public/js/progress-indicator-manager.js - Manejo de errores
handleProgressError(error) {
  console.error('[ProgressIndicatorManager] Progress error:', error);

  // Limpiar decoraciones si hay error
  this.clearEditorDecorations();

  // Restablecer estados
  if (this.currentJobId) {
    const jobState = this.activeJobs.get(this.currentJobId);
    if (jobState && jobState.feature) {
      this.clearTestState(jobState.feature + '.feature');
    }
  }

  // Mostrar notificación de error
  showNotification('Error en el sistema de progreso', 'error');
}
```

## 🚀 Optimización de Rendimiento

### 1. Throttling y Debouncing

```javascript
// public/js/progress-indicator-manager.js - Optimización
updateEditorDecorations(jobId) {
  // Throttling para evitar actualizaciones frecuentes
  if (this.throttleTimeout) {
    clearTimeout(this.throttleTimeout);
  }

  this.throttleTimeout = setTimeout(() => {
    this.performEditorDecorationUpdate(jobId);
    this.throttleTimeout = null;
  }, 100); // 100ms de throttling
}

performEditorDecorationUpdate(jobId) {
  if (!window.ideCodeMirror) return;

  // Lógica de actualización optimizada
  const jobState = this.activeJobs.get(jobId);
  if (!jobState) return;

  // Solo actualizar si hay cambios significativos
  if (this.shouldUpdateDecorations(jobState)) {
    this.clearEditorDecorations();
    this.createOptimizedDecorations(jobState);
  }
}
```

### 2. Memoización

```javascript
// public/js/progress-indicator-manager.js - Memoización
constructor() {
  this.decorationCache = new Map();
  this.lastDecorationHash = null;
}

shouldUpdateDecorations(jobState) {
  // Calcular hash del estado actual
  const currentStateHash = this.calculateStateHash(jobState);

  if (currentStateHash === this.lastDecorationHash) {
    return false; // No hay cambios
  }

  this.lastDecorationHash = currentStateHash;
  return true;
}

calculateStateHash(jobState) {
  const state = {
    currentStep: jobState.currentStep,
    stepHistory: jobState.stepHistory.length,
    timestamp: Date.now()
  };
  return JSON.stringify(state);
}
```

## 📖 Documentos Relacionados

- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
- [02-backend/03-socket-events.md](../02-backend/03-socket-events.md) - Eventos Socket.IO
- [03-frontend/01-module-overview.md](../03-frontend/01-module-overview.md) - Módulos del frontend
- [04-features/01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [04-features/06-wiremock-integration.md](./06-wiremock-integration.md) - Integración WireMock
