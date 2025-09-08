/**
 * ProgressIndicatorManager - Maneja indicadores visuales de progreso en el editor
 *
 * Esta clase se encarga de mostrar en tiempo real el progreso de ejecución
 * de tests de Appium directamente en el editor CodeMirror, con indicadores
 * visuales que muestran qué step está siendo ejecutado actualmente.
 */
class ProgressIndicatorManager {
  constructor() {
    this.activeJobs = new Map(); // Mapa de jobs activos con sus estados
    this.editorDecorations = new Map(); // Decoraciones por job
    this.currentJobId = null; // Job actualmente visible en el editor
    this.throttleTimeout = null;
  }

  /**
   * Maneja eventos de progreso recibidos desde el servidor
   * @param {Object} data - Datos del evento de progreso
   */
  handleProgressUpdate(data) {
    const { jobId, event, data: progressData, timestamp } = data;

    if (!jobId) return;

    const jobIdStr = jobId.toString();

    // Actualizar estado del job
    this.updateJobState(jobIdStr, event, progressData, timestamp);

    // Si este job está actualmente visible en el editor, actualizar decoraciones
    if (this.currentJobId === jobIdStr) {
      this.updateEditorDecorations(jobIdStr);
    }
  }

  /**
   * Actualiza el estado de un job específico
   * @param {string} jobId - ID del job
   * @param {string} event - Tipo de evento (step:start, step:end, etc.)
   * @param {Object} progressData - Datos del progreso
   * @param {string} timestamp - Timestamp del evento
   */
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
        jobState.stepHistory = []; // Limpiar historial para nuevo escenario
        break;

