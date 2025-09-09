import {
  getFeatureContent,
  saveFeatureContent,
  getWorkspaceStatus,
  getCommitStatus,
  getWorkspaceChanges,
  fetchConfig,
  getCurrentUser,
  getLocalDevices,
  loadBranches,
  fetchFeatures,
  loadHistoryBranches,
  loadHistory,
  fetchApkVersions,
} from './api.js';
import {
  initializeSocketListeners,
  runTest,
  runSelectedTests,
  stopAllExecution,
  prepareWorkspace,
  commitChanges,
  pushChanges,
} from './socket.js';
import {
  switchTab,
  updateSelectedCount,
  toggleSelectAll,
  displayPrepareWorkspaceButton,
  displayGitControls,
  updateFeaturesWithGitStatus,
  displayFeatureFilter,
  filterFeatureList,
  filterFeatureListByText,
  createCommitModal,
  initIdeView,
  setIdeEditorContent,
  getIdeEditorContent,
  setSaveButtonState,
} from './ui.js';
import { initializeWiremockTab } from './wiremock.js';
import './progress-indicator-manager.js';

let activeFeature = null; // Holds info about the currently open feature in the IDE

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});

async function checkAuthStatus() {
  const authOverlay = document.getElementById('auth-overlay');
  const userInfoDiv = document.getElementById('user-info');

  const user = await getCurrentUser();

  if (user) {
    authOverlay.style.display = 'none';
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-photo').src = user.photo;
    userInfoDiv.style.display = 'block';
    initializeApp();
  } else {
    authOverlay.style.display = 'flex';
    userInfoDiv.style.display = 'none';
  }
}

async function handleSave() {
  if (!activeFeature) {
    alert('No hay ningún archivo activo para guardar.');
    return false; // Return false on failure
  }

  const saveBtn = document.getElementById('ide-save-btn');
  // If save button is disabled, there are no changes to save
  if (saveBtn && saveBtn.disabled) {
    return true; // Return true to indicate no save needed
  }

  const content = getIdeEditorContent();
  const { branch, client, featureName } = activeFeature;

  const result = await saveFeatureContent(
    branch,
    client,
    `${featureName}.feature`,
    content,
  );

  if (result) {
    alert('Feature guardado con éxito!');
    setSaveButtonState(false); // Disable button after save
    // Auto-refresh git status to show the change
    const refreshBtn = document.getElementById('refresh-git-status-btn');
    if (refreshBtn) {
      refreshBtn.click();
    }
    return true; // Return true on success
  }
  return false; // Return false on failure
}

async function handleIdeRun(socket) {
  if (!activeFeature) {
    alert('No hay ningún archivo activo para ejecutar.');
    return;
  }

  // Only save if there are actual changes
  const saveBtn = document.getElementById('ide-save-btn');
  if (saveBtn && !saveBtn.disabled) {
    // There are unsaved changes, save them first
    const saveSuccess = await handleSave();
    if (!saveSuccess) {
      return; // Don't run if save failed
    }
  }

  // Run the test
  const { branch, client, featureName } = activeFeature;
  runTest(socket, branch, client, featureName, false);
}

function handleIdeCommit() {
  if (!activeFeature) {
    alert('No hay ningún archivo activo para commitear.');
    return;
  }

  const modal = document.getElementById('commit-modal');
  const filesList = document.getElementById('commit-files-list');
  filesList.innerHTML = '';

  const { featureName } = activeFeature;
  const li = document.createElement('li');
  li.textContent = featureName;
  filesList.appendChild(li);

  modal.style.display = 'block';
}

function initializeApp() {
  const socket = io();
  initializeSocketListeners(socket);
  initializeUiEventListeners(socket);
  initializeAppControls(socket);
  initializeWiremockTab();
  initIdeView({
    onSave: handleSave,
    onCommit: handleIdeCommit,
    onRun: () => handleIdeRun(socket), // Pass socket to the handler
  });

  loadBranches();
  loadHistoryBranches();
  loadHistory();
  loadLocalDevices();

  // Auto-fetch APK versions on page load
  fetchApkVersions();

  // Listen for features loaded event to update commit status
  window.addEventListener('featuresLoaded', async (event) => {
    const { branch } = event.detail;
    const config = await fetchConfig();
    if (config.persistentWorkspacesEnabled) {
      await updateCommitStatusIndicator(branch);
    }
  });
}

