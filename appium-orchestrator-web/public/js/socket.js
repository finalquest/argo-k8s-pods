let runningJobs = new Map();

function runTest(branch, client, feature, highPriority = false) {
    window.socket.emit('run_test', { branch, client, feature, highPriority });
    switchTab('workers');
}

function runSelectedTests() {
    const branchSelect = document.getElementById('branch-select');
    const clientSelect = document.getElementById('client-select');
    const priorityCheckbox = document.getElementById('batch-priority-checkbox');
    
    const selectedBranch = branchSelect.value;
    const selectedClient = clientSelect.value;
    const highPriority = priorityCheckbox.checked;

    const selectedCheckboxes = document.querySelectorAll('.feature-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('No hay features seleccionados para ejecutar.');
        return;
    }
    const jobs = Array.from(selectedCheckboxes).map(cb => {
        return {
            branch: selectedBranch,
            client: selectedClient,
            feature: cb.dataset.featureName,
            highPriority: highPriority
        };
    });
    window.socket.emit('run_batch', { jobs });
    switchTab('workers');
}

function initializeSocketListeners() {
    window.socket.on('init', (data) => {
        updateQueueStatus(data.status);
        renderWorkerPool(data.slots);
        renderWorkerStatus(data.slots);
    });

    window.socket.on('worker_pool_update', (slots) => {
        renderWorkerPool(slots);
        renderWorkerStatus(slots);
    });

    window.socket.on('queue_status_update', (status) => {
        const statusDiv = document.getElementById('queue-status');
        statusDiv.textContent = `Estado: ${status.active} en ejecución / ${status.queued} en cola (Límite: ${status.limit})`;
    });

    window.socket.on('job_started', (data) => {
        runningJobs.set(data.slotId, data);
        const panel = document.getElementById(`log-panel-${data.slotId}`);
        if (panel) {
            panel.querySelector('.panel-content').innerHTML = '';
        }
    });

    window.socket.on('log_update', (data) => {
        if (data.slotId === undefined) {
            console.log("Log general:", data.logLine);
            return;
        }
        const panel = document.getElementById(`log-panel-${data.slotId}`);
        if (panel) {
            const content = panel.querySelector('.panel-content');
            content.textContent += data.logLine;
            content.scrollTop = content.scrollHeight;
        }
    });

    window.socket.on('job_finished', (data) => {
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
}