let wiremockLiveViewInterval = null;

async function listWiremockMappings() {
    const output = document.getElementById('wiremock-mappings-output');
    output.textContent = 'Cargando...';
    try {
        const response = await fetch('/api/wiremock/mappings');
        const data = await response.json();
        output.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function deleteWiremockMappings() {
    if (!confirm('¿Estás seguro de que quieres eliminar todos los mappings?')) {
        return;
    }
    const output = document.getElementById('wiremock-mappings-output');
    output.textContent = 'Eliminando...';
    try {
        const response = await fetch('/api/wiremock/mappings', { method: 'DELETE' });
        if (response.ok) {
            output.textContent = 'Todos los mappings han sido eliminados.';
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function resetWiremockMappings() {
    if (!confirm('¿Estás seguro de que quieres resetear los mappings a su estado por defecto?')) {
        return;
    }
    const output = document.getElementById('wiremock-mappings-output');
    output.textContent = 'Reseteando...';
    try {
        const response = await fetch('/api/wiremock/mappings/reset', { method: 'POST' });
        if (response.ok) {
            output.textContent = 'Los mappings han sido reseteados.';
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function importWiremockMappings() {
    const importTextarea = document.getElementById('wiremock-import-textarea');
    const mappingsJson = importTextarea.value;
    if (!mappingsJson) {
        alert('Por favor, pega el JSON de los mappings en el área de texto.');
        return;
    }

    let mappings;
    try {
        mappings = JSON.parse(mappingsJson);
    } catch (error) {
        alert('El texto introducido no es un JSON válido.');
        return;
    }

    const output = document.getElementById('wiremock-mappings-output');
    output.textContent = 'Importando...';
    try {
        const response = await fetch('/api/wiremock/mappings/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(mappings)
        });
        if (response.ok) {
            output.textContent = 'Mappings importados correctamente.';
            importTextarea.value = '';
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

function handleMappingsFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const importTextarea = document.getElementById('wiremock-import-textarea');
        importTextarea.value = content;
    };
    reader.readAsText(file);
}

async function listWiremockRequests() {
    const output = document.getElementById('wiremock-requests-output');
    // Do not show loading message on interval
    if (!wiremockLiveViewInterval) {
        output.textContent = 'Cargando...';
    }
    try {
        const response = await fetch('/api/wiremock/requests');
        const data = await response.json();
        output.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function deleteWiremockRequests() {
    if (!confirm('¿Estás seguro de que quieres eliminar todos los requests?')) {
        return;
    }
    const output = document.getElementById('wiremock-requests-output');
    output.textContent = 'Eliminando...';
    try {
        const response = await fetch('/api/wiremock/requests', { method: 'DELETE' });
        if (response.ok) {
            output.textContent = 'Todos los requests han sido eliminados.';
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function startWiremockRecording() {
    const output = document.getElementById('wiremock-recording-output');
    output.textContent = 'Iniciando grabación...';
    try {
        const response = await fetch('/api/wiremock/recordings/start', { method: 'POST' });
        if (response.ok) {
            output.textContent = 'Grabación iniciada.';
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function stopWiremockRecording() {
    const recordingName = document.getElementById('wiremock-recording-name').value;
    if (!recordingName) {
        alert('Por favor, introduce un nombre para la grabación.');
        return;
    }

    const saveAsSingleFile = document.getElementById('wiremock-save-as-single-file').checked;

    const output = document.getElementById('wiremock-recording-output');
    output.textContent = 'Deteniendo grabación y procesando mappings...';
    try {
        const response = await fetch('/api/wiremock/recordings/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recordingName, saveAsSingleFile })
        });
        const data = await response.json();
        if (response.ok) {
            output.textContent = `${data.message}\n\n${JSON.stringify(data.summary, null, 2)}`;
        } else {
            throw new Error(data.error || 'Error al detener la grabación.');
        }
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

async function getWiremockRecordingStatus() {
    const output = document.getElementById('wiremock-recording-output');
    output.textContent = 'Consultando estado...';
    try {
        const response = await fetch('/api/wiremock/recordings/status');
        const data = await response.json();
        output.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        output.textContent = `Error: ${error.message}`;
    }
}

function startLiveView() {
    if (wiremockLiveViewInterval) return;
    wiremockLiveViewInterval = setInterval(listWiremockRequests, 2000);
}

function stopLiveView() {
    if (wiremockLiveViewInterval) {
        clearInterval(wiremockLiveViewInterval);
        wiremockLiveViewInterval = null;
    }
}

function initializeWiremockTab() {
    const listMappingsBtn = document.getElementById('wiremock-list-mappings-btn');
    const deleteMappingsBtn = document.getElementById('wiremock-delete-mappings-btn');
    const resetMappingsBtn = document.getElementById('wiremock-reset-mappings-btn');
    const importMappingsBtn = document.getElementById('wiremock-import-mappings-btn');
    const uploadMappingsBtn = document.getElementById('wiremock-upload-mappings-btn');
    const uploadInput = document.getElementById('wiremock-upload-input');
    const listRequestsBtn = document.getElementById('wiremock-list-requests-btn');
    const deleteRequestsBtn = document.getElementById('wiremock-delete-requests-btn');
    const startRecordingBtn = document.getElementById('wiremock-start-recording-btn');
    const stopRecordingBtn = document.getElementById('wiremock-stop-recording-btn');
    const statusRecordingBtn = document.getElementById('wiremock-status-recording-btn');
    const liveViewToggle = document.getElementById('wiremock-live-view-toggle');

    listMappingsBtn.addEventListener('click', listWiremockMappings);
    deleteMappingsBtn.addEventListener('click', deleteWiremockMappings);
    resetMappingsBtn.addEventListener('click', resetWiremockMappings);
    importMappingsBtn.addEventListener('click', importWiremockMappings);
    uploadMappingsBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', handleMappingsFileUpload);
    listRequestsBtn.addEventListener('click', listWiremockRequests);
    deleteRequestsBtn.addEventListener('click', deleteWiremockRequests);
    startRecordingBtn.addEventListener('click', startWiremockRecording);
    stopRecordingBtn.addEventListener('click', stopWiremockRecording);
    statusRecordingBtn.addEventListener('click', getWiremockRecordingStatus);

    liveViewToggle.addEventListener('change', () => {
        if (liveViewToggle.checked) {
            startLiveView();
        } else {
            stopLiveView();
        }
    });
}