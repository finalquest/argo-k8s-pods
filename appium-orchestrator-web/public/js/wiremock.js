let wiremockLiveViewInterval = null;
let lastKnownRequests = [];

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

async function loadBaseMappings() {
    if (!confirm('¿Estás seguro de que quieres cargar los base mappings? Esto reemplazará los mappings actuales.')) {
        return;
    }
    const output = document.getElementById('wiremock-mappings-output');
    output.textContent = 'Cargando base mappings...';
    try {
        const baseMappingResp = await fetch('/js/base_mapping.json');
        if (!baseMappingResp.ok) {
            throw new Error(`No se pudo cargar /js/base_mapping.json: ${baseMappingResp.statusText}`);
        }
        const mappings = await baseMappingResp.json();

        const importResp = await fetch('/api/wiremock/mappings/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappings)
        });

        if (importResp.ok) {
            output.textContent = 'Base mappings importados correctamente.';
        } else {
            const errorText = await importResp.text();
            throw new Error(errorText || importResp.statusText);
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
            headers: { 'Content-Type': 'application/json' },
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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('wiremock-import-textarea').value = e.target.result;
    };
    reader.readAsText(file);
}

async function listWiremockRequests() {
    const output = document.getElementById('wiremock-requests-output');
    const isFirstLoad = lastKnownRequests.length === 0;

    if (isFirstLoad && !wiremockLiveViewInterval) {
        output.innerHTML = 'Cargando...';
    }

    try {
        const response = await fetch('/api/wiremock/requests');
        const data = await response.json();
        const newRequests = data.requests || [];

        const renderRequest = (req) => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';

            const summary = document.createElement('div');
            summary.className = 'log-summary';
            const summaryText = `${req.request.method} ${req.request.url} -> ${req.response.status}`;
            summary.textContent = summaryText;

            const details = document.createElement('div');
            details.className = 'log-details';
            const pre = document.createElement('pre');
            pre.textContent = JSON.stringify(req, null, 2);
            details.appendChild(pre);

            summary.onclick = () => {
                details.style.display = details.style.display === 'block' ? 'none' : 'block';
            };

            entry.appendChild(summary);
            entry.appendChild(details);
            return entry;
        };

        if (isFirstLoad) {
            output.innerHTML = ''; // Clear loading message
            newRequests.forEach(req => {
                output.appendChild(renderRequest(req));
            });
        } else {
            const lastKnownIds = new Set(lastKnownRequests.map(r => r.id));
            const requestsToAdd = newRequests.filter(r => !lastKnownIds.has(r.id));

            if (requestsToAdd.length > 0) {
                requestsToAdd.reverse().forEach(req => {
                    const entry = renderRequest(req);
                    entry.classList.add('new-request-highlight');
                    output.prepend(entry);

                    setTimeout(() => {
                        entry.classList.remove('new-request-highlight');
                    }, 2000);
                });
            }
        }

        lastKnownRequests = newRequests;

    } catch (error) {
        output.innerHTML = `Error: ${error.message}`;
    }
}

