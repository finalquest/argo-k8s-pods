import { apkSource, loadHistory } from './api.js';
import {
  updateQueueStatus,
  renderWorkerPool,
  renderWorkerStatus,
} from './ui.js';
import { globalEvents } from './state/event-manager.js';

let runningJobs = new Map();

// Función para establecer el estado de ejecución de una feature row
function setFeatureRowExecutionState(featureName, isExecuting) {
  // Buscar la row del feature en el tree view
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

export function runTest(
  socket,
  branch,
  client,
  feature,
  highPriority = false,
  record = false,
) {
  const selectedApk = document.getElementById('apk-version-select').value;
  let jobPayload = {
    branch,
    client,
    feature,
    highPriority,
    record,
    deviceSerial: document.getElementById('device-select').value,
  };

  if (apkSource === 'local') {
    jobPayload.localApk = selectedApk;
  } else {
    jobPayload.apkVersion = selectedApk;
  }

  const useLocalMappingsCheckbox = document.getElementById(
    'use-local-mappings-checkbox',
  );
  jobPayload.usePreexistingMapping = useLocalMappingsCheckbox.checked;

  // Get persistent workspace checkbox value
  const persistentWorkspaceCheckbox = document.getElementById(
    'persistent-workspace-checkbox',
  );
  jobPayload.persistentWorkspace = persistentWorkspaceCheckbox.checked;

  // Get quick test checkbox value
  const quickTestCheckbox = document.getElementById('quick-test-checkbox');
  jobPayload.quickTest = quickTestCheckbox.checked;

  socket.emit('run_test', jobPayload);
}

export function runSelectedTests(socket) {
  const branchSelect = document.getElementById('branch-select');
  const clientSelect = document.getElementById('client-select');
  const apkVersionSelect = document.getElementById('apk-version-select');
  const priorityCheckbox = document.getElementById('batch-priority-checkbox');
  const recordCheckbox = document.getElementById('record-mappings-checkbox');
  const useLocalMappingsCheckbox = document.getElementById(
    'use-local-mappings-checkbox',
  );
  const persistentWorkspaceCheckbox = document.getElementById(
    'persistent-workspace-checkbox',
  );
  const quickTestCheckbox = document.getElementById('quick-test-checkbox');

  const selectedBranch = branchSelect.value;
  const selectedClient = clientSelect.value;
  const selectedApk = apkVersionSelect.value;
  const highPriority = priorityCheckbox.checked;
  const recordMappings = recordCheckbox.checked;
  const usePreexistingMapping = useLocalMappingsCheckbox.checked;
  const persistentWorkspace = persistentWorkspaceCheckbox.checked;
  const quickTest = quickTestCheckbox.checked;

  const selectedCheckboxes = document.querySelectorAll(
    '.feature-checkbox:checked',
  );
  if (selectedCheckboxes.length === 0) {
    alert('No hay features seleccionados para ejecutar.');
    return;
  }

  const baseJob = {
    branch: selectedBranch,
    client: selectedClient,
    highPriority: highPriority,
    deviceSerial: document.getElementById('device-select').value,
  };

  if (apkSource === 'local') {
    baseJob.localApk = selectedApk;
  } else {
    baseJob.apkVersion = selectedApk;
  }

  const jobs = Array.from(selectedCheckboxes).map((cb) => ({
    ...baseJob,
    feature: cb.dataset.featureName,
  }));

  socket.emit('run_batch', {
    jobs,
    record: recordMappings,
    usePreexistingMapping,
    persistentWorkspace,
    quickTest,
  });
}

export function initializeSocketListeners(socket) {
  socket.on('init', (data) => {
    updateQueueStatus(data.status);
    renderWorkerPool(data.slots, socket);
    renderWorkerStatus(data.slots);
  });

  socket.on('worker_pool_update', (slots) => {
    console.log('[SOCKET] worker_pool_update received:', slots);
    renderWorkerPool(slots, socket);
    renderWorkerStatus(slots);

    // Also refresh workers list to get detailed information
    if (typeof window.refreshWorkersList === 'function') {
      console.log('[SOCKET] Calling refreshWorkersList from worker_pool_update');
      window.refreshWorkersList();
    }
  });

  socket.on('queue_status_update', (status) => {
    updateQueueStatus(status);
  });

  socket.on('job_started', (data) => {
    runningJobs.set(data.slotId, data);

    // Marcar la row del feature como en ejecución
    if (data.featureName) {
      setFeatureRowExecutionState(data.featureName, true);
    }

    // Set this job as the current visible job in the progress indicator manager
    if (window.progressIndicatorManager && data.jobId) {
      const jobIdStr = data.jobId.toString();
      window.progressIndicatorManager.setCurrentJob(jobIdStr);

      // Establecer el nombre del feature para el job (necesario para los highlights)
      if (data.featureName) {
        window.progressIndicatorManager.setJobFeature(
          jobIdStr,
          data.featureName,
        );
      }

      // Establecer el estado del test como RUNNING
      if (data.featureName) {
        const testFileName = data.featureName.endsWith('.feature')
          ? data.featureName
          : `${data.featureName}.feature`;
        window.progressIndicatorManager.setTestState(
          testFileName,
          window.progressIndicatorManager.TEST_STATES.RUNNING,
          jobIdStr,
        );
      }
    }

    const panel = document.getElementById(`log-panel-${data.slotId}`);
    if (panel) {
      panel.querySelector('.panel-content').innerHTML = '';
    }
  });

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

      // Solo hacer auto-scroll si el checkbox está marcado
      if (scrollLockCheckbox && scrollLockCheckbox.checked) {
        content.scrollTop = content.scrollHeight;
      }
    }
  });

  socket.on('progress_update', (data) => {
    // Manejar eventos de progreso del worker
    console.log('Progress update:', data);

    // Si hay un indicador de progreso global, manejar el evento
    if (window.progressIndicatorManager) {
      window.progressIndicatorManager.handleProgressUpdate(data);
    }
  });

  socket.on('job_finished', (data) => {
    const jobDetails = runningJobs.get(data.slotId);
    if (!jobDetails) return;

    // Remover el estado de ejecución de la row del feature
    if (jobDetails.featureName) {
      setFeatureRowExecutionState(jobDetails.featureName, false);
    }

    // Clear the current job in progress indicator manager if this was the current job
    if (window.progressIndicatorManager && data.jobId) {
      const currentJobId = window.progressIndicatorManager.currentJobId;
      if (currentJobId === data.jobId.toString()) {
        window.progressIndicatorManager.highlightEditorBorder(false);
        window.progressIndicatorManager.clearEditorDecorations();
        window.progressIndicatorManager.updateRunButtonState(false);
      }

      // Limpiar el estado del test
      if (jobDetails.featureName) {
        const testFileName = jobDetails.featureName.endsWith('.feature')
          ? jobDetails.featureName
          : `${jobDetails.featureName}.feature`;
        window.progressIndicatorManager.clearTestState(testFileName);
      }
    }

    const panel = document.getElementById(`log-panel-${data.slotId}`);
    if (panel) {
      const content = panel.querySelector('.panel-content');
      content.textContent += `\n--- ✅ Job ${data.jobId} finalizado con código ${data.exitCode} ---\n`;
      content.scrollTop = content.scrollHeight;
    }

    runningJobs.delete(data.slotId);

    // Refresh the history to show the new report
    if (data.reportUrl) {
      loadHistory();
    }
  });

  socket.on('log_clear', (data) => {
    if (data.slotId === undefined) return;
    const panel = document.getElementById(`log-panel-${data.slotId}`);
    if (panel) {
      const content = panel.querySelector('.panel-content');
      content.innerHTML = ''; // Clear the content
    }
  });

  socket.on('workspace_ready', (data) => {
    console.log(`Workspace para la branch ${data.branch} está listo.`);
    const selectedBranch = document.getElementById('branch-select').value;
    if (data.branch === selectedBranch) {
      console.log('Refrescando features automáticamente...');
      document.getElementById('refresh-features-btn').click();
    }
  });

  socket.on('commit_status_update', async (data) => {
    console.log(`Commit status update for branch ${data.branch}:`, data);
    const selectedBranch = document.getElementById('branch-select').value;
    if (data.branch === selectedBranch) {
      // Emitir evento para actualizar el estado del commit
      globalEvents.emit('commit:status_updated', { branch: data.branch });
    }
  });

  socket.on('workspace_changes_committed', async (data) => {
    console.log(`Workspace changes committed for branch ${data.branch}`);
    const selectedBranch = document.getElementById('branch-select').value;
    const selectedClient = document.getElementById('client-select').value;

    if (data.branch === selectedBranch) {
      // Emitir evento para actualizar el estado del commit
      globalEvents.emit('commit:completed', {
        branch: selectedBranch,
        client: selectedClient,
      });

      console.log(
        '🔍 workspace_changes_committed - Evento commit:completed emitido',
      );
    }
  });
}

export function stopAllExecution(socket) {
  if (
    confirm(
      '¿Estás seguro de que quieres parar TODA la ejecución? Esto limpiará la cola y detendrá todos los workers activos.',
    )
  ) {
    socket.emit('stop_all_execution');
    console.log('Enviada señal para detener todo.');
  }
}

export function prepareWorkspace(socket, branch) {
  if (!branch) {
    alert('Por favor, selecciona una branch para preparar el workspace.');
    return;
  }
  socket.emit('prepare_workspace', { branch });
}

export function commitChanges(socket, data) {
  if (!data.branch || !data.files || data.files.length === 0 || !data.message) {
    alert('Error: Faltan datos para realizar el commit.');
    return;
  }
  socket.emit('commit_changes', data);
}

export function pushChanges(socket, branch) {
  if (!branch) {
    alert('Error: No se especificó una branch para el push.');
    return;
  }
  socket.emit('push_changes', { branch });
}
