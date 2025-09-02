let apkSource = 'registry'; // 'registry' o 'local'

async function loadBranches() {
    const branchSelect = document.getElementById('branch-select');
    try {
        const response = await fetch('/api/branches');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const branches = await response.json();
        branchSelect.innerHTML = '';
        branches.forEach(branch => {
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

async function fetchFeatures() {
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
        const response = await fetch(`/api/features?branch=${selectedBranch}&client=${selectedClient}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const features = await response.json();
        featuresList.innerHTML = '';
        if (features.length === 0) {
            featuresList.innerHTML = '<li>No se encontraron features para esta selección.</li>';
        }
        features.forEach(feature => {
            const li = document.createElement('li');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'feature-checkbox';
            checkbox.dataset.featureName = feature;
            checkbox.onchange = updateSelectedCount;
            const featureNameSpan = document.createElement('span');
            featureNameSpan.textContent = feature;
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.alignItems = 'center';
            controlsDiv.style.gap = '1em';
            controlsDiv.appendChild(checkbox);
            controlsDiv.appendChild(featureNameSpan);
            li.appendChild(controlsDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.gap = '0.5em';

            const runButton = document.createElement('button');
            runButton.textContent = 'Run';
            runButton.className = 'run-btn';
            runButton.onclick = () => {
                const record = document.getElementById('record-mappings-checkbox').checked;
                runTest(selectedBranch, selectedClient, feature, false, record);
            };
            
            const priorityButton = document.createElement('button');
            priorityButton.textContent = '⚡️';
            priorityButton.title = 'Run with high priority';
            priorityButton.className = 'priority-btn';
            priorityButton.onclick = () => {
                const record = document.getElementById('record-mappings-checkbox').checked;
                runTest(selectedBranch, selectedClient, feature, true, record);
            };

            buttonsDiv.appendChild(runButton);
            buttonsDiv.appendChild(priorityButton);
            li.appendChild(buttonsDiv);
            featuresList.appendChild(li);
        });
        updateSelectedCount();
    } catch (error) {
        console.error('Error al buscar features:', error);
        featuresList.innerHTML = '<li>Error al buscar features.</li>';
    }
}

async function loadHistoryBranches() {
    const historyBranchFilter = document.getElementById('history-branch-filter');
    try {
        const response = await fetch('/api/history/branches');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const branches = await response.json();
        // Clear existing options except the first one ("Todas")
        while (historyBranchFilter.options.length > 1) {
            historyBranchFilter.remove(1);
        }
        branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch;
            option.textContent = branch;
            historyBranchFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error al cargar las branches del historial:', error);
    }
}

async function loadHistory(branch = '') {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '<li>Cargando historial...</li>';
    try {
        const url = branch ? `/api/history?branch=${branch}` : '/api/history';
        const response = await fetch(url);
        const history = await response.json();
        historyList.innerHTML = '';
        if (history.length === 0) {
            historyList.innerHTML = '<li>No hay historial de reportes para esta selección.</li>';
        }
        history.forEach(item => {
            const li = renderHistoryItem(item);
            historyList.appendChild(li);
        });
    } catch (error) {
        console.error('Error al cargar el historial:', error);
        historyList.innerHTML = '<li>Error al cargar el historial.</li>';
    }
}

async function fetchApkVersions() {
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
            throw new Error(errorData.details || `HTTP error! status: ${response.status}`);
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