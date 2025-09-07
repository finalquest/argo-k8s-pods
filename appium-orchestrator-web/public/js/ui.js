export function switchTab(tabName) {
  document
    .querySelectorAll('.tab-content')
    .forEach((c) => c.classList.remove('active'));
  document
    .querySelectorAll('.tab-btn')
    .forEach((b) => b.classList.remove('active'));
  document.getElementById(`${tabName}-view`).classList.add('active');
  document
    .querySelector(`.tab-btn[data-tab='${tabName}']`)
    .classList.add('active');
}

export function getStatusText(status) {
  switch (status) {
    case 'initializing':
      return 'Inicializando';
    case 'ready':
      return 'Listo';
    case 'busy':
      return 'Ocupado';
    default:
      return status;
  }
}

export function renderHistoryItem(item) {
  const li = document.createElement('li');

  const infoDiv = document.createElement('div');
  infoDiv.style.display = 'flex';
  infoDiv.style.alignItems = 'center';
  infoDiv.style.gap = '1em';

  const textSpan = document.createElement('span');
  textSpan.textContent = `${item.feature} (${item.branch}) - ${item.timestamp}`;

  infoDiv.appendChild(textSpan);

  li.appendChild(infoDiv);

  if (item.reportUrl) {
    const reportButton = document.createElement('button');
    reportButton.className = 'report-btn';
    reportButton.textContent = 'Ver Reporte';
    reportButton.onclick = () => {
      window.open(
        item.reportUrl,
        'reportPopup',
        'width=1200,height=800,scrollbars=yes,resizable=yes',
      );
    };
    li.appendChild(reportButton);
  }
  return li;
}

