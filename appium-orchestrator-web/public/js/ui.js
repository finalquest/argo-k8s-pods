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

  const button = document.createElement('button');
  button.id = 'prepare-workspace-btn';
  button.textContent = 'Preparar Workspace';
  button.title =
    'Clona el repo y corre yarn install para la branch seleccionada, sin ejecutar un test.';

  // Insert after the branch select dropdown
  const branchSelect = document.getElementById('branch-select');
  if (branchSelect && branchSelect.parentElement) {
    branchSelect.parentElement.insertBefore(button, branchSelect.nextSibling);
  }
}

export function displayGitControls(isEnabled) {
  if (!isEnabled) return;

  const prepareBtn = document.getElementById('prepare-workspace-btn');
  if (!prepareBtn) return;

  const button = document.createElement('button');
  button.id = 'refresh-git-status-btn';
  button.textContent = 'Refrescar Cambios (Git)';
  button.title =
    'Comprueba los cambios locales en los features de esta branch contra Git.';

  prepareBtn.parentElement.insertBefore(button, prepareBtn.nextSibling);
}

export function displayFeatureFilter(isEnabled) {
  if (!isEnabled) return;

  const featuresHeader = document.querySelector('.features-header');
  if (!featuresHeader) return;

  const filterContainer = document.createElement('div');
  filterContainer.style.display = 'flex';
  filterContainer.style.alignItems = 'center';
  filterContainer.style.gap = '0.5rem';

  const label = document.createElement('label');
  label.htmlFor = 'feature-filter-select';
  label.textContent = 'Filtrar:';

  const select = document.createElement('select');
  select.id = 'feature-filter-select';
  select.innerHTML = `
        <option value="all">Todos</option>
        <option value="modified">Solo Modificados</option>
    `;

  filterContainer.appendChild(label);
  filterContainer.appendChild(select);

  // Add it to the left of the "Select All" checkbox
  const selectAllContainer = featuresHeader.querySelector('div');
  if (selectAllContainer) {
    featuresHeader.insertBefore(filterContainer, selectAllContainer);
  }
}

export function filterFeatureList() {
  const filterValue = document.getElementById('feature-filter-select').value;
  const featuresList = document.getElementById('features-list');
  const featureItems = featuresList.getElementsByTagName('li');

  for (const item of featureItems) {
    switch (filterValue) {
      case 'modified':
        if (item.classList.contains('modified')) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
        break;
      case 'all':
      default:
        item.style.display = 'flex';
        break;
    }
  }
}

export function updateFeaturesWithGitStatus(modifiedFeatures) {
  const modifiedSet = new Set(
    modifiedFeatures.map((f) => {
      const parts = f.split('/');
      return parts[parts.length - 1];
    }),
  );

  const featureItems = document.querySelectorAll('#features-list .file');

  featureItems.forEach((item) => {
    const checkbox = item.querySelector('.feature-checkbox');
    if (!checkbox) return;

    const featureName = checkbox.dataset.featureName + '.feature';

    item.classList.remove('modified');
    if (modifiedSet.has(featureName)) {
      item.classList.add('modified');
    }
  });
}

export function addFeatureControls(li, featureName, config) {
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.display = 'flex';
  buttonsDiv.style.gap = '0.5em';

  // Botón de Editar (condicional)
  if (config.persistentWorkspacesEnabled) {
    const editButton = document.createElement('button');
    editButton.textContent = 'Editar';
    editButton.className = 'edit-btn';
    editButton.dataset.feature = featureName;
    editButton.style.backgroundColor = 'var(--gray-500)';
    buttonsDiv.appendChild(editButton);
  }

  const runButton = document.createElement('button');
  runButton.textContent = 'Run';
  runButton.className = 'run-btn';
  runButton.dataset.feature = featureName;

  const priorityButton = document.createElement('button');
  priorityButton.textContent = '⚡️';
  priorityButton.title = 'Run with high priority';
  priorityButton.className = 'priority-btn';
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
      itemDiv.textContent = node.name;
      li.appendChild(itemDiv);

      if (node.children && node.children.length > 0) {
        const nestedUl = document.createElement('ul');
        renderFeatureTree(nestedUl, node.children, config);
        li.appendChild(nestedUl);
      }
    } else if (node.type === 'file') {
      li.classList.add('file');

      const controlsDiv = document.createElement('div');
      controlsDiv.style.display = 'flex';
      controlsDiv.style.alignItems = 'center';
      controlsDiv.style.gap = '1em';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'feature-checkbox';
      checkbox.dataset.featureName = node.featureName;
      checkbox.onchange = updateSelectedCount;

      const featureNameSpan = document.createElement('span');
      featureNameSpan.textContent = node.name;

      controlsDiv.appendChild(checkbox);
      controlsDiv.appendChild(featureNameSpan);
      itemDiv.appendChild(controlsDiv);

      addFeatureControls(itemDiv, node.featureName, config);
      li.appendChild(itemDiv);
    }

    parentElement.appendChild(li);
  });
}

let codeMirrorEditor = null;

export function createEditModal() {
  const modalHTML = `
    <div id="edit-feature-modal" class="modal">
        <div class="modal-content" style="max-width: 80vw;">
            <div class="modal-header">
                <h2 id="edit-modal-title">Editar Feature</h2>
                <span id="close-edit-modal" class="close-btn">&times;</span>
            </div>
            <div id="editor-container">
                <textarea id="feature-editor"></textarea>
            </div>
            <button id="save-feature-btn" style="width: 100%; margin-top: 1rem;">Guardar Cambios</button>
        </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

export function openEditModal(branch, client, feature, content) {
  document.getElementById('edit-modal-title').textContent =
    `Editando: ${feature}`;
  const modal = document.getElementById('edit-feature-modal');
  const editorTextarea = document.getElementById('feature-editor');
  editorTextarea.value = content;

  modal.style.display = 'block';

  if (codeMirrorEditor) {
    codeMirrorEditor.toTextArea();
  }

  codeMirrorEditor = CodeMirror.fromTextArea(editorTextarea, {
    lineNumbers: true,
    mode: 'gherkin',
    theme: 'material-darker',
    indentUnit: 2,
    tabSize: 2,
  });
  codeMirrorEditor.setSize('100%', '60vh');

  // Store data for the save button
  document.getElementById('save-feature-btn').dataset.saveInfo = JSON.stringify(
    { branch, client, feature },
  );
}

export function getEditorContent() {
  return codeMirrorEditor ? codeMirrorEditor.getValue() : null;
}

export function displayCommitButton(isEnabled) {
  if (!isEnabled) return;

  const selectAllContainer = document.querySelector('.features-header div');
  if (!selectAllContainer) return;

  const button = document.createElement('button');
  button.id = 'commit-changes-btn';
  button.textContent = 'Hacer Commit de Cambios';
  button.disabled = true; // Disabled by default
  button.style.backgroundColor = 'var(--primary-color)';
  button.style.borderColor = 'var(--primary-color)';
  button.style.marginLeft = '2em';

  selectAllContainer.appendChild(button);
}

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
