import { apkSource, loadHistory, getWorkspaceChanges } from './api.js';
import {
  switchTab,
  updateQueueStatus,
  renderWorkerPool,
  renderWorkerStatus,
} from './ui.js';

let runningJobs = new Map();

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

  socket.emit('run_test', jobPayload);
  switchTab('workers');
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
  ); // Get persistent workspace checkbox

  const selectedBranch = branchSelect.value;
  const selectedClient = clientSelect.value;
  const selectedApk = apkVersionSelect.value;
  const highPriority = priorityCheckbox.checked;
  const recordMappings = recordCheckbox.checked;
  const usePreexistingMapping = useLocalMappingsCheckbox.checked;
  const persistentWorkspace = persistentWorkspaceCheckbox.checked; // Get persistent workspace value

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
  }); // Pass persistentWorkspace
  switchTab('workers');
}

export function initializeSocketListeners(socket) {
  socket.on('init', (data) => {
    updateQueueStatus(data.status);
    renderWorkerPool(data.slots, socket);
    renderWorkerStatus(data.slots);
  });

  socket.on('worker_pool_update', (slots) => {
    renderWorkerPool(slots, socket);
    renderWorkerStatus(slots);
  });

  socket.on('queue_status_update', (status) => {
    updateQueueStatus(status);
  });

  socket.on('job_started', (data) => {
    runningJobs.set(data.slotId, data);
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

  socket.on('job_finished', (data) => {
    const jobDetails = runningJobs.get(data.slotId);
    if (!jobDetails) return;

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
      document.getElementById('fetch-features-btn').click();
    }
  });

  socket.on('commit_status_update', async (data) => {
    console.log(`Commit status update for branch ${data.branch}:`, data);
    const selectedBranch = document.getElementById('branch-select').value;
    if (data.branch === selectedBranch) {
      // Also check for workspace changes to determine the correct state
      const workspaceStatus = await getWorkspaceChanges(data.branch);
      
      const header = document.getElementById('main-header');
      const uncommittedIndicator = document.getElementById('uncommitted-changes-indicator');
      const pendingCommitsIndicator = document.getElementById('pending-commits-indicator');
      const uncommittedStatusText = uncommittedIndicator.querySelector('.status-text');
      const pendingStatusText = pendingCommitsIndicator.querySelector('.status-text');
      
      // Clear all header status classes first
      header.classList.remove('has-pending-commits', 'has-uncommitted-changes');
      
      // Handle uncommitted changes (yellow indicator)
      if (workspaceStatus.hasChanges) {
        header.classList.add('has-uncommitted-changes');
        uncommittedIndicator.classList.remove('hidden');
        const totalChanges = workspaceStatus.modifiedFiles;
        uncommittedStatusText.textContent = `${totalChanges} archivo(s) modificado(s) sin commit`;
      } else {
        uncommittedIndicator.classList.add('hidden');
      }
      
      // Handle pending commits (red indicator)
      if (data.hasPendingCommits) {
        header.classList.add('has-pending-commits');
        header.classList.remove('has-uncommitted-changes');
        pendingCommitsIndicator.classList.remove('hidden');
        pendingStatusText.textContent = data.message || 'Commits pendientes de push';
      } else {
        pendingCommitsIndicator.classList.add('hidden');
      }
      
      // If no indicators are showing, ensure header is clean
      if (!workspaceStatus.hasChanges && !data.hasPendingCommits) {
        header.classList.remove('has-pending-commits', 'has-uncommitted-changes');
      }
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
  switchTab('workers'); // Cambiar a la pestaña de logs para ver el progreso
}

export function commitChanges(socket, data) {
  if (!data.branch || !data.files || data.files.length === 0 || !data.message) {
    alert('Error: Faltan datos para realizar el commit.');
    return;
  }
  socket.emit('commit_changes', data);
  switchTab('workers'); // Switch to log view to see progress
}

export function pushChanges(socket, branch) {
  if (!branch) {
    alert('Error: No se especificó una branch para el push.');
    return;
  }
  socket.emit('push_changes', { branch });
  switchTab('workers'); // Switch to log view to see progress
}
