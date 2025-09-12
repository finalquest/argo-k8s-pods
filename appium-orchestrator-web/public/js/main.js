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
  updateCommitButtonState,
  displayFeatureFilter,
  filterFeatureList,
  filterFeatureListByText,
  createCommitModal,
  initIdeView,
  setIdeEditorContent,
  getIdeEditorContent,
  setSaveButtonState,
  showLoadingSpinner,
  hideLoadingSpinner,
} from './ui.js';
import { initializeWiremockTab } from './wiremock.js';
import './progress-indicator-manager.js';
import { StateManager } from './state/state-manager.js';
import { globalEvents } from './state/event-manager.js';

// Application state manager
const appState = new StateManager({
  activeFeature: null,
  currentUser: null,
  selectedBranch: '',
  selectedClient: '',
  localDevices: [],
  config: null,
  isLoading: false,
  lastError: null,
});

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});

async function checkAuthStatus() {
  const authOverlay = document.getElementById('auth-overlay');
  const userInfoDiv = document.getElementById('user-info');
  const themeToggleContainer = document.querySelector(
    '.theme-toggle-container',
  );

  appState.setState({ isLoading: true });
  globalEvents.emit('auth:checking');

  const user = await getCurrentUser();
  appState.setState({ isLoading: false });

  // Obtener configuración para verificar modo desarrollo
  const config = await fetchConfig();

  if (user) {
    appState.setState({ currentUser: user });
    globalEvents.emit('auth:success', user);

    authOverlay.style.display = 'none';

    // Ocultar elementos de auth en modo desarrollo
    if (config.auth && config.auth.developmentMode) {
      console.log('🔓 Modo desarrollo: Ocultando elementos de autenticación');
      userInfoDiv.style.display = 'none';
    } else {
      // Mostrar elementos normales en modo producción
      document.getElementById('user-name').textContent = user.name;
      document.getElementById('user-email').textContent = user.email;
      document.getElementById('user-photo').src = user.photo;
      userInfoDiv.style.display = 'block';
      themeToggleContainer.style.display = 'block';
    }

    initializeApp();
  } else {
    appState.setState({ currentUser: null });
    globalEvents.emit('auth:failed');

    authOverlay.style.display = 'flex';
    userInfoDiv.style.display = 'block';
    themeToggleContainer.style.display = 'block';
  }
}

// Función auxiliar para verificar si estamos en modo desarrollo
async function isDevelopmentMode() {
  try {
    const config = await fetchConfig();
    return config.auth && config.auth.developmentMode;
  } catch (error) {
    console.error('Error al verificar modo desarrollo:', error);
    return false;
  }
}

// Función para ocultar elementos de autenticación en modo desarrollo
async function hideAuthElementsInDevMode() {
  if (await isDevelopmentMode()) {
    const userInfoDiv = document.getElementById('user-info');
    if (userInfoDiv) userInfoDiv.style.display = 'none';

    console.log('🔓 Modo desarrollo: Elementos de autenticación ocultos');
  }
}

async function handleSave() {
  const activeFeature = appState.getState().activeFeature;
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

  appState.setState({ isLoading: true });
  globalEvents.emit('feature:saving', { branch, client, featureName });

  const result = await saveFeatureContent(
    branch,
    client,
    `${featureName}.feature`,
    content,
  );

  appState.setState({ isLoading: false });

  if (result) {
    globalEvents.emit('feature:saved', { branch, client, featureName, result });
    alert('Feature guardado con éxito!');
    setSaveButtonState(false); // Disable button after save
    // Auto-refresh git status to show the change
    const refreshBtn = document.getElementById('refresh-git-status-btn');
    if (refreshBtn) {
      refreshBtn.click();
    }
    return true; // Return true on success
  } else {
    appState.setState({ lastError: 'Failed to save feature' });
    globalEvents.emit('feature:save_failed', { branch, client, featureName });
    return false; // Return false on failure
  }
}

async function handleIdeRun(socket) {
  const activeFeature = appState.getState().activeFeature;
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
  globalEvents.emit('test:running', { branch, client, featureName });
  runTest(socket, branch, client, featureName, false);
}