async function initializeAppControls(socket) {
  const config = await fetchConfig();
  displayPrepareWorkspaceButton(config.persistentWorkspacesEnabled);
  displayGitControls(config.persistentWorkspacesEnabled);
  displayFeatureFilter(config.persistentWorkspacesEnabled);
  createCommitModal();

  // --- Event Listeners for new controls ---
  const prepareWorkspaceBtn = document.getElementById('prepare-workspace-btn');
  if (prepareWorkspaceBtn) {
    prepareWorkspaceBtn.addEventListener('click', () => {
      const selectedBranch = document.getElementById('branch-select').value;
      prepareWorkspace(socket, selectedBranch);
    });
  }

  const refreshGitStatusBtn = document.getElementById('refresh-git-status-btn');
  if (refreshGitStatusBtn) {
    refreshGitStatusBtn.addEventListener('click', async () => {
      const selectedBranch = document.getElementById('branch-select').value;
      const selectedClient = document.getElementById('client-select').value;
      if (!selectedBranch) {
        alert('Por favor, selecciona una branch.');
        return;
      }
      const status = await getWorkspaceStatus(selectedBranch);
      updateFeaturesWithGitStatus(status.modified_features, selectedClient);
      // Also update commit status indicator
      await updateCommitStatusIndicator(selectedBranch);
    });
  }

  // --- Header commit button listener ---
  const headerCommitBtn = document.getElementById('header-commit-btn');
  if (headerCommitBtn) {
    headerCommitBtn.addEventListener('click', () => {
      if (!activeFeature) {
        alert('No hay ningún archivo activo para commitear.');
        return;
      }
      handleIdeCommit();
    });
  }

  // --- Header push button listener ---
  const headerPushBtn = document.getElementById('header-push-btn');
  if (headerPushBtn) {
    headerPushBtn.addEventListener('click', () => {
      const selectedBranch = document.getElementById('branch-select').value;
      if (!selectedBranch) {
        alert('Por favor, selecciona una branch.');
        return;
      }
      pushChanges(socket, selectedBranch);
    });
  }

  const featureFilterSelect = document.getElementById('feature-filter-select');
  if (featureFilterSelect) {
    featureFilterSelect.addEventListener('change', filterFeatureList);
  }

  const featuresFilterInput = document.getElementById('features-filter');
  if (featuresFilterInput) {
    featuresFilterInput.addEventListener('input', filterFeatureListByText);
  }

  // --- Modal Listeners ---
  const commitModal = document.getElementById('commit-modal');
  const closeCommitModalBtn = document.getElementById('close-commit-modal');
  const confirmCommitBtn = document.getElementById('confirm-commit-btn');

  if (commitModal && closeCommitModalBtn && confirmCommitBtn) {
    closeCommitModalBtn.onclick = () => (commitModal.style.display = 'none');
    confirmCommitBtn.addEventListener('click', () => {
      const message = document.getElementById('commit-message').value;
      if (!message.trim()) {
        alert('El mensaje de commit no puede estar vacío.');
        return;
      }

      const branch = document.getElementById('branch-select').value;
      const client = document.getElementById('client-select').value;
      if (!activeFeature) {
        alert('Error: No hay un feature activo para hacer commit.');
        return;
      }
      const files = [
        `test/features/${client}/feature/modulos/${activeFeature.featureName}.feature`,
      ];

      commitChanges(socket, { branch, files, message });
      commitModal.style.display = 'none';
      document.getElementById('commit-message').value = '';
    });
  }

  // Close modals on outside click
  window.onclick = (event) => {
    if (event.target == commitModal) {
      commitModal.style.display = 'none';
    }
  };

  // --- Branch change listener ---
  const branchSelect = document.getElementById('branch-select');
  if (branchSelect) {
    branchSelect.addEventListener('change', async () => {
      const selectedBranch = branchSelect.value;
      const selectedClient = document.getElementById('client-select').value;

      // Reset active feature when branch changes
      activeFeature = null;
      window.currentFeatureFile = null;

      // Actualizar el estado del editor
      if (window.progressIndicatorManager) {
        window.progressIndicatorManager.updateEditorStateForCurrentFile();
      }

      // Clear IDE editor
      const editorPanel = document.getElementById('editor-panel');
      if (editorPanel) {
        const saveBtn = editorPanel.querySelector('#ide-save-btn');
        const commitBtn = editorPanel.querySelector('#ide-commit-btn');
        const runBtn = editorPanel.querySelector('#ide-run-btn');

        if (saveBtn) saveBtn.style.display = 'none';
        if (commitBtn) commitBtn.style.display = 'none';
        if (runBtn) runBtn.style.display = 'none';

        // Clear editor content
        const ideEditorContent = getIdeEditorContent();
        if (ideEditorContent !== null) {
          setIdeEditorContent({
            content:
              '// Selecciona una branch y luego un archivo para ver su contenido.',
            isReadOnly: true,
            isModified: false,
          });
          // Marcar como limpio después de establecer el texto por defecto
          setTimeout(() => {
            if (window.ideCodeMirror) {
              window.ideCodeMirror.markClean();
            }
          }, 100);
        }
      }

      // Clear feature list and update git status for the new branch
      const featuresList = document.getElementById('features-list');
      if (featuresList) {
        featuresList.innerHTML = '<li>Cargando...</li>';
      }

      // Update commit status indicator for the new branch
      if (selectedBranch && config.persistentWorkspacesEnabled) {
        await updateCommitStatusIndicator(selectedBranch);

        // Also update git status for features if both branch and client are selected
        if (selectedClient) {
          const status = await getWorkspaceStatus(selectedBranch);
          updateFeaturesWithGitStatus(status.modified_features, selectedClient);
        }
      } else {
        // Hide indicator if persistent workspaces are not enabled
        const header = document.getElementById('main-header');
        const indicator = document.getElementById('commit-status-indicator');

        if (header) header.classList.remove('has-pending-commits');
        if (indicator) indicator.classList.add('hidden');
      }
    });
  }

  // Initial commit status check after a short delay to ensure DOM is ready
  setTimeout(async () => {
    const initialBranch = document.getElementById('branch-select').value;
    if (initialBranch && config.persistentWorkspacesEnabled) {
      await updateCommitStatusIndicator(initialBranch);
    }
  }, 500);
}