      case 'feature:start':
        jobState.feature = progressData.name;
        jobState.scenario = null;
        jobState.stepHistory = [];
        break;
    }
  }

  /**
   * Establece qué job está actualmente visible en el editor
   * @param {string} jobId - ID del job a mostrar
   */
  setCurrentJob(jobId) {
    this.currentJobId = jobId;
    
    // Mostrar indicador de "inicializando" mientras esperamos el primer step
    this.showInitializingIndicator(jobId);
    
    // Resaltar header del editor para indicar ejecución
    this.highlightEditorBorder(true);
    
    // Actualizar estado del botón de ejecución
    this.updateRunButtonState(true);
    
    this.updateEditorDecorations(jobId);
  }

  /**
   * Muestra un indicador de inicialización en la primera línea del feature
   * @param {string} jobId - ID del job
   */
  showInitializingIndicator(jobId) {
    if (!window.ideCodeMirror) return;
    
    // Buscar la primera línea que contenga "Feature:" o "Scenario:"
    const lineCount = window.ideCodeMirror.lineCount();
    let targetLine = 0; // Por defecto, primera línea
    
    for (let i = 0; i < lineCount; i++) {
      const lineText = window.ideCodeMirror.getLine(i);
      if (lineText.match(/^\s*(Feature:|Scenario:)/i)) {
        targetLine = i;
        break;
      }
    }
    
    // Crear indicador de inicialización
    const initializingDecoration = this.createInitializingDecoration(targetLine, jobId);
    if (initializingDecoration) {
      if (!this.editorDecorations.has(jobId)) {
        this.editorDecorations.set(jobId, []);
      }
      this.editorDecorations.get(jobId).push(initializingDecoration);
    }
  }

  /**
   * Crea una decoración de inicialización
   */
  createInitializingDecoration(lineNum, jobId) {
    if (!window.ideCodeMirror) return null;
    
    try {
      // Crear marcador en el gutter
      const gutterMarker = document.createElement('div');
      gutterMarker.className = 'step-indicator step-initializing';
      gutterMarker.title = 'Inicializando test...';
      gutterMarker.innerHTML = '⏳';
      
      // NO crear decoración de línea por ahora - solo gutter markers
      // const lineDecoration = window.ideCodeMirror.addLineClass(
      //   lineNum,
      //   'background',
      //   'step-line step-line-initializing'
      // );
      
      // Agregar al gutter
      window.ideCodeMirror.setGutterMarker(
        lineNum,
        'progress-gutter',
        gutterMarker,
      );
      
      return {
        clear: () => {
          // window.ideCodeMirror.removeLineClass(lineNum, 'background', 'step-line step-line-initializing');
          window.ideCodeMirror.setGutterMarker(lineNum, 'progress-gutter', null);
        },
      };
    } catch (error) {
      console.warn('Error creating initializing decoration:', error);
      return null;
    }
  }

  /**
   * Limpia los indicadores del editor
   */
  clearEditorDecorations() {
    if (window.ideCodeMirror && this.editorDecorations.has(this.currentJobId)) {
      const decorations = this.editorDecorations.get(this.currentJobId);
      decorations.forEach((decoration) => decoration.clear());
      this.editorDecorations.delete(this.currentJobId);
    }
    // No restablecer currentJobId aquí, solo limpiar las decoraciones
  }

  /**
   * Resalta el header del editor para indicar ejecución
   * @param {boolean} highlight - Si resaltar o no
   */
  highlightEditorBorder(highlight) {
    const editorControls = document.querySelector('.editor-controls');
    if (!editorControls) return;
    
    if (highlight) {
      editorControls.classList.add('test-execution-active');
    } else {
      editorControls.classList.remove('test-execution-active');
    }
  }

  /**
   * Actualiza el estado del botón de ejecución
   * @param {boolean} isRunning - Si el test está corriendo
   */
  updateRunButtonState(isRunning) {
    const runBtn = document.getElementById('ide-run-btn');
    if (!runBtn) return;
    
    if (isRunning) {
      runBtn.textContent = 'Corriendo...';
      runBtn.disabled = true;
      runBtn.classList.add('disabled');
    } else {
      runBtn.textContent = 'Ejecutar';
      runBtn.disabled = false;
      runBtn.classList.remove('disabled');
    }
  }

  /**
   * Actualiza las decoraciones en el editor para el job especificado
   * @param {string} jobId - ID del job
   */
  updateEditorDecorations(jobId) {
    if (!window.ideCodeMirror) {
      console.log('[ProgressIndicatorManager] No CodeMirror editor available');
      return;
    }

    const jobState = this.activeJobs.get(jobId);
    if (!jobState) {
      return;
    }

    // Limpiar decoraciones anteriores
    this.clearEditorDecorations();

    // Crear nuevas decoraciones
    const decorations = [];

    // Decoración para el step actual
    if (jobState.currentStep && jobState.currentStep.location) {
      const currentDecoration = this.createStepDecoration(
        jobState.currentStep,
        'running',
      );
      if (currentDecoration) {
        decorations.push(currentDecoration);
      }
    }

    // Decoraciones para steps completados
    jobState.stepHistory.forEach((step) => {
      if (step.location && step.status) {
        const decoration = this.createStepDecoration(step, step.status);
        if (decoration) {
          decorations.push(decoration);
        }
      }
    });

    this.editorDecorations.set(jobId, decorations);
  }

  /**
   * Crea una decoración para un step específico
   * @param {Object} step - Información del step
   * @param {string} status - Estado del step (running, passed, failed)
   * @returns {Object|null} Decoración de CodeMirror
   */
  createStepDecoration(step, status) {
    if (!step.location || !window.ideCodeMirror) return null;

    const { line, file } = step.location;

    // Verificar si el archivo actual coincide con el archivo del step
    const currentFile = this.getCurrentEditorFile();
    if (currentFile && file && !this.isSameFile(currentFile, file)) {
      console.log('[ProgressIndicatorManager] File mismatch:', { currentFile, file });
      // Por ahora, mostrar indicadores en cualquier archivo abierto
      // return null;
    }

    try {
      let lineNum = parseInt(line, 10) - 1; // CodeMirror usa 0-indexed
      
      // Si la línea es 1 (que es lo que el parser siempre da), intentar encontrar el step real en el editor
      if (isNaN(lineNum) || lineNum < 0 || lineNum === 0) { // 0 es línea 1 en 1-indexed
        lineNum = this.findStepInEditor(step);
        if (lineNum === -1) {
          console.log('[ProgressIndicatorManager] Could not find step in editor, using line 1 as fallback');
          lineNum = 0; // Usar línea 1 como fallback
        } else {
          console.log('[ProgressIndicatorManager] Found step at line:', lineNum + 1);
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

      // Resaltar la línea actual según el estado
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
        default:
          lineClass = 'step-running-line';
      }
      
      const lineDecoration = window.ideCodeMirror.addLineClass(
        lineNum,
        'background',
        lineClass
      );
      
      console.log(`[ProgressIndicatorManager] Added ${lineClass} to line ${lineNum + 1}`);

      // Agregar al gutter
      window.ideCodeMirror.setGutterMarker(
        lineNum,
        'progress-gutter',
        gutterMarker,
      );

      return {
        clear: () => {
          // Remover la clase de la línea
          window.ideCodeMirror.removeLineClass(lineNum, 'background', lineClass);
          window.ideCodeMirror.setGutterMarker(
            lineNum,
            'progress-gutter',
            null,
          );
        },
      };
    } catch (error) {
      console.warn('Error creating step decoration:', error);
      return null;
    }
  }

  /**
   * Obtiene el archivo actualmente abierto en el editor
   * @returns {string|null} Ruta del archivo actual
   */
  getCurrentEditorFile() {
    // Intentar obtener el nombre del feature del job actual
    if (this.currentJobId) {
      const jobState = this.activeJobs.get(this.currentJobId);
      if (jobState && jobState.feature) {
        // Convertir el nombre del feature a nombre de archivo
        return jobState.feature.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.feature';
      }
    }
    return null;
  }

  /**
   * Compara si dos rutas de archivo son equivalentes
   * @param {string} file1 - Primera ruta de archivo
   * @param {string} file2 - Segunda ruta de archivo
   * @returns {boolean} True si son el mismo archivo
   */
  isSameFile(file1, file2) {
    if (!file1 || !file2) return false;

    // Normalizar rutas (quitar extensión, normalizar separadores, etc.)
    const normalize = (path) => {
      return path
        .replace(/\\/g, '/')
        .replace(/\.(feature|gherkin)$/i, '')
        .toLowerCase()
        .split('/')
        .pop(); // Solo el nombre del archivo
    };

    return normalize(file1) === normalize(file2);
  }

  /**
   * Busca un step en el editor basado en el keyword y texto aproximado
   * @param {Object} step - Step a buscar
   * @returns {number} Número de línea (0-indexed) o -1 si no se encuentra
   */
  findStepInEditor(step) {
    if (!window.ideCodeMirror || !step.keyword || !step.text) return -1;

    console.log('[ProgressIndicatorManager] Searching for step in editor:', step);
    
    // Estrategia 1: Buscar coincidencia exacta primero
    const exactPattern = step.text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const exactRegex = new RegExp(`^\\s*${step.keyword}\\s+${exactPattern}`, 'i');
    
    // Estrategia 2: Buscar con placeholders genéricos
    const placeholderPattern = step.text.replace(/"[^"]*"/g, '"[^"]*"');
    const placeholderRegex = new RegExp(`^\\s*${step.keyword}\\s+${placeholderPattern}`, 'i');
    
    // Estrategia 3: Buscar solo las primeras palabras clave
    const keywords = step.text.split(' ').slice(0, 4).join(' ');
    const keywordRegex = new RegExp(`^\\s*${step.keyword}\\s+${keywords.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}.*`, 'i');
    
    const lineCount = window.ideCodeMirror.lineCount();
    for (let i = 0; i < lineCount; i++) {
      const lineText = window.ideCodeMirror.getLine(i);
      
      if (exactRegex.test(lineText)) {
        console.log('[ProgressIndicatorManager] Found exact match at line:', i + 1);
        return i;
      }
      
      if (placeholderRegex.test(lineText)) {
        console.log('[ProgressIndicatorManager] Found placeholder match at line:', i + 1);
        return i;
      }
      
      if (keywordRegex.test(lineText)) {
        console.log('[ProgressIndicatorManager] Found keyword match at line:', i + 1);
        return i;
      }
    }
    
    console.log('[ProgressIndicatorManager] No match found for step:', step.text);
    return -1;
  }

  /**
   * Limpia todos los jobs completados o inactivos
   */
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

  /**
   * Inicia el proceso de limpieza periódica
   */
  startCleanupTimer() {
    setInterval(() => this.cleanup(), 60000); // Limpiar cada minuto
  }
}

// Crear instancia global y asignar al window
const progressIndicatorManager = new ProgressIndicatorManager();
window.progressIndicatorManager = progressIndicatorManager;

// Iniciar limpieza automática
progressIndicatorManager.startCleanupTimer();

export default progressIndicatorManager;
