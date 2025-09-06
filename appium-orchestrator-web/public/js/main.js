import {
  getFeatureContent,
  saveFeatureContent,
  getWorkspaceStatus,
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
  displayCommitButton,
  createCommitModal,
  openEditModal,
  getEditorContent,
  createEditModal,
} from './ui.js';
import { initializeWiremockTab } from './wiremock.js';

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

function initializeApp() {
  // eslint-disable-next-line no-undef
  const socket = io();
  initializeSocketListeners(socket);
  initializeUiEventListeners(socket);
  initializeAppControls(socket);
  initializeWiremockTab();

  loadBranches();
  loadHistoryBranches();
  loadHistory();
  loadLocalDevices();
  
  // Auto-fetch APK versions on page load
  fetchApkVersions();
}

async function initializeAppControls(socket) {
  const config = await fetchConfig();
  displayPrepareWorkspaceButton(config.persistentWorkspacesEnabled);
  displayGitControls(config.persistentWorkspacesEnabled);
  displayFeatureFilter(config.persistentWorkspacesEnabled);
  displayCommitButton(config.persistentWorkspacesEnabled);
  createCommitModal();
  createEditModal();

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

  const commitBtn = document.getElementById('commit-changes-btn');
  if (commitBtn) {
    commitBtn.addEventListener('click', () => {
      const modal = document.getElementById('commit-modal');
      const filesList = document.getElementById('commit-files-list');
      filesList.innerHTML = '';

      const selectedFiles = document.querySelectorAll(
        'li.modified .feature-checkbox:checked',
      );
      if (selectedFiles.length === 0) {
        alert('No hay features modificados seleccionados para el commit.');
        return;
      }

      selectedFiles.forEach((cb) => {
        const featureName = cb.dataset.featureName;
        const li = document.createElement('li');
        li.textContent = featureName;
        filesList.appendChild(li);
      });

      modal.style.display = 'block';
    });
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
      const files = Array.from(
        document.querySelectorAll('li.modified .feature-checkbox:checked'),
      ).map((cb) => {
        return `test/features/${client}/feature/modulos/${cb.dataset.featureName}.feature`;
      });

      commitChanges(socket, { branch, files, message });
      commitModal.style.display = 'none';
      document.getElementById('commit-message').value = '';
    });
  }

  const editModal = document.getElementById('edit-feature-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal');
  const saveFeatureBtn = document.getElementById('save-feature-btn');

  if (editModal && closeEditModalBtn && saveFeatureBtn) {
    closeEditModalBtn.onclick = () => (editModal.style.display = 'none');
    saveFeatureBtn.addEventListener('click', async () => {
      const content = getEditorContent();
      const { branch, client, feature } = JSON.parse(
        saveFeatureBtn.dataset.saveInfo,
      );

      const result = await saveFeatureContent(branch, client, feature, content);
      if (result) {
        alert('Feature guardado con éxito!');
        editModal.style.display = 'none';
        // Auto-refresh git status
        document.getElementById('refresh-git-status-btn')?.click();
      }
    });
  }

  // Close modals on outside click
  window.onclick = (event) => {
    if (event.target == commitModal) {
      commitModal.style.display = 'none';
    }
    if (event.target == editModal) {
      editModal.style.display = 'none';
    }
  };
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
  const refreshApkVersionsBtn = document.getElementById('refresh-apk-versions-btn');

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

  featuresList.addEventListener('click', async (e) => {
    const target = e.target;

    // Handle folder expansion/collapse
    const folderItem = target.closest('.folder > .feature-item');
    if (folderItem) {
      folderItem.parentElement.classList.toggle('expanded');
      return; // Stop further processing
    }

    const featureName = target.dataset.feature;
    const branch = document.getElementById('branch-select').value;
    const client = document.getElementById('client-select').value;

    if (
      target.classList.contains('run-btn') ||
      target.classList.contains('priority-btn')
    ) {
      const highPriority = target.classList.contains('priority-btn');
      runTest(socket, branch, client, featureName, highPriority);
    } else if (target.classList.contains('edit-btn')) {
      const content = await getFeatureContent(
        branch,
        client,
        featureName + '.feature',
      );
      if (content !== null) {
        openEditModal(branch, client, featureName + '.feature', content);
      }
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
