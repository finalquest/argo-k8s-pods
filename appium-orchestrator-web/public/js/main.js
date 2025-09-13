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
  createNewTestModal,
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

// Current folder path for new test creation
let currentFolderPath = null;

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

async function createNewTestFile(featureName) {
  const folderPath = currentFolderPath;

  if (!folderPath) {
    alert('No hay una carpeta seleccionada para crear el test.');
    return false;
  }

  // Extract branch and client from folder path (format: branch/client/path/to/folder)
  const pathParts = folderPath.split('/');
  const branch = pathParts[0];

  // Extract the relative path from the folder path (remove branch/client/feature/modulos/)
  const relativePath = pathParts.slice(4).join('/'); // Skip branch, client, feature, modulos

  // Construct the full feature path with .feature extension
  const featurePath = relativePath
    ? `${relativePath}/${featureName}.feature`
    : `${featureName}.feature`;

  const fileName = `${featureName}.feature`;

  // Extract client for API call
  const client = pathParts[1];

  // Basic test template
  const testTemplate = `Feature: ${featureName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}

  Como usuario
  Quiero realizar una acción
  Para obtener un resultado

  Scenario: Escenario básico
    Dado que estoy en la aplicación
    Cuando realizo una acción
    Entonces veo el resultado esperado
`;

  appState.setState({ isLoading: true });
  globalEvents.emit('test:creating', { branch, client, featureName });

  try {
    console.log('🔧 Creating test file with params:', {
      branch,
      client,
      featurePath,
      contentLength: testTemplate.length,
    });

    // Use the existing saveFeatureContent API to create the file
    const result = await saveFeatureContent(
      branch,
      client,
      featurePath,
      testTemplate,
    );

    console.log('✅ Test file created successfully:', result);

    appState.setState({ isLoading: false });
    globalEvents.emit('test:created', { branch, client, featureName });

    alert(`Test "${fileName}" creado exitosamente en la ubicación actual.`);

    // Refresh git status to show the new file as untracked
    setTimeout(async () => {
      try {
        const status = await getWorkspaceStatus(branch);
        updateFeaturesWithGitStatus(
          status.modified_features,
          status.untracked_features ||
            status.untracked_files ||
            status.new_files ||
            status.untracked ||
            [],
        );
      } catch (error) {
        console.error(
          'Error refreshing git status after creating file:',
          error,
        );
      }
    }, 500);

    // Also refresh the features list
    const refreshBtn = document.getElementById('refresh-features-btn');
    if (refreshBtn) {
      refreshBtn.click();
    }

    return true;
  } catch (error) {
    console.error('❌ Error creating test file:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      branch,
      client,
      featurePath,
    });

    appState.setState({ isLoading: false });

    // Handle specific error cases
    if (error.message && error.message.includes('workspace')) {
      alert(
        'No existe un workspace local para esta branch. Por favor, prepara el workspace primero.',
      );
    } else {
      alert(`Error al crear el test: ${error.message || 'Error desconocido'}`);
    }

    return false;
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

function sanitizeFolderName(text) {
  // Remove emojis and special characters, keep only letters, numbers, underscores, hyphens and spaces
  return text
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function getFolderPathFromElement(folderElement) {
  const branchSelect = document.getElementById('branch-select');
  const clientSelect = document.getElementById('client-select');

  if (!branchSelect || !clientSelect) return null;

  const branch = branchSelect.value;
  const client = clientSelect.value;

  if (
    !branch ||
    !client ||
    branch === 'Cargando...' ||
    client === 'Cargando...'
  )
    return null;

  // Get the folder name from the element and sanitize it
  const folderNameElement = folderElement.querySelector('.feature-item');
  const rawFolderName = folderNameElement
    ? folderNameElement.textContent.trim()
    : '';
  const folderName = sanitizeFolderName(rawFolderName);

  if (!folderName) return null;

  // Build the path by traversing up the tree to get parent folders
  let pathParts = [];
  let currentElement = folderElement;

  // Traverse up to collect all parent folder names
  while (currentElement && currentElement.classList.contains('folder')) {
    const itemElement = currentElement.querySelector('.feature-item');
    if (itemElement) {
      const rawName = itemElement.textContent.trim();
      const sanitizedName = sanitizeFolderName(rawName);
      if (sanitizedName) {
        pathParts.unshift(sanitizedName); // Add to beginning to build path from root
      }
    }

    // Go to parent folder
    const parentFolder = currentElement.parentElement.closest('.folder');
    currentElement = parentFolder;
  }

  // If we couldn't build a proper path, just use the folder name
  if (pathParts.length === 0) {
    return `${branch}/${client}/feature/modulos/${folderName}`;
  }

  // Construct full path
  const relativePath = pathParts.join('/');
  return `${branch}/${client}/feature/modulos/${relativePath}`;
}

function updateNewTestButtonVisibility(folderPath = null) {
  const newTestBtn = document.getElementById('new-test-btn');

  // Save current folder path globally
  currentFolderPath = folderPath;

  if (newTestBtn) {
    // Show button if we have a folder path (from expanded folder)
    const shouldShow = folderPath;
    newTestBtn.style.display = shouldShow ? 'inline-block' : 'none';

    // Update button title
    if (shouldShow) {
      newTestBtn.title = `Crear nuevo test en: ${folderPath}`;
    }
  }
}

function handleIdeNewTest() {
  // Get current folder path from global variable
  if (!currentFolderPath) {
    alert('Debes desplegar una carpeta en el árbol para crear un nuevo test.');
    return;
  }

  // Create modal if it doesn't exist
  let modal = document.getElementById('new-test-modal');
  if (!modal) {
    createNewTestModal();
    modal = document.getElementById('new-test-modal');
  }

  // Set the current location path
  const modalLocationPath = document.getElementById('test-location-path');
  if (modalLocationPath) {
    modalLocationPath.textContent = currentFolderPath;
  }

  // Clear previous input
  const testNameInput = document.getElementById('test-name');
  if (testNameInput) {
    testNameInput.value = '';
  }

  // Show modal
  modal.style.display = 'block';
}

function handleIdeCommit() {
  const activeFeature = appState.getState().activeFeature;

  if (!activeFeature) {
    alert('No hay ningún archivo activo para commitear.');
    return;
  }

  const modal = document.getElementById('commit-modal');
  const filesList = document.getElementById('commit-files-list');
  filesList.innerHTML = '';

  // Check if there are actual changes to commit
  const branch = activeFeature.branch;

  getWorkspaceChanges(branch)
    .then((workspaceStatus) => {
      if (!workspaceStatus.hasChanges) {
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
    const { branch } = data;

    try {
      // Update the commit status indicator
      await updateCommitStatusIndicator(branch);

      // Refresh git status to update the modified files display
      const status = await getWorkspaceStatus(branch);
      updateFeaturesWithGitStatus(
        status.modified_features,
        status.untracked_features ||
          status.untracked_files ||
          status.new_files ||
          status.untracked ||
          [],
      );

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
  createNewTestModal();

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
      if (!selectedBranch) {
        alert('Por favor, selecciona una branch.');
        return;
      }
      const status = await getWorkspaceStatus(selectedBranch);
      updateFeaturesWithGitStatus(
        status.modified_features,
        status.untracked_features ||
          status.untracked_files ||
          status.new_files ||
          status.untracked ||
          [],
      );
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

      getWorkspaceChanges(selectedBranch)
        .then((workspaceStatus) => {
          if (!workspaceStatus.hasChanges) {
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

  // --- New Test Modal Listeners ---
  const newTestModal = document.getElementById('new-test-modal');
  const closeNewTestModalBtn = document.getElementById('close-new-test-modal');
  const confirmNewTestBtn = document.getElementById('confirm-new-test-btn');

  if (newTestModal && closeNewTestModalBtn && confirmNewTestBtn) {
    closeNewTestModalBtn.onclick = () => (newTestModal.style.display = 'none');
    confirmNewTestBtn.addEventListener('click', async () => {
      const testName = document.getElementById('test-name').value;
      if (!testName.trim()) {
        alert('El nombre del test no puede estar vacío.');
        return;
      }

      // Validate test name format
      if (!/^[a-zA-Z0-9_]+$/.test(testName)) {
        alert(
          'El nombre del test solo puede contener letras, números y guiones bajos (_).',
        );
        return;
      }

      const success = await createNewTestFile(testName.trim());
      if (success) {
        newTestModal.style.display = 'none';
        document.getElementById('test-name').value = '';
      }
    });
  }

  // Close modals on outside click
  window.onclick = (event) => {
    if (event.target == commitModal) {
      commitModal.style.display = 'none';
    }
    if (event.target == newTestModal) {
      newTestModal.style.display = 'none';
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

      // Hide new test button when no feature is active
      updateNewTestButtonVisibility(false);

      globalEvents.emit('branch:changed', { selectedBranch, selectedClient });

      // Búsqueda automática de features al cambiar branch
      if (selectedClient) {
        await fetchFeatures();
      }

      // Actualizar el estado del editor
      if (window.progressIndicatorManager) {
        window.progressIndicatorManager.updateEditorStateForCurrentFile();
      }

      // Update glosario button visibility based on workspace status
      await updateGlosarioButtonVisibility(selectedBranch);

      // Clear IDE editor
      const editorPanel = document.getElementById('editor-panel');
      if (editorPanel) {
        const saveBtn = editorPanel.querySelector('#ide-save-btn');
        const commitBtn = editorPanel.querySelector('#ide-commit-btn');
        const runBtn = editorPanel.querySelector('#ide-run-btn');

        if (saveBtn) saveBtn.style.display = 'none';
        if (commitBtn) commitBtn.style.display = 'none';
        if (runBtn) runBtn.style.display = 'none';
        const glosarioBtn = editorPanel.querySelector('#glosario-toggle-btn');
        if (glosarioBtn) glosarioBtn.style.display = 'none';

        // Clear editor content
        const ideEditorContent = getIdeEditorContent();
        if (ideEditorContent !== null) {
          setIdeEditorContent({
            content:
              '// Selecciona una branch y luego un archivo para ver su contenido.',
            isReadOnly: true,
            isModified: false,
            isLocal: false,
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
          updateFeaturesWithGitStatus(
            status.modified_features,
            status.untracked_features ||
              status.untracked_files ||
              status.new_files ||
              status.untracked ||
              [],
          );
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

  // Initial UI setup after a short delay to ensure DOM is ready
  setTimeout(async () => {
    const initialBranch = document.getElementById('branch-select').value;
    const config = appState.getState().config;

    // Update glosario button visibility
    if (initialBranch) {
      await updateGlosarioButtonVisibility(initialBranch);
    }

    // Update commit status indicator
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
  const newTestBtn = document.getElementById('new-test-btn');

  if (refreshFeaturesBtn) {
    refreshFeaturesBtn.addEventListener('click', () => fetchFeatures());
  }

  if (newTestBtn) {
    newTestBtn.addEventListener('click', handleIdeNewTest);
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

    setIdeEditorContent({
      content: '// Cargando...',
      isReadOnly: true,
      isModified: false,
      isLocal: false,
    });
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
          isLocal: contentData.isLocal,
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

      const isExpanded =
        folderItem.parentElement.classList.contains('expanded');
      folderItem.parentElement.classList.toggle('expanded');

      // If folder is being expanded (not collapsed), get its path and show new test button
      if (!isExpanded) {
        const folderPath = getFolderPathFromElement(folderItem.parentElement);
        updateNewTestButtonVisibility(folderPath);
      } else {
        // If folder is being collapsed, hide the new test button
        updateNewTestButtonVisibility(null);
      }
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
    // Don't update new test button visibility when opening a feature
    // Keep the current folder path that was set when expanding a folder
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

// Initialize glosario button when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeToolbarCollapse();
  initializeGlosarioButton();
});

// Initialize glosario toggle button
function initializeGlosarioButton() {
  // The button is now dynamically created in ui.js, so we need to check periodically
  // or use event delegation
  document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'glosario-toggle-btn') {
      // Toggle glosario panel
      if (
        typeof window.serviceRegistry !== 'undefined' &&
        window.serviceRegistry.has('glosarioUI')
      ) {
        window.serviceRegistry.get('glosarioUI').toggle();
      } else if (window.glosarioUI) {
        // Fallback para compatibilidad temporal
        window.glosarioUI.toggle();
      }
    }
  });

  // Update glosario branch when branch changes
  const branchSelect = document.getElementById('branch-select');
  if (branchSelect) {
    branchSelect.addEventListener('change', () => {
      const selectedBranch = branchSelect.value;
      if (typeof window.serviceRegistry !== 'undefined') {
        if (window.serviceRegistry.has('glosarioUI') && selectedBranch) {
          window.serviceRegistry.get('glosarioUI').setBranch(selectedBranch);
        }
        if (window.serviceRegistry.has('glosario') && selectedBranch) {
          window.serviceRegistry.get('glosario').onBranchChange(selectedBranch);
        }
      } else {
        // Fallback para compatibilidad temporal
        if (window.glosarioUI && selectedBranch) {
          window.glosarioUI.setBranch(selectedBranch);
        }
        if (window.glosarioService && selectedBranch) {
          window.glosarioService.onBranchChange(selectedBranch);
        }
      }
    });
  }
}

/**
 * Update glosario button visibility based on workspace status
 */
async function updateGlosarioButtonVisibility(branch) {
  console.log(
    '[MAIN] updateGlosarioButtonVisibility called for branch:',
    branch,
  );

  const glosarioBtn = document.getElementById('glosario-toggle-btn');
  if (!glosarioBtn) {
    console.log('[MAIN] Glosario button not found');
    return;
  }

  if (!branch) {
    console.log('[MAIN] No branch provided, hiding glosario button');
    glosarioBtn.style.display = 'none';
    return;
  }

  try {
    console.log('[MAIN] Checking workspace status for branch:', branch);
    const response = await fetch(
      `/api/steps/status?branch=${encodeURIComponent(branch)}`,
    );
    console.log('[MAIN] Workspace status response status:', response.status);

    if (!response.ok) {
      console.log('[MAIN] Error checking workspace status, hiding button');
      glosarioBtn.style.display = 'none';
      return;
    }

    const result = await response.json();
    console.log('[MAIN] Workspace status result:', result);

    if (result.success && result.data) {
      const { workspaceExists, persistentWorkspacesEnabled } = result.data;
      console.log(
        '[MAIN] Workspace exists:',
        workspaceExists,
        'Persistent workspaces enabled:',
        persistentWorkspacesEnabled,
      );

      // Only show button if persistent workspaces are enabled AND workspace exists
      if (persistentWorkspacesEnabled && workspaceExists) {
        console.log('[MAIN] Showing glosario button');
        glosarioBtn.style.display = 'flex';
      } else {
        console.log('[MAIN] Hiding glosario button - workspace not ready');
        glosarioBtn.style.display = 'none';
      }
    } else {
      console.log('[MAIN] Invalid response, hiding glosario button');
      glosarioBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('[MAIN] Error checking workspace status:', error);
    glosarioBtn.style.display = 'none';
  }
}