async function loadLocalDevices() {
  const devices = await getLocalDevices();
  const container = document.getElementById('device-selector-container');
  const select = document.getElementById('device-select');

  if (devices && devices.length > 0) {
    container.style.display = 'flex';
    select.innerHTML = '';
    devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device;
      option.textContent = device;
      select.appendChild(option);
    });
  } else {
    container.style.display = 'none';
  }
}

async function updateCommitStatusIndicator(branch) {
  // Check if persistent workspaces are enabled by fetching config
  const config = await fetchConfig();
  if (!config.persistentWorkspacesEnabled) return;

  try {
    const [commitStatus, workspaceStatus] = await Promise.all([
      getCommitStatus(branch),
      getWorkspaceChanges(branch),
    ]);

    const header = document.getElementById('main-header');
    const uncommittedIndicator = document.getElementById(
      'uncommitted-changes-indicator',
    );
    const pendingCommitsIndicator = document.getElementById(
      'pending-commits-indicator',
    );
    const uncommittedStatusText =
      uncommittedIndicator.querySelector('.status-text');
    const pendingStatusText =
      pendingCommitsIndicator.querySelector('.status-text');

    // Clear all header status classes first
    header.classList.remove('has-pending-commits', 'has-uncommitted-changes');

    // Handle uncommitted changes (yellow indicator)
    if (workspaceStatus.hasChanges) {
      // Add yellow styling to header
      header.classList.add('has-uncommitted-changes');

      // Show yellow indicator with change count
      uncommittedIndicator.classList.remove('hidden');
      const totalChanges = workspaceStatus.modifiedFiles;
      uncommittedStatusText.textContent = `${totalChanges} archivo(s) modificado(s) sin commit`;
    } else {
      // Hide yellow indicator
      uncommittedIndicator.classList.add('hidden');
    }

    // Handle pending commits (red indicator)
    if (commitStatus.hasPendingCommits) {
      // Add red styling to header (red takes precedence for header color)
      header.classList.add('has-pending-commits');
      header.classList.remove('has-uncommitted-changes');

      // Show red indicator with count
      pendingCommitsIndicator.classList.remove('hidden');
      pendingStatusText.textContent = `${commitStatus.commitCount} commit(s) pendiente(s) de push`;
    } else {
      // Hide red indicator
      pendingCommitsIndicator.classList.add('hidden');
    }

    // If no indicators are showing, ensure header is clean
    if (!workspaceStatus.hasChanges && !commitStatus.hasPendingCommits) {
      header.classList.remove('has-pending-commits', 'has-uncommitted-changes');
    }
  } catch (error) {
    console.error('Error updating commit status indicator:', error);
    // Hide both indicators on error to avoid showing incorrect state
    const header = document.getElementById('main-header');
    const uncommittedIndicator = document.getElementById(
      'uncommitted-changes-indicator',
    );
    const pendingCommitsIndicator = document.getElementById(
      'pending-commits-indicator',
    );

    if (header) {
      header.classList.remove('has-pending-commits', 'has-uncommitted-changes');
    }
    if (uncommittedIndicator) uncommittedIndicator.classList.add('hidden');
    if (pendingCommitsIndicator)
      pendingCommitsIndicator.classList.add('hidden');
  }
}

async function refreshLocalDevices() {
  const refreshBtn = document.getElementById('refresh-devices-btn');
  const originalContent = refreshBtn.innerHTML;

  refreshBtn.disabled = true;
  refreshBtn.innerHTML =
    '<span class="spinner" style="width: 0.9em; height: 0.9em; border-width: 2px; vertical-align: middle;"></span>';

  try {
    await loadLocalDevices();
  } catch (error) {
    console.error('Failed to refresh local devices:', error);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalContent;
  }
}