function handleIdeCommit() {
  console.log('=== HANDLE IDE COMMIT DEBUG ===');
  const activeFeature = appState.getState().activeFeature;
  console.log('Active feature:', activeFeature);

  if (!activeFeature) {
    alert('No hay ningún archivo activo para commitear.');
    return;
  }

  const modal = document.getElementById('commit-modal');
  const filesList = document.getElementById('commit-files-list');
  filesList.innerHTML = '';

  // Check if there are actual changes to commit
  const branch = activeFeature.branch;
  console.log('Branch for commit check:', branch);

  getWorkspaceChanges(branch)
    .then((workspaceStatus) => {
      console.log('Workspace status from API:', workspaceStatus);
      console.log('Has changes:', workspaceStatus.hasChanges);
      console.log('Modified files count:', workspaceStatus.modifiedFiles);

      if (!workspaceStatus.hasChanges) {
        console.log('No changes detected, showing alert');
        alert('No hay archivos modificados para commitear.');
        return;
      }

      // Show the active feature file
      const { featureName, client } = activeFeature;
      const li = document.createElement('li');
      li.textContent = `test/features/${client}/feature/modulos/${featureName}.feature`;
      filesList.appendChild(li);

      // If there are other modified files, show them too
      if (workspaceStatus.modifiedFiles > 1) {
        const otherFilesLi = document.createElement('li');
        otherFilesLi.textContent = `y ${workspaceStatus.modifiedFiles - 1} otro(s) archivo(s) modificado(s)`;
        otherFilesLi.style.fontStyle = 'italic';
        filesList.appendChild(otherFilesLi);
      }

      console.log('Showing commit modal');
      modal.style.display = 'block';
    })
    .catch((error) => {
      console.error('Error checking workspace changes:', error);
      alert('Error al verificar cambios en el workspace.');
    });
}

function initializeApp() {
  const socket = io();
  initializeSocketListeners(socket);
  initializeUiEventListeners(socket);
  initializeAppControls(socket);
  initializeWiremockTab();
  initializeEventListeners(); // Initialize event-based listeners
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

  // Asegurar que elementos de auth estén ocultos en modo desarrollo
  hideAuthElementsInDevMode();

  // Listen for features loaded event to update commit status
  window.addEventListener('featuresLoaded', async (event) => {
    const { branch } = event.detail;
    const config = await fetchConfig();
    if (config.persistentWorkspacesEnabled) {
      await updateCommitStatusIndicator(branch);
    }
  });

  // Listen for commit completed event to update UI after successful commit
  globalEvents.on('commit:completed', async (data) => {
    console.log('🔍 commit:completed event received:', data);
    const { branch, client } = data;

    try {
      // Update the commit status indicator
      await updateCommitStatusIndicator(branch);

      // Refresh git status to update the modified files display
      const status = await getWorkspaceStatus(branch);
      updateFeaturesWithGitStatus(status.modified_features, client);

      // Update commit button state
      updateCommitButtonState();

      console.log(
        '🔍 commit:completed - UI actualizada, modified features:',
        status.modified_features,
      );
    } catch (error) {
      console.error('Error updating UI after commit:', error);
    }
  });

  // Listen for commit status update events
  globalEvents.on('commit:status_updated', async (data) => {
    console.log('🔍 commit:status_updated event received:', data);
    const { branch } = data;

    try {
      await updateCommitStatusIndicator(branch);
    } catch (error) {
      console.error('Error updating commit status indicator:', error);
    }
  });
}

