let runningJobs = new Map();

function runTest(branch, client, feature, highPriority = false, record = false) {
    const selectedApk = document.getElementById('apk-version-select').value;
    let jobPayload = { branch, client, feature, highPriority, record };

    if (apkSource === 'local') {
        jobPayload.localApk = selectedApk;
    } else {
        jobPayload.apkVersion = selectedApk;
    }

    window.socket.emit('run_test', jobPayload);
    switchTab('workers');
}

function runSelectedTests() {
    const branchSelect = document.getElementById('branch-select');
    const clientSelect = document.getElementById('client-select');
    const apkVersionSelect = document.getElementById('apk-version-select');
    const priorityCheckbox = document.getElementById('batch-priority-checkbox');
    const recordCheckbox = document.getElementById('record-mappings-checkbox');
    
    const selectedBranch = branchSelect.value;
    const selectedClient = clientSelect.value;
    const selectedApk = apkVersionSelect.value;
    const highPriority = priorityCheckbox.checked;
    const recordMappings = recordCheckbox.checked;

    const selectedCheckboxes = document.querySelectorAll('.feature-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('No hay features seleccionados para ejecutar.');
        return;
    }

    const baseJob = {
        branch: selectedBranch,
        client: selectedClient,
        highPriority: highPriority,
    };

    if (apkSource === 'local') {
        baseJob.localApk = selectedApk;
    } else {
        baseJob.apkVersion = selectedApk;
    }

    const jobs = Array.from(selectedCheckboxes).map(cb => ({
        ...baseJob,
        feature: cb.dataset.featureName,
    }));

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

function stopAllExecution() {
    if (confirm('¿Estás seguro de que quieres parar TODA la ejecución? Esto limpiará la cola y detendrá todos los workers activos.')) {
        window.socket.emit('stop_all_execution');
        console.log('Enviada señal para detener todo.');
    }
}