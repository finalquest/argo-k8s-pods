import {
  renderHistoryItem,
  populateApkVersions,
  updateSelectedCount,
  updateFeaturesWithGitStatus,
  renderFeatureTree,
} from './ui.js';

export async function getCurrentUser() {
  try {
    const response = await fetch('/api/current-user');
    if (response.status === 401) return null; // No autenticado
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching user status:', error);
    return null; // Asumir no logueado en caso de error de red
  }
}

export async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching server config:', error);
    return { persistentWorkspacesEnabled: false }; // Valor por defecto en caso de error
  }
}

export async function getWorkspaceStatus(branch) {
  if (!branch) return { modified_features: [] };
  try {
    const response = await fetch(`/api/workspace-status/${branch}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(
      `Error fetching workspace status for branch ${branch}:`,
      error,
    );
    return { modified_features: [] }; // Devolver lista vacía en caso de error
  }
}

export async function getFeatureContent(branch, client, feature) {
  try {
    const response = await fetch(
      `/api/feature-content?branch=${branch}&client=${client}&feature=${feature}`,
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error del servidor');
    }
    const data = await response.json();
    return data; // Return the full object with content, isLocal, workspaceExists, message
  } catch (error) {
    console.error('Error fetching feature content:', error);
    alert(`No se pudo cargar el contenido del feature: ${error.message}`);
    return null;
  }
}

export async function saveFeatureContent(branch, client, feature, content) {
  try {
    const response = await fetch('/api/feature-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branch, client, feature, content }),
    });
    if (!response.ok) {
      const errorData = await response.json();

      // Handle specific error for missing workspace
      if (errorData.actionRequired === 'prepare_workspace') {
        const confirmPrepare = confirm(
          'No existe un workspace local para esta branch. ¿Desea preparar el workspace local para poder editar features?',
        );
        if (confirmPrepare) {
          // Trigger workspace preparation
          const prepareBtn = document.getElementById('prepare-workspace-btn');
          if (prepareBtn) {
            prepareBtn.click();
          }
        }
        return null;
      }

      throw new Error(errorData.error || 'Error del servidor');
    }
    return await response.json();
  } catch (error) {
    console.error('Error saving feature content:', error);
    alert(`No se pudo guardar el contenido del feature: ${error.message}`);
    return null;
  }
}

export async function getCommitStatus(branch) {
  try {
    const response = await fetch(`/api/commit-status/${branch}`);
    if (!response.ok) throw new Error('Failed to get commit status');
    return await response.json();
  } catch (error) {
    console.error('Error getting commit status:', error);
    return { hasPendingCommits: false, commitCount: 0 };
  }
}

export async function getWorkspaceChanges(branch) {
  try {
    const response = await fetch(`/api/workspace-changes/${branch}`);
    if (!response.ok) throw new Error('Failed to get workspace changes');
    const data = await response.json();
    // Normalize the response to match expected format
    return {
      hasChanges: data.hasUncommittedChanges || false,
      modifiedFiles: data.modifiedFiles || 0,
      stagedFiles: data.stagedChanges || 0,
      unstagedFiles: data.unstagedChanges || 0,
      message: data.message || '',
    };
  } catch (error) {
    console.error('Error getting workspace changes:', error);
    return {
      hasChanges: false,
      modifiedFiles: 0,
      stagedFiles: 0,
      unstagedFiles: 0,
    };
  }
}

export async function getLocalDevices() {
  try {
    const response = await fetch('/api/local-devices');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching local devices:', error);
    return []; // Devolver lista vacía en caso de error
  }
}

export let apkSource = 'registry'; // 'registry' o 'local'

export async function loadBranches() {
  const branchSelect = document.getElementById('branch-select');
  try {
    const response = await fetch('/api/branches');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const branches = await response.json();
    branchSelect.innerHTML = '';
    branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch;
      option.textContent = branch;
      branchSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar branches:', error);
    branchSelect.innerHTML = '<option>Error al cargar</option>';
  }
}

export async function fetchFeatures() {
  const branchSelect = document.getElementById('branch-select');
  const clientSelect = document.getElementById('client-select');
  const featuresList = document.getElementById('features-list');
  const selectedBranch = branchSelect.value;
  const selectedClient = clientSelect.value;

  if (!selectedBranch || !selectedClient) {
    alert('Por favor, selecciona una branch y un cliente.');
    return;
  }

  featuresList.innerHTML = '<li>Cargando...</li>';

  try {
    const [config, featuresResponse] = await Promise.all([
      fetchConfig(),
      fetch(`/api/features?branch=${selectedBranch}&client=${selectedClient}`),
    ]);

    if (!featuresResponse.ok)
      throw new Error(`HTTP error! status: ${featuresResponse.status}`);

    const featureTree = await featuresResponse.json();
    featuresList.innerHTML = '';

    if (featureTree.length === 0) {
      featuresList.innerHTML =
        '<li>No se encontraron features para esta selección.</li>';
    } else {
      renderFeatureTree(featuresList, featureTree, config);
    }

    updateSelectedCount();

    // Auto-refresh git status after fetching features
    if (config.persistentWorkspacesEnabled) {
      const status = await getWorkspaceStatus(selectedBranch);
      updateFeaturesWithGitStatus(status.modified_features);

      // Also check for both pending commits and uncommitted changes
      try {
        const [commitStatus, workspaceStatus] = await Promise.all([
          getCommitStatus(selectedBranch),
          getWorkspaceChanges(selectedBranch),
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
        header.classList.remove(
          'has-pending-commits',
          'has-uncommitted-changes',
        );

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
        if (commitStatus.hasPendingCommits) {
          header.classList.add('has-pending-commits');
          header.classList.remove('has-uncommitted-changes');
          pendingCommitsIndicator.classList.remove('hidden');
          pendingStatusText.textContent = `${commitStatus.commitCount} commit(s) pendiente(s) de push`;
        } else {
          pendingCommitsIndicator.classList.add('hidden');
        }

        // If no indicators are showing, ensure header is clean
        if (!workspaceStatus.hasChanges && !commitStatus.hasPendingCommits) {
          header.classList.remove(
            'has-pending-commits',
            'has-uncommitted-changes',
          );
        }
      } catch (error) {
        console.error(
          'Error checking commit status after fetching features:',
          error,
        );
      }
    }
  } catch (error) {
    console.error('Error al buscar features:', error);
    featuresList.innerHTML = '<li>Error al buscar features.</li>';
  }
}

export async function loadHistoryBranches() {
  const historyBranchFilter = document.getElementById('history-branch-filter');
  try {
    const response = await fetch('/api/history/branches');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const branches = await response.json();
    // Clear existing options except the first one ("Todas")
    while (historyBranchFilter.options.length > 1) {
      historyBranchFilter.remove(1);
    }
    branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch;
      option.textContent = branch;
      historyBranchFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar las branches del historial:', error);
  }
}

export async function loadHistory(branch = '') {
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '<li>Cargando historial...</li>';
  try {
    const url = branch ? `/api/history?branch=${branch}` : '/api/history';
    const response = await fetch(url);
    const history = await response.json();
    historyList.innerHTML = '';
    if (history.length === 0) {
      historyList.innerHTML =
        '<li>No hay historial de reportes para esta selección.</li>';
    }
    history.forEach((item) => {
      const li = renderHistoryItem(item);
      historyList.appendChild(li);
    });
  } catch (error) {
    console.error('Error al cargar el historial:', error);
    historyList.innerHTML = '<li>Error al cargar el historial.</li>';
  }
}

export async function fetchApkVersions() {
  const clientSelect = document.getElementById('client-select');
  const selectedClient = clientSelect.value;
  const apkVersionSelect = document.getElementById('apk-version-select');

  if (!selectedClient) {
    alert('Por favor, selecciona un cliente primero.');
    return;
  }

  apkVersionSelect.innerHTML = '<option>Cargando...</option>';
  apkVersionSelect.disabled = false;

  try {
    // El endpoint ahora es inteligente. El parámetro repo es opcional y solo se usa para oras.
    const repo = `apks/${selectedClient}/int`;
    const response = await fetch(`/api/apk/versions?repo=${repo}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.details || `HTTP error! status: ${response.status}`,
      );
    }
    const data = await response.json();
    apkSource = data.source; // Guardar el origen
    populateApkVersions(data.versions);
    console.log(`APK source set to: ${apkSource}`);
  } catch (error) {
    console.error('Error al buscar versiones de APK:', error);
    apkVersionSelect.innerHTML = '<option>Error al cargar</option>';
    apkSource = 'registry'; // Reset to default on error
  }
}