async function initializeAppControls(socket) {
  appState.setState({ isLoading: true });
  const config = await fetchConfig();
  appState.setState({ isLoading: false });
  appState.setState({ config });

  displayPrepareWorkspaceButton(config.persistentWorkspacesEnabled);
  displayGitControls(config.persistentWorkspacesEnabled);
  displayFeatureFilter(config.persistentWorkspacesEnabled);
  createCommitModal();

  // --- Event Listeners for new controls ---
  const prepareWorkspaceBtn = document.getElementById('prepare-workspace-btn');
  if (prepareWorkspaceBtn) {
    prepareWorkspaceBtn.addEventListener('click', () => {
      const selectedBranch = document.getElementById('branch-select').value;

      // Switch to workers tab to see the logs
      switchTab('workers-tab');

      // Start workspace preparation
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
      const selectedBranch = document.getElementById('branch-select').value;
      const selectedClient = document.getElementById('client-select').value;
      if (!selectedBranch) {
        alert('Por favor, selecciona una branch.');
        return;
      }

      console.log('=== HEADER COMMIT DEBUG ===');
      console.log('Selected branch:', selectedBranch);
      console.log('Selected client:', selectedClient);

      getWorkspaceChanges(selectedBranch)
        .then((workspaceStatus) => {
          console.log('Workspace status:', workspaceStatus);

          if (!workspaceStatus.hasChanges) {
            console.log('No changes detected');
            alert('No hay archivos modificados para commitear.');
            return;
          }

          // For header commit, we need to get the actual modified files
          // Since we can't get the exact list from the current API,
          // we'll commit all .feature files for the selected client
          const modal = document.getElementById('commit-modal');
          const filesList = document.getElementById('commit-files-list');
          filesList.innerHTML = '';

          // Store commit info for later use in confirm
          modal.commitData = {
            branch: selectedBranch,
            client: selectedClient,
            commitAllChanges: true, // Flag to indicate this is a header commit
            modifiedFilesCount: workspaceStatus.modifiedFiles,
          };

          const li = document.createElement('li');
          li.textContent = `Todos los cambios (${workspaceStatus.modifiedFiles} archivos)`;
          filesList.appendChild(li);

          modal.style.display = 'block';
        })
        .catch((error) => {
          console.error('Error checking workspace changes:', error);
          alert('Error al verificar cambios en el workspace.');
        });
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
      const activeFeature = appState.getState().activeFeature;

      console.log('=== CONFIRM COMMIT DEBUG ===');
      console.log('Branch:', branch);
      console.log('Client:', client);
      console.log('Active feature:', activeFeature);

      let files;

      // Check if this is a header commit (stored data in modal)
      if (commitModal.commitData && commitModal.commitData.commitAllChanges) {
        // For header commit, use the stored client data
        console.log(
          'Header commit detected, using stored data:',
          commitModal.commitData,
        );
        files = [
          `test/features/${commitModal.commitData.client}/feature/modulos/`,
        ]; // Commit all features for this client
      } else if (activeFeature) {
        // Regular IDE commit - commit only the active feature
        files = [
          `test/features/${client}/feature/modulos/${activeFeature.featureName}.feature`,
        ];
      } else {
        console.log('No active feature and no header commit data');
        alert('Error: No se determinaron los archivos para commitear.');
        return;
      }

      console.log('Files to commit:', files);
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

      // Update state with selected branch
      appState.setState({
        selectedBranch,
        selectedClient,
        activeFeature: null,
      });
      window.currentFeatureFile = null;

      globalEvents.emit('branch:changed', { selectedBranch, selectedClient });

      // Búsqueda automática de features al cambiar branch
      if (selectedClient) {
        await fetchFeatures();
      }

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

        // Ocultar el título del editor
        const editorTitle = document.getElementById('editor-title');
        if (editorTitle) {
          editorTitle.style.display = 'none';
        }
      }

      // Clear feature list and update git status for the new branch (solo si no se está buscando automáticamente)
      const featuresList = document.getElementById('features-list');
      if (featuresList && !selectedClient) {
        featuresList.innerHTML = '<li>Cargando...</li>';
      }

      // Update commit status indicator for the new branch
      const config = appState.getState().config;
      if (selectedBranch && config && config.persistentWorkspacesEnabled) {
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
    const config = appState.getState().config;
    if (initialBranch && config && config.persistentWorkspacesEnabled) {
      await updateCommitStatusIndicator(initialBranch);
    }
  }, 500);
}

async function loadLocalDevices() {
  appState.setState({ isLoading: true });
  const devices = await getLocalDevices();
  appState.setState({ isLoading: false });
  appState.setState({ localDevices: devices || [] });

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

function updateCommitStatusIndicator(branch) {
  // Validate branch parameter
  if (!branch || branch === 'Cargando...' || branch.trim() === '') {
    return;
  }

  // Check if persistent workspaces are enabled by fetching config
  fetchConfig().then((config) => {
    if (!config.persistentWorkspacesEnabled) return;

    appState.setState({ config });

    Promise.all([getCommitStatus(branch), getWorkspaceChanges(branch)])
      .then(([commitStatus, workspaceStatus]) => {
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
        header.classList.remove(
          'has-pending-commits',
          'has-uncommitted-changes',
        );

        // Handle uncommitted changes (yellow indicator)
        if (workspaceStatus.hasChanges) {
          // Add yellow styling to header
          header.classList.add('has-uncommitted-changes');

          // Show yellow indicator with change count (only tracked files)
          uncommittedIndicator.classList.remove('hidden');
          const totalChanges =
            workspaceStatus.modifiedFiles + workspaceStatus.stagedFiles;
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
          header.classList.remove(
            'has-pending-commits',
            'has-uncommitted-changes',
          );
        }
      })
      .catch((error) => {
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
          header.classList.remove(
            'has-pending-commits',
            'has-uncommitted-changes',
          );
        }
        if (uncommittedIndicator) uncommittedIndicator.classList.add('hidden');
        if (pendingCommitsIndicator)
          pendingCommitsIndicator.classList.add('hidden');
      });
  });
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
    appState.setState({ lastError: 'Failed to refresh local devices' });
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalContent;
  }
}