export function renderWorkerStatus(workers) {
  const workerStatusContainer = document.getElementById(
    'worker-status-container',
  );
  workerStatusContainer.innerHTML = '';
  if (workers.length === 0) {
    workerStatusContainer.innerHTML = '<p>No hay workers activos.</p>';
    return;
  }
  workers.forEach((worker) => {
    const btn = document.createElement('button');
    btn.className = `worker-status-btn status-${worker.status}`;
    let text = `Worker ${worker.slotId + 1} (${getStatusText(worker.status)})`;
    if (worker.branch) text += ` - ${worker.branch}`;
    if (worker.apkVersion)
      text += ` - APK: ${worker.apkVersion.substring(0, 7)}...`;
    btn.textContent = text;
    btn.onclick = () => {
      const panel = document.getElementById(`log-panel-${worker.slotId}`);
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    workerStatusContainer.appendChild(btn);
  });
}

export function renderWorkerPool(workers, socket) {
  const panelsContainer = document.getElementById('log-panels-container');
  const panelsToRemove = new Set(
    Array.from(panelsContainer.children).map((p) => p.id),
  );
  workers.forEach((worker) => {
    panelsToRemove.delete(`log-panel-${worker.slotId}`);
    let panel = document.getElementById(`log-panel-${worker.slotId}`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'log-panel worker-log-panel'; // Added 'worker-log-panel' class
      panel.id = `log-panel-${worker.slotId}`;
      panel.innerHTML = `<div class="panel-header"></div><div class="panel-content"></div>`;
      panelsContainer.appendChild(panel);
    }
    const header = panel.querySelector('.panel-header');
    header.className = `panel-header status-${worker.status}`;
    let headerText = `Worker ${worker.slotId + 1} (${getStatusText(worker.status)}) - Branch: ${worker.branch}`;
    if (worker.apkVersion) headerText += ` - APK: ${worker.apkVersion}`;
    if (worker.status === 'busy' && worker.job) {
      headerText = `Worker ${worker.slotId + 1} (Ocupado) - Job ${worker.job.id}: ${worker.job.featureName}`;
    }

    // Reconstruir la cabecera para no perder listeners
    header.innerHTML = '';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = headerText;

    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText =
      'float: right; display: inline-flex; align-items: center; gap: 1em;';

    const scrollLockLabel = document.createElement('label');
    scrollLockLabel.style.cssText =
      'font-weight: normal; font-size: 0.9em; color: #343a40; cursor: pointer;';

    const scrollLockCheckbox = document.createElement('input');
    scrollLockCheckbox.type = 'checkbox';
    scrollLockCheckbox.className = 'scroll-lock-checkbox';
    scrollLockCheckbox.checked = true; // Auto-scroll por defecto

    scrollLockLabel.appendChild(scrollLockCheckbox);
    scrollLockLabel.append(' Auto-Scroll');
    controlsDiv.appendChild(scrollLockLabel);

    if (worker.status === 'busy' && worker.job) {
      const stopButton = document.createElement('button');
      stopButton.textContent = 'Detener';
      stopButton.className = 'stop-btn';
      stopButton.onclick = () => {
        if (
          confirm(
            `¿Seguro que quieres detener el test para ${worker.job.featureName}?`,
          )
        ) {
          socket.emit('stop_test', {
            slotId: worker.slotId,
            jobId: worker.job.id,
          });
        }
      };
      controlsDiv.appendChild(stopButton);
    }

    header.appendChild(titleSpan);
    header.appendChild(controlsDiv);
  });
}

export function updateSelectedCount() {
  const runSelectedBtn = document.getElementById('run-selected-btn');
  const selectedCount = document.querySelectorAll(
    '.feature-checkbox:checked',
  ).length;
  runSelectedBtn.textContent = `Ejecutar Selección (${selectedCount})`;
  runSelectedBtn.disabled = selectedCount === 0;
  updateCommitButtonState(); // Update commit button state as well
}

export function updateCommitButtonState() {
  const commitBtn = document.getElementById('commit-changes-btn');
  if (!commitBtn) return;

  const selectedModified = document.querySelectorAll(
    'li.modified .feature-checkbox:checked',
  ).length;

  commitBtn.disabled = selectedModified === 0;
  commitBtn.classList.toggle('hidden', selectedModified === 0);
}

export function toggleSelectAll(event) {
  const checkboxes = document.querySelectorAll('.feature-checkbox');
  checkboxes.forEach((cb) => {
    cb.checked = event.target.checked;
  });
  updateSelectedCount();
}

export function updateQueueStatus(status) {
  const statusDiv = document.getElementById('queue-status');
  statusDiv.textContent = `Estado: ${status.active} en ejecución / ${status.queued} en cola (Límite: ${status.limit})`;
  renderQueue(status.queue);
}

export function renderQueue(queue) {
  const queueList = document.getElementById('queued-tests-list');
  if (!queueList) return;
  queueList.innerHTML = '';
  if (!queue || queue.length === 0) {
    queueList.innerHTML = '<li>No hay tests en la cola.</li>';
    return;
  }

  queue.forEach((job) => {
    const li = document.createElement('li');
    li.innerHTML = `
            <span>
                <strong>${job.feature}</strong> (${job.client} / ${job.branch})
                ${job.highPriority ? '⚡' : ''}
            </span>
            <button class="cancel-job-btn" data-job-id="${job.id}" style="background-color: #dc3545;">Cancelar</button>
        `;
    queueList.appendChild(li);
  });
}

export function switchWiremockSubTab(tabName) {
  document
    .querySelectorAll('.sub-tab-content')
    .forEach((c) => c.classList.remove('active'));
  document
    .querySelectorAll('.sub-tab-btn')
    .forEach((b) => b.classList.remove('active'));
  document.getElementById(`wiremock-${tabName}-view`).classList.add('active');
  document
    .querySelector(`.sub-tab-btn[data-subtab='${tabName}']`)
    .classList.add('active');
}

export function populateApkVersions(versions) {
  const apkVersionSelect = document.getElementById('apk-version-select');
  apkVersionSelect.innerHTML = '';

  if (!versions || versions.length === 0) {
    apkVersionSelect.innerHTML = '<option>No se encontraron versiones</option>';
    return;
  }

  versions.forEach((version) => {
    const option = document.createElement('option');
    option.value = version;
    option.textContent = version;
    apkVersionSelect.appendChild(option);
  });
}

export function displayPrepareWorkspaceButton(isEnabled) {
  if (!isEnabled) return;

  const button = document.getElementById('prepare-workspace-btn');
  if (button) {
    button.style.display = 'inline-flex';
    button.title =
      'Clona el repo y corre yarn install para la branch seleccionada, sin ejecutar un test.';
  }
}

export function displayGitControls(isEnabled) {
  if (!isEnabled) return;

  const button = document.getElementById('refresh-git-status-btn');
  if (button) {
    button.style.display = 'inline-flex';
    button.title =
      'Comprueba los cambios locales en los features de esta branch contra Git.';
  }
}

export function displayFeatureFilter(isEnabled) {
  if (!isEnabled) return;

  const featuresHeader = document.querySelector('.features-header');
  if (!featuresHeader) return;

  // Hide the Features title
  const featuresTitle = featuresHeader.querySelector('h2');
  if (featuresTitle) {
    featuresTitle.style.display = 'none';
  }

  // Create a container for the left side controls in a row
  const leftControlsContainer = document.createElement('div');
  leftControlsContainer.className = 'filter-controls-container';

  // Text filter container - move the existing input here first
  const textFilterContainer = document.createElement('div');
  textFilterContainer.className = 'filter-group';

  const textLabel = document.createElement('label');
  textLabel.htmlFor = 'features-filter';
  textLabel.textContent = 'Buscar:';

  // Move the existing input from the HTML to here
  const existingInput = document.getElementById('features-filter');
  if (existingInput) {
    existingInput.parentNode.removeChild(existingInput);
    textFilterContainer.appendChild(textLabel);
    textFilterContainer.appendChild(existingInput);
  }

  // Status filter container
  const statusFilterContainer = document.createElement('div');
  statusFilterContainer.className = 'filter-group';

  const statusLabel = document.createElement('label');
  statusLabel.htmlFor = 'feature-filter-select';
  statusLabel.textContent = 'Estado:';

  const statusSelect = document.createElement('select');
  statusSelect.id = 'feature-filter-select';
  statusSelect.innerHTML = `
        <option value="all">Todos</option>
        <option value="modified">Solo Modificados</option>
    `;

  statusFilterContainer.appendChild(statusLabel);
  statusFilterContainer.appendChild(statusSelect);

  // Add both containers to the left controls in row
  leftControlsContainer.appendChild(textFilterContainer);
  leftControlsContainer.appendChild(statusFilterContainer);

  // Add it to the left of the "Select All" checkbox
  const selectAllContainer = featuresHeader.querySelector('div');
  if (selectAllContainer) {
    featuresHeader.insertBefore(leftControlsContainer, selectAllContainer);
  }
}

export function filterFeatureList() {
  const statusFilterElement = document.getElementById('feature-filter-select');
  const filterValue = statusFilterElement ? statusFilterElement.value : 'all';
  const textFilter = document
    .getElementById('features-filter')
    .value.toLowerCase();
  const featuresList = document.getElementById('features-list');
  const featureItems = featuresList.getElementsByTagName('li');

  for (const item of featureItems) {
    let shouldShow = true;

    // Apply status filter (modified/all) only if the element exists
    if (statusFilterElement) {
      switch (filterValue) {
        case 'modified':
          if (!item.classList.contains('modified')) {
            shouldShow = false;
          }
          break;
        case 'all':
        default:
          break;
      }
    }

    // Apply text filter if there's text
    if (shouldShow && textFilter) {
      const itemText = item.textContent.toLowerCase();
      if (!itemText.includes(textFilter)) {
        shouldShow = false;
      }
    }

    item.style.display = shouldShow ? '' : 'none';
  }
}

export function filterFeatureListByText() {
  // Apply both filters when text changes
  filterFeatureList();
}

export function updateFeaturesWithGitStatus(modifiedFeatures) {
  // The modifiedFeatures from server are full paths, e.g., test/features/nbch/feature/modulos/folder/file.feature
  // The featureName in the dataset is relative to modulos, e.g., folder/file
  const modifiedSet = new Set(modifiedFeatures);
  const featureItems = document.querySelectorAll('#features-list .file');

  featureItems.forEach((item) => {
    const featureName = item.dataset.featureName;
    if (!featureName) return;

    // We can't know the full client/branch path here easily,
    // so we check if any path in the modified set *ends with* our feature path.
    const featurePathSuffix = `${featureName}.feature`;

    let isModified = false;
    for (const modifiedFile of modifiedSet) {
      if (modifiedFile.endsWith(featurePathSuffix)) {
        isModified = true;
        break;
      }
    }

    if (isModified) {
      item.classList.add('modified');
    } else {
      item.classList.remove('modified');
    }
  });
}

export function addFeatureControls(li, featureName) {
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'feature-actions';

  const runButton = document.createElement('button');
  runButton.innerHTML = '▶️';
  runButton.className = 'run-btn btn-run';
  runButton.title = 'Ejecutar';
  runButton.dataset.feature = featureName;

  const priorityButton = document.createElement('button');
  priorityButton.innerHTML = '⚡';
  priorityButton.title = 'Ejecutar con alta prioridad';
  priorityButton.className = 'priority-btn btn-quick';
  priorityButton.dataset.feature = featureName;

  buttonsDiv.appendChild(runButton);
  buttonsDiv.appendChild(priorityButton);
  li.appendChild(buttonsDiv);
}

export function renderFeatureTree(parentElement, nodes, config) {
  nodes.forEach((node) => {
    const li = document.createElement('li');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'feature-item';

    if (node.type === 'folder') {
      li.classList.add('folder');
      li.dataset.folderPath = node.name; // Add folder path as a data attribute
      itemDiv.textContent = `📁 ${node.name}`; // Add icon
      li.appendChild(itemDiv);

      if (node.children && node.children.length > 0) {
        const nestedUl = document.createElement('ul');
        nestedUl.classList.add('nested'); // Class for CSS targeting
        renderFeatureTree(nestedUl, node.children, config);
        li.appendChild(nestedUl);
      }
    } else if (node.type === 'file') {
      li.classList.add('file');
      li.dataset.featureName = node.featureName; // Add feature name as a data attribute

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'feature-checkbox';
      checkbox.dataset.featureName = node.featureName;
      checkbox.onchange = updateSelectedCount;

      const featureNameSpan = document.createElement('span');
      featureNameSpan.textContent = `📄 ${node.name}`; // Add icon

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(featureNameSpan);

      addFeatureControls(itemDiv, node.featureName, config);
      li.appendChild(itemDiv);
    }

    parentElement.appendChild(li);
  });
}

let ideCodeMirror = null; // For the new IDE view

export function createCommitModal() {
  const modalHTML = `
    <div id="commit-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Hacer Commit de Cambios</h2>
                <span id="close-commit-modal" class="close-btn">&times;</span>
            </div>
            <div>
                <p>Archivos a incluir:</p>
                <ul id="commit-files-list"></ul>
                <label for="commit-message">Mensaje de Commit:</label>
                <textarea id="commit-message" rows="4" required></textarea>
                <button id="confirm-commit-btn" style="width: 100%; margin-top: 1rem;">Confirmar Commit</button>
            </div>
        </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

export function initIdeView({ onSave, onCommit, onRun }) {
  // Initialize Split.js
  Split(['#feature-tree-panel', '#editor-panel'], {
    sizes: [30, 70],
    minSize: [200, 300],
    gutterSize: 8,
    cursor: 'col-resize',
  });

  // Initialize CodeMirror in the right panel
  const editorPanel = document.getElementById('editor-panel');
  editorPanel.innerHTML = `
    <div class="editor-controls">
      <button id="ide-run-btn" class="execute-btn" style="display: none;">Ejecutar</button>
      <button id="ide-commit-btn" class="commit-btn" style="display: none;">Hacer Commit</button>
      <button id="ide-save-btn" class="secondary-btn" style="display: none;" disabled>Guardar Cambios</button>
    </div>
    <div class="codemirror-wrapper"></div>
  `;

  const wrapper = editorPanel.querySelector('.codemirror-wrapper');
  ideCodeMirror = CodeMirror(wrapper, {
    value: '// Selecciona un archivo del árbol para ver su contenido.\n',
    lineNumbers: true,
    mode: 'gherkin',
    theme: 'material-darker',
    readOnly: true,
  });
  ideCodeMirror.setSize('100%', '100%');

  // --- Attach Listeners ---
  ideCodeMirror.on('change', () => {
    const saveBtn = document.getElementById('ide-save-btn');
    if (saveBtn) saveBtn.disabled = false;
  });

  const saveBtn = document.getElementById('ide-save-btn');
  if (saveBtn && typeof onSave === 'function') {
    saveBtn.addEventListener('click', onSave);
  }

  const commitBtn = document.getElementById('ide-commit-btn');
  if (commitBtn && typeof onCommit === 'function') {
    commitBtn.addEventListener('click', onCommit);
  }

  const runBtn = document.getElementById('ide-run-btn');
  if (runBtn && typeof onRun === 'function') {
    runBtn.addEventListener('click', onRun);
  }
}

export function setIdeEditorContent({ content, isReadOnly, isModified }) {
  const saveBtn = document.getElementById('ide-save-btn');
  const commitBtn = document.getElementById('ide-commit-btn');
  const runBtn = document.getElementById('ide-run-btn');

  if (ideCodeMirror) {
    ideCodeMirror.setValue(
      content || '// Selecciona un archivo para ver su contenido.',
    );
    ideCodeMirror.setOption('readOnly', isReadOnly);
    ideCodeMirror.clearHistory();
  }

  if (saveBtn) {
    saveBtn.style.display = isReadOnly ? 'none' : 'inline-block';
    saveBtn.disabled = true;
  }
  if (runBtn) {
    runBtn.style.display = isReadOnly ? 'none' : 'inline-block';
  }
  if (commitBtn) {
    commitBtn.style.display = isModified ? 'inline-block' : 'none';
  }
}

export function getIdeEditorContent() {
  return ideCodeMirror ? ideCodeMirror.getValue() : null;
}

export function setSaveButtonState(enabled) {
  const saveBtn = document.getElementById('save-feature-ide-btn');
  if (saveBtn) {
    saveBtn.disabled = !enabled;
  }
}
