let runningJobs = new Map();

function runTest(branch, client, feature, highPriority = false, record = false) {
    const apkVersion = document.getElementById('apk-version-select').value;
    window.socket.emit('run_test', { branch, client, feature, highPriority, record, apkVersion });
    switchTab('workers');
}

function runSelectedTests() {
    const branchSelect = document.getElementById('branch-select');
    const clientSelect = document.getElementById('client-select');
    const apkVersionSelect = document.getElementById('apk-version-select');
    const priorityCheckbox = document.getElementById('batch-priority-checkbox');
    const recordCheckbox = document.getElementById('record-mappings-checkbox'); // Get the record checkbox
    
    const selectedBranch = branchSelect.value;
    const selectedClient = clientSelect.value;
    const selectedApkVersion = apkVersionSelect.value;
    const highPriority = priorityCheckbox.checked;
    const recordMappings = recordCheckbox.checked; // Get its value

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
            highPriority: highPriority,
            apkVersion: selectedApkVersion
        };
    });

    // Send the recording flag along with the jobs
    window.socket.emit('run_batch', { jobs, record: recordMappings });
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
        updateQueueStatus(status);
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
            const scrollLockCheckbox = panel.querySelector('.scroll-lock-checkbox');
            
            content.textContent += data.logLine;

            // Solo hacer auto-scroll si el checkbox está marcado
            if (scrollLockCheckbox && scrollLockCheckbox.checked) {
                content.scrollTop = content.scrollHeight;
            }
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