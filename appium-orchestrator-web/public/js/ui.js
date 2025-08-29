function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tabName}-view`).classList.add('active');
    document.querySelector(`.tab-btn[data-tab='${tabName}']`).classList.add('active');
}

function getStatusText(status) {
    switch (status) {
        case 'initializing': return 'Inicializando';
        case 'ready': return 'Listo';
        case 'busy': return 'Ocupado';
        default: return status;
    }
}

function renderHistoryItem(item) {
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
            window.open(item.reportUrl, 'reportPopup', 'width=1200,height=800,scrollbars=yes,resizable=yes');
        };
        li.appendChild(reportButton);
    }
    return li;
}

function renderWorkerStatus(workers) {
    const workerStatusContainer = document.getElementById('worker-status-container');
    workerStatusContainer.innerHTML = '';
    if (workers.length === 0) {
        workerStatusContainer.innerHTML = '<p>No hay workers activos.</p>';
        return;
    }
    workers.forEach(worker => {
        const btn = document.createElement('button');
        btn.className = `worker-status-btn status-${worker.status}`;
        let text = `Worker ${worker.slotId + 1} (${getStatusText(worker.status)})`;
        if (worker.branch) text += ` - ${worker.branch}`;
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

function renderWorkerPool(workers) {
    const panelsContainer = document.getElementById('log-panels-container');
    const panelsToRemove = new Set(Array.from(panelsContainer.children).map(p => p.id));
    workers.forEach(worker => {
        panelsToRemove.delete(`log-panel-${worker.slotId}`);
        let panel = document.getElementById(`log-panel-${worker.slotId}`);
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'log-panel';
            panel.id = `log-panel-${worker.slotId}`;
            panel.innerHTML = `<div class="panel-header"></div><div class="panel-content"></div>`;
            panelsContainer.appendChild(panel);
        }
        const header = panel.querySelector('.panel-header');
        header.className = `panel-header status-${worker.status}`;
        let headerText = `Worker ${worker.slotId + 1} (${getStatusText(worker.status)}) - Branch: ${worker.branch}`;
        if (worker.status === 'busy' && worker.job) {
            headerText = `Worker ${worker.slotId + 1} (Ocupado) - Job ${worker.job.id}: ${worker.job.featureName}`;
        }
        header.innerHTML = `<span>${headerText}</span>`;
        if (worker.status === 'busy' && worker.job) {
            const stopButton = document.createElement('button');
            stopButton.textContent = 'Detener';
            stopButton.className = 'stop-btn';
            stopButton.onclick = () => {
                if (confirm(`¿Seguro que quieres detener el test para ${worker.job.featureName}?`)) {
                    window.socket.emit('stop_test', { slotId: worker.slotId, jobId: worker.job.id });
                }
            };
            header.appendChild(stopButton);
        }
    });
    panelsToRemove.forEach(panelId => {
        // document.getElementById(panelId)?.remove();
    });
}

function updateSelectedCount() {
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const selectedCount = document.querySelectorAll('.feature-checkbox:checked').length;
    runSelectedBtn.textContent = `Ejecutar Selección (${selectedCount})`;
    runSelectedBtn.disabled = selectedCount === 0;
}

function toggleSelectAll(event) {
    const checkboxes = document.querySelectorAll('.feature-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = event.target.checked;
    });
    updateSelectedCount();
}

function updateQueueStatus(status) {
    const statusDiv = document.getElementById('queue-status');
    statusDiv.textContent = `Estado: ${status.active} en ejecución / ${status.queued} en cola (Límite: ${status.limit})`;
}

function switchWiremockSubTab(tabName) {
    document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`wiremock-${tabName}-view`).classList.add('active');
    document.querySelector(`.sub-tab-btn[data-subtab='${tabName}']`).classList.add('active');
}