function initializeUiEventListeners(socket) {
  const runSelectedBtn = document.getElementById('run-selected-btn');
  const stopAllBtn = document.getElementById('stop-all-btn');
  const selectAllCheckbox = document.getElementById('select-all-features');
  const historyBranchFilter = document.getElementById('history-branch-filter');
  const featuresList = document.getElementById('features-list');
  const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
  const refreshApkVersionsBtn = document.getElementById(
    'refresh-apk-versions-btn',
  );
  const refreshFeaturesBtn = document.getElementById('refresh-features-btn');

  if (refreshFeaturesBtn) {
    refreshFeaturesBtn.addEventListener('click', () => fetchFeatures());
  }
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
    appState.setState({ activeFeature: null });
    window.currentFeatureFile = null;

    globalEvents.emit('feature:opening', { branch, client, featureName });

    // Mostrar spinner mientras carga el contenido
    showLoadingSpinner('Cargando feature desde repositorio...');

    try {
      const contentData = await getFeatureContent(
        branch,
        client,
        featureName + '.feature',
      );

      if (contentData !== null) {
        const newActiveFeature = { branch, client, featureName };
        appState.setState({ activeFeature: newActiveFeature });
        console.log(
          '🔍 openFeatureFromTree - contentData.isLocal:',
          contentData.isLocal,
          'contentData:',
          contentData,
        );
        setIdeEditorContent({
          content: contentData.content,
          isReadOnly: !contentData.isLocal,
          isModified: false,
        });
        window.currentFeatureFile = `${featureName}.feature`;

        globalEvents.emit('feature:opened', {
          branch,
          client,
          featureName,
          content: contentData.content,
          isLocal: contentData.isLocal,
          workspaceExists: contentData.workspaceExists,
        });

        if (window.progressIndicatorManager) {
          window.progressIndicatorManager.updateEditorStateForCurrentFile();
        }
        return true;
      } else {
        globalEvents.emit('feature:open_failed', {
          branch,
          client,
          featureName,
        });
        return false;
      }
    } catch (error) {
      console.error('Error al cargar feature:', error);
      globalEvents.emit('feature:open_failed', {
        branch,
        client,
        featureName,
        error,
      });
      return false;
    } finally {
      // Ocultar spinner siempre, sin importar el resultado
      hideLoadingSpinner();
    }
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

function initializeEventListeners() {
  // Listen for auth events
  globalEvents.on('auth:success', (user) => {
    console.log('User authenticated:', user.name);
    // Could update UI elements that depend on auth state
  });

  globalEvents.on('auth:failed', () => {
    console.log('Authentication failed');
    // Could update UI elements that depend on auth state
  });

  // Listen for feature events
  globalEvents.on('feature:opened', (data) => {
    console.log('Feature opened:', data.featureName);
    // Could update UI elements that depend on active feature
  });

  globalEvents.on('feature:saved', (data) => {
    console.log('Feature saved:', data.featureName);
    // Could update UI elements that depend on saved state
  });

  globalEvents.on('feature:save_failed', (data) => {
    console.error('Feature save failed:', data.featureName);
    // Could show error indicators
  });

  // Listen for test events
  globalEvents.on('test:running', (data) => {
    console.log('Test running:', data.featureName);
    // Could update UI elements that depend on test state
  });

  // Listen for branch change events
  globalEvents.on('branch:changed', (data) => {
    console.log('Branch changed:', data.selectedBranch);
    // Could update UI elements that depend on branch
  });

  // Listen for state changes
  appState.subscribe('isLoading', (isLoading) => {
    console.log('Loading state changed:', isLoading);
    // Could update loading indicators
  });

  appState.subscribe('lastError', (error) => {
    if (error) {
      console.error('Application error:', error);
      // Could show error notifications
    }
  });
}

// Toolbar collapse functionality for mobile
function initializeToolbarCollapse() {
  const toolbar = document.getElementById('ide-toolbar');
  const collapseBtn = document.getElementById('toolbar-collapse-btn');

  if (!toolbar || !collapseBtn) return;

  // Show collapse button only on mobile
  function checkMobile() {
    if (window.innerWidth <= 768) {
      collapseBtn.style.display = 'block';
    } else {
      collapseBtn.style.display = 'none';
      toolbar.classList.remove('collapsed');
    }
  }

  // Check on load and resize
  checkMobile();
  window.addEventListener('resize', checkMobile);

  // Toggle collapse on button click
  collapseBtn.addEventListener('click', () => {
    toolbar.classList.toggle('collapsed');
    collapseBtn.textContent = toolbar.classList.contains('collapsed')
      ? '▼'
      : '☰';
  });
}

// Initialize toolbar collapse when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeToolbarCollapse();
});