async function deleteWiremockRequests() {
    if (!confirm('¿Estás seguro de que quieres eliminar todos los requests?')) {
        return;
    }
    const output = document.getElementById('wiremock-requests-output');
    output.innerHTML = 'Eliminando...';
    try {
        const response = await fetch('/api/wiremock/requests', { method: 'DELETE' });
        if (response.ok) {
            output.innerHTML = 'Todos los requests han sido eliminados.';
            lastKnownRequests = []; // Reset state
        } else {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
        }
    } catch (error) {
        output.innerHTML = `Error: ${error.message}`;
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
            headers: { 'Content-Type': 'application/json' },
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
    lastKnownRequests = [];
    const output = document.getElementById('wiremock-requests-output');
    output.textContent = ''; 
    listWiremockRequests();
    wiremockLiveViewInterval = setInterval(listWiremockRequests, 2000);
}

function stopLiveView() {
    if (wiremockLiveViewInterval) {
        clearInterval(wiremockLiveViewInterval);
        wiremockLiveViewInterval = null;
    }
}

async function openDownloadMappingsModal() {
    const modal = document.getElementById('mappings-download-modal');
    const container = document.getElementById('mappings-list-container');
    container.innerHTML = '<p>Cargando...</p>';
    modal.style.display = 'block';

    try {
        const response = await fetch('/api/mappings/list');
        const files = await response.json();
        
        if (files.length === 0) {
            container.innerHTML = '<p>No hay mappings guardados para descargar.</p>';
            return;
        }

        container.innerHTML = files.map(file => `
            <div class="mapping-item">
                <label class="mapping-item-label">
                    <input type="checkbox" class="mapping-checkbox" value="${file}">
                    ${file}
                </label>
                <a href="/api/mappings/download/${file}" class="download-single-btn">Descargar</a>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<p style="color: red;">Error al cargar la lista: ${error.message}</p>`;
    }
}

async function downloadSelectedMappings() {
    const selected = document.querySelectorAll('#mappings-list-container .mapping-checkbox:checked');
    if (selected.length === 0) {
        alert('Por favor, selecciona al menos un mapping para descargar.');
        return;
    }

    const names = Array.from(selected).map(cb => cb.value);
    const btn = document.getElementById('download-selected-mappings-btn');
    btn.textContent = 'Descargando...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/mappings/download-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names })
        });

        if (!response.ok) {
            throw new Error(`Error en el servidor: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'mappings-batch.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        document.getElementById('mappings-download-modal').style.display = 'none';

    } catch (error) {
        alert(`Error al descargar: ${error.message}`);
    } finally {
        btn.textContent = 'Descargar Selección';
        btn.disabled = false;
    }
}

function initializeWiremockTab() {
    document.querySelectorAll('.sub-tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            switchWiremockSubTab(button.dataset.subtab);
        });
    });

    const listMappingsBtn = document.getElementById('wiremock-list-mappings-btn');
    const deleteMappingsBtn = document.getElementById('wiremock-delete-mappings-btn');
    const resetMappingsBtn = document.getElementById('wiremock-reset-mappings-btn');
    const baseMappingsBtn = document.getElementById('wiremock-base-mappings-btn');
    const importMappingsBtn = document.getElementById('wiremock-import-mappings-btn');
    const uploadMappingsBtn = document.getElementById('wiremock-upload-mappings-btn');
    const uploadInput = document.getElementById('wiremock-upload-input');
    const listRequestsBtn = document.getElementById('wiremock-list-requests-btn');
    const deleteRequestsBtn = document.getElementById('wiremock-delete-requests-btn');
    const startRecordingBtn = document.getElementById('wiremock-start-recording-btn');
    const stopRecordingBtn = document.getElementById('wiremock-stop-recording-btn');
    const statusRecordingBtn = document.getElementById('wiremock-status-recording-btn');
    const liveViewToggle = document.getElementById('wiremock-live-view-toggle');
    const requestsOutput = document.getElementById('wiremock-requests-output');

    // Listeners para el nuevo modal de descarga
    const openModalBtn = document.getElementById('open-mappings-download-modal-btn');
    const closeModalBtn = document.querySelector('#mappings-download-modal .close-btn');
    const downloadSelectedBtn = document.getElementById('download-selected-mappings-btn');
    const selectAllCheckbox = document.getElementById('mappings-select-all');

    listMappingsBtn.addEventListener('click', listWiremockMappings);
    deleteMappingsBtn.addEventListener('click', deleteWiremockMappings);
    resetMappingsBtn.addEventListener('click', resetWiremockMappings);
    baseMappingsBtn.addEventListener('click', loadBaseMappings);
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

    requestsOutput.addEventListener('wheel', (event) => {
        const { scrollTop, clientHeight, scrollHeight } = requestsOutput;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 1;

        if ((event.deltaY > 0 && isAtBottom) || (event.deltaY < 0 && scrollTop === 0)) {
            event.preventDefault();
        }
    });

    // Eventos del modal
    openModalBtn.addEventListener('click', openDownloadMappingsModal);
    closeModalBtn.addEventListener('click', () => {
        document.getElementById('mappings-download-modal').style.display = 'none';
    });
    downloadSelectedBtn.addEventListener('click', downloadSelectedMappings);
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('#mappings-list-container .mapping-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    window.addEventListener('click', (event) => {
        const modal = document.getElementById('mappings-download-modal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });
}