function initializeUiEventListeners(socket) {
  const fetchBtn = document.getElementById('fetch-features-btn');
  const runSelectedBtn = document.getElementById('run-selected-btn');
  const stopAllBtn = document.getElementById('stop-all-btn');
  const selectAllCheckbox = document.getElementById('select-all-features');
  const historyBranchFilter = document.getElementById('history-branch-filter');
  const featuresList = document.getElementById('features-list');
  const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
  const refreshApkVersionsBtn = document.getElementById(
    'refresh-apk-versions-btn',
  );

  fetchBtn.addEventListener('click', () => fetchFeatures());
  runSelectedBtn.addEventListener('click', () => runSelectedTests(socket));
  stopAllBtn.addEventListener('click', () => stopAllExecution(socket));
  selectAllCheckbox.addEventListener('change', toggleSelectAll);
  historyBranchFilter.addEventListener('change', () =>
    loadHistory(historyBranchFilter.value),
  );
  refreshDevicesBtn.addEventListener('click', refreshLocalDevices);
  refreshApkVersionsBtn.addEventListener('click', fetchApkVersions);

  featuresList.addEventListener('change', (e) => {
    if (e.target.classList.contains('feature-checkbox')) {
      updateSelectedCount();
    }
  });

  // Función para abrir un feature desde el tree view
  async function openFeatureFromTree(featureName) {
    const branch = document.getElementById('branch-select').value;
    const client = document.getElementById('client-select').value;

    // Si hay cambios no guardados, marcar el editor como limpio para evitar el popup
    if (window.ideCodeMirror && !window.ideCodeMirror.isClean()) {
      window.ideCodeMirror.markClean();
    }

    setIdeEditorContent('// Cargando...', true);
    activeFeature = null;
    window.currentFeatureFile = null;

    const content = await getFeatureContent(
      branch,
      client,
      featureName + '.feature',
    );

    if (content !== null) {
      setIdeEditorContent({ content, isReadOnly: false, isModified: false });
      activeFeature = { branch, client, featureName };
      window.currentFeatureFile = `${featureName}.feature`;

      if (window.progressIndicatorManager) {
        window.progressIndicatorManager.updateEditorStateForCurrentFile();
      }
      return true;
    }
    return false;
  }

  // Función para verificar si hay cambios no guardados
  function hasUnsavedChanges() {
    if (!window.ideCodeMirror) return false;
    return window.ideCodeMirror.isClean() === false;
  }

  // Función para ejecutar test con verificación de cambios no guardados
  async function executeTestWithSaveCheck(featureName, highPriority) {
    if (hasUnsavedChanges()) {
      const shouldSave = confirm(
        'Hay cambios no guardados. ¿Guardar antes de ejecutar?',
      );
      if (shouldSave) {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const branch = document.getElementById('branch-select').value;
    const client = document.getElementById('client-select').value;
    runTest(socket, branch, client, featureName, highPriority);
  }

  featuresList.addEventListener('click', async (e) => {
    const target = e.target;

    // Handle folder expansion/collapse
    const folderItem = target.closest('.folder > .feature-item');
    if (folderItem) {
      // Prevent toggling when a button inside is clicked
      if (e.target.closest('button, input')) return;
      folderItem.parentElement.classList.toggle('expanded');
      return;
    }

    // Handle tree view buttons (Run and Priority) - MOVED BEFORE FILE HANDLER
    if (
      target.classList.contains('run-btn') ||
      target.classList.contains('priority-btn')
    ) {
      const featureName = target.dataset.feature;
      if (!featureName) return; // If no feature is associated, do nothing

      const highPriority = target.classList.contains('priority-btn');

      // Abrir el archivo en el editor primero
      await openFeatureFromTree(featureName);

      // Luego ejecutar el test (con manejo de cambios no guardados)
      await executeTestWithSaveCheck(featureName, highPriority);
      return;
    }

    // Handle file click to open in editor
    const fileItem = target.closest('.file > .feature-item');
    if (fileItem) {
      // Don't trigger if a button or checkbox inside the item was clicked
      if (e.target.closest('button, input[type="checkbox"]')) {
        return;
      }

      const featureName = fileItem.parentElement.dataset.featureName;
      await openFeatureFromTree(featureName);
      return;
    }
  });

  document.getElementById('queue-view').addEventListener('click', (e) => {
    if (e.target.classList.contains('cancel-job-btn')) {
      const jobId = parseInt(e.target.dataset.jobId, 10);
      if (confirm(`¿Seguro que quieres cancelar el job ${jobId} de la cola?`)) {
        socket.emit('cancel_job', { jobId });
      }
    }
  });

  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const newTab = button.dataset.tab;
      switchTab(newTab);
      if (newTab === 'results') {
        loadHistoryBranches();
        loadHistory();
      }
    });
  });
}
