# Features - Integración WireMock

## 📋 Visión General

La integración WireMock permite gestionar servidores mock para simular respuestas HTTP durante las pruebas. Esta feature es fundamental para realizar pruebas aisladas y consistentes sin depender de servicios externos. El sistema proporciona una interfaz completa para gestionar mappings, grabar solicitudes, y monitorear el tráfico en tiempo real.

## 🏗️ Arquitectura de WireMock

### 1. Componentes Principales

```javascript
// Estructura de módulos WireMock
const WireMockModule = {
  mappings: {
    list: '/api/wiremock/mappings',
    create: '/api/wiremock/mappings',
    delete: '/api/wiremock/mappings',
    reset: '/api/wiremock/mappings/reset',
    import: '/api/wiremock/mappings/import',
  },
  requests: {
    list: '/api/wiremock/requests',
    delete: '/api/wiremock/requests',
    live: '/api/wiremock/requests/live',
  },
  recordings: {
    start: '/api/wiremock/recordings/start',
    stop: '/api/wiremock/recordings/stop',
    status: '/api/wiremock/recordings/status',
  },
  storage: {
    list: '/api/mappings/list',
    download: '/api/mappings/download/:name',
    downloadBatch: '/api/mappings/download-batch',
  },
};
```

### 2. Estados del Sistema

```javascript
// Estados de grabación
const RECORDING_STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  ERROR: 'error',
};

// Estados de mappings
const MAPPING_STATES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft',
};
```

## 🔧 Gestión de Mappings

### 1. Listado de Mappings

```javascript
// public/js/wiremock.js - Listado de mappings
export async function listWiremockMappings() {
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
```

### 2. Eliminación de Mappings

```javascript
// public/js/wiremock.js - Eliminación con confirmación
export async function deleteWiremockMappings() {
  if (!confirm('¿Estás seguro de que quieres eliminar todos los mappings?')) {
    return;
  }

  const output = document.getElementById('wiremock-mappings-output');
  output.textContent = 'Eliminando...';

  try {
    const response = await fetch('/api/wiremock/mappings', {
      method: 'DELETE',
    });

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
```

### 3. Reset de Mappings

```javascript
// public/js/wiremock.js - Reset a estado por defecto
export async function resetWiremockMappings() {
  if (
    !confirm(
      '¿Estás seguro de que quieres resetear los mappings a su estado por defecto?',
    )
  ) {
    return;
  }

  const output = document.getElementById('wiremock-mappings-output');
  output.textContent = 'Reseteando...';

  try {
    const response = await fetch('/api/wiremock/mappings/reset', {
      method: 'POST',
    });

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
```

## 📤 Importación y Exportación

### 1. Carga de Base Mappings

```javascript
// public/js/wiremock.js - Carga de mappings base
export async function loadBaseMappings() {
  if (
    !confirm(
      '¿Estás seguro de que quieres cargar los base mappings? Esto reemplazará los mappings actuales.',
    )
  ) {
    return;
  }

  const output = document.getElementById('wiremock-mappings-output');
  output.textContent = 'Cargando base mappings...';

  try {
    // Cargar archivo base
    const baseMappingResp = await fetch('/js/base_mapping.json');
    if (!baseMappingResp.ok) {
      throw new Error(
        `No se pudo cargar /js/base_mapping.json: ${baseMappingResp.statusText}`,
      );
    }
    const mappings = await baseMappingResp.json();

    // Importar mappings
    const importResp = await fetch('/api/wiremock/mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappings),
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
```

### 2. Importación Personalizada

```javascript
// public/js/wiremock.js - Importación desde JSON
export async function importWiremockMappings() {
  const importTextarea = document.getElementById('wiremock-import-textarea');
  const mappingsJson = importTextarea.value;

  if (!mappingsJson) {
    alert('Por favor, pega el JSON de los mappings en el área de texto.');
    return;
  }

  let mappings;
  try {
    mappings = JSON.parse(mappingsJson);
  } catch {
    alert('El texto introducido no es un JSON válido.');
    return;
  }

  const output = document.getElementById('wiremock-mappings-output');
  output.textContent = 'Importando...';

  try {
    const response = await fetch('/api/wiremock/mappings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappings),
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
```

### 3. Manejo de Archivos

```javascript
// public/js/wiremock.js - Upload de archivos
export function handleMappingsFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('wiremock-import-textarea').value = e.target.result;
  };
  reader.readAsText(file);
}
```

## 🔍 Monitoreo de Solicitudes

### 1. Listado de Solicitudes

```javascript
// public/js/wiremock.js - Listado con renderizado dinámico
export async function listWiremockRequests() {
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
        details.style.display =
          details.style.display === 'block' ? 'none' : 'block';
      };

      entry.appendChild(summary);
      entry.appendChild(details);
      return entry;
    };

    if (isFirstLoad) {
      output.innerHTML = '';
      newRequests.forEach((req) => {
        output.appendChild(renderRequest(req));
      });
    } else {
      const lastKnownIds = new Set(lastKnownRequests.map((r) => r.id));
      const requestsToAdd = newRequests.filter((r) => !lastKnownIds.has(r.id));

      if (requestsToAdd.length > 0) {
        requestsToAdd.reverse().forEach((req) => {
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
```

### 2. Vista en Vivo

```javascript
// public/js/wiremock.js - Monitoreo en tiempo real
let wiremockLiveViewInterval = null;

export function startLiveView() {
  if (wiremockLiveViewInterval) return;

  lastKnownRequests = [];
  const output = document.getElementById('wiremock-requests-output');
  output.textContent = '';

  listWiremockRequests();
  wiremockLiveViewInterval = setInterval(listWiremockRequests, 2000);
}

export function stopLiveView() {
  if (wiremockLiveViewInterval) {
    clearInterval(wiremockLiveViewInterval);
    wiremockLiveViewInterval = null;
  }
}
```

## 🎥 Sistema de Grabación

### 1. Iniciar Grabación

```javascript
// public/js/wiremock.js - Inicio de grabación
export async function startWiremockRecording() {
  const output = document.getElementById('wiremock-recording-output');
  output.textContent = 'Iniciando grabación...';

  try {
    const response = await fetch('/api/wiremock/recordings/start', {
      method: 'POST',
    });

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
```

### 2. Detener Grabación

```javascript
// public/js/wiremock.js - Detención y procesamiento
export async function stopWiremockRecording() {
  const recordingName = document.getElementById(
    'wiremock-recording-name',
  ).value;

  if (!recordingName) {
    alert('Por favor, introduce un nombre para la grabación.');
    return;
  }

  const saveAsSingleFile = document.getElementById(
    'wiremock-save-as-single-file',
  ).checked;

  const output = document.getElementById('wiremock-recording-output');
  output.textContent = 'Deteniendo grabación y procesando mappings...';

  try {
    const response = await fetch('/api/wiremock/recordings/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingName, saveAsSingleFile }),
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
```

### 3. Estado de Grabación

```javascript
// public/js/wiremock.js - Consulta de estado
export async function getWiremockRecordingStatus() {
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
```

## 💾 Gestión de Almacenamiento

### 1. Modal de Descarga

```javascript
// public/js/wiremock.js - Gestión de descargas
export async function openDownloadMappingsModal() {
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

    container.innerHTML = files
      .map(
        (file) => `
            <div class="mapping-item">
                <label class="mapping-item-label">
                    <input type="checkbox" class="mapping-checkbox" value="${file}">
                    ${file}
                </label>
                <a href="/api/mappings/download/${file}" class="download-single-btn">Descargar</a>
            </div>
        `,
      )
      .join('');
  } catch (error) {
    container.innerHTML = `<p style="color: red;">Error al cargar la lista: ${error.message}</p>`;
  }
}
```

### 2. Descarga Seleccionada

```javascript
// public/js/wiremock.js - Descarga batch
export async function downloadSelectedMappings() {
  const selected = document.querySelectorAll(
    '#mappings-list-container .mapping-checkbox:checked',
  );

  if (selected.length === 0) {
    alert('Por favor, selecciona al menos un mapping para descargar.');
    return;
  }

  const names = Array.from(selected).map((cb) => cb.value);
  const btn = document.getElementById('download-selected-mappings-btn');
  btn.textContent = 'Descargando...';
  btn.disabled = true;

  try {
    const response = await fetch('/api/mappings/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
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
```

## 🎛️ Inicialización y Eventos

### 1. Configuración de Eventos

```javascript
// public/js/wiremock.js - Inicialización completa
export function initializeWiremockTab() {
  // Botones de mappings
  const listMappingsBtn = document.getElementById('wiremock-list-mappings-btn');
  const deleteMappingsBtn = document.getElementById(
    'wiremock-delete-mappings-btn',
  );
  const resetMappingsBtn = document.getElementById(
    'wiremock-reset-mappings-btn',
  );
  const baseMappingsBtn = document.getElementById('wiremock-base-mappings-btn');
  const importMappingsBtn = document.getElementById(
    'wiremock-import-mappings-btn',
  );
  const uploadMappingsBtn = document.getElementById(
    'wiremock-upload-mappings-btn',
  );
  const uploadInput = document.getElementById('wiremock-upload-input');

  // Botones de requests
  const listRequestsBtn = document.getElementById('wiremock-list-requests-btn');
  const deleteRequestsBtn = document.getElementById(
    'wiremock-delete-requests-btn',
  );

  // Botones de recording
  const startRecordingBtn = document.getElementById(
    'wiremock-start-recording-btn',
  );
  const stopRecordingBtn = document.getElementById(
    'wiremock-stop-recording-btn',
  );
  const statusRecordingBtn = document.getElementById(
    'wiremock-status-recording-btn',
  );

  // Live view toggle
  const liveViewToggle = document.getElementById('wiremock-live-view-toggle');
  const requestsOutput = document.getElementById('wiremock-requests-output');

  // Modal de descarga
  const openModalBtn = document.getElementById(
    'open-mappings-download-modal-btn',
  );
  const closeModalBtn = document.querySelector(
    '#mappings-download-modal .close-btn',
  );
  const downloadSelectedBtn = document.getElementById(
    'download-selected-mappings-btn',
  );
  const selectAllCheckbox = document.getElementById('mappings-select-all');

  // Asignar event listeners
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

  // Live view toggle
  liveViewToggle.addEventListener('change', () => {
    if (liveViewToggle.checked) {
      startLiveView();
    } else {
      stopLiveView();
    }
  });

  // Prevenir scroll overflow en live view
  requestsOutput.addEventListener('wheel', (event) => {
    const { scrollTop, clientHeight, scrollHeight } = requestsOutput;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 1;

    if (
      (event.deltaY > 0 && isAtBottom) ||
      (event.deltaY < 0 && scrollTop === 0)
    ) {
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
    document
      .querySelectorAll('#mappings-list-container .mapping-checkbox')
      .forEach((cb) => {
        cb.checked = e.target.checked;
      });
  });

  // Cerrar modal al hacer clic fuera
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('mappings-download-modal');
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
}
```

## 🎨 UI y Experiencia de Usuario

### 1. Estados Visuales

```css
/* public/css/styles.css - Estilos WireMock */
.log-entry {
  border: 1px solid #ddd;
  margin: 5px 0;
  border-radius: 4px;
}

.log-summary {
  padding: 10px;
  background: #f5f5f5;
  cursor: pointer;
  font-weight: bold;
}

.log-summary:hover {
  background: #e8e8e8;
}

.log-details {
  padding: 10px;
  background: #fafafa;
  border-top: 1px solid #ddd;
  display: none;
}

.new-request-highlight {
  animation: highlightNew 2s ease-in-out;
}

@keyframes highlightNew {
  0% {
    background-color: #d4edda;
  }
  100% {
    background-color: transparent;
  }
}

.mapping-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border: 1px solid #ddd;
  margin: 5px 0;
  border-radius: 4px;
}

.mapping-item-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-single-btn {
  background: #007bff;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  text-decoration: none;
  font-size: 12px;
}

.download-single-btn:hover {
  background: #0056b3;
}
```

### 2. Manejo de Estados

```javascript
// public/js/wiremock.js - Gestión de estados UI
function updateWiremockUIState(component, state) {
  switch (component) {
    case 'mappings':
      updateMappingsState(state);
      break;
    case 'requests':
      updateRequestsState(state);
      break;
    case 'recording':
      updateRecordingState(state);
      break;
  }
}

function updateMappingsState(state) {
  const output = document.getElementById('wiremock-mappings-output');
  const buttons = [
    'wiremock-delete-mappings-btn',
    'wiremock-reset-mappings-btn',
    'wiremock-import-mappings-btn',
  ];

  buttons.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    btn.disabled = state === 'loading';
  });
}

function updateRecordingState(state) {
  const startBtn = document.getElementById('wiremock-start-recording-btn');
  const stopBtn = document.getElementById('wiremock-stop-recording-btn');

  switch (state) {
    case 'recording':
      startBtn.disabled = true;
      stopBtn.disabled = false;
      break;
    case 'idle':
      startBtn.disabled = false;
      stopBtn.disabled = true;
      break;
  }
}
```

## 🔧 Backend - API Endpoints

### 1. Endpoints de Mappings

```javascript
// server.js - API de WireMock mappings
// Listar mappings
app.get('/api/wiremock/mappings', requireAuth, async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_URL}/__admin/mappings`,
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting WireMock mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Importar mappings
app.post('/api/wiremock/mappings/import', requireAuth, async (req, res) => {
  try {
    const mappings = req.body;
    const response = await fetch(
      `${process.env.WIREMOCK_URL}/__admin/mappings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappings),
      },
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error importing WireMock mappings:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Endpoints de Grabación

```javascript
// server.js - API de recordings
app.post('/api/wiremock/recordings/start', requireAuth, async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_URL}/__admin/recordings/start`,
      {
        method: 'POST',
      },
    );

    if (response.ok) {
      res.json({ message: 'Recording started successfully' });
    } else {
      const errorText = await response.text();
      res.status(500).json({ error: errorText });
    }
  } catch (error) {
    console.error('Error starting WireMock recording:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wiremock/recordings/stop', requireAuth, async (req, res) => {
  try {
    const { recordingName, saveAsSingleFile } = req.body;

    const response = await fetch(
      `${process.env.WIREMOCK_URL}/__admin/recordings/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputFormat: saveAsSingleFile ? 'single' : 'list',
        }),
      },
    );

    const data = await response.json();

    // Guardar mappings si se proporcionó nombre
    if (recordingName && data.mappings) {
      await saveMappings(recordingName, data.mappings);
    }

    res.json({
      message: 'Recording stopped successfully',
      summary: {
        mappingsCount: data.mappings?.length || 0,
        recordingName,
      },
    });
  } catch (error) {
    console.error('Error stopping WireMock recording:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 🛡️ Seguridad y Validaciones

### 1. Validación de Mappings

```javascript
// server.js - Validaciones de seguridad
function validateWireMockMapping(mapping) {
  // Validar estructura básica
  if (!mapping.request || !mapping.response) {
    throw new Error('Mapping must contain request and response objects');
  }

  // Validar URL
  if (!mapping.request.url || !mapping.request.method) {
    throw new Error('Mapping must specify URL and method');
  }

  // Validar que no haya patrones peligrosos
  const dangerousPatterns = [
    /\$\{.*\}/, // Expresiones que podrían ser inyección
    /javascript:/, // Protocolos peligrosos
    /file:\/\//, // Acceso a archivos locales
  ];

  const urlStr = mapping.request.url.toString();
  for (const pattern of dangerousPatterns) {
    if (pattern.test(urlStr)) {
      throw new Error('Invalid URL pattern in mapping');
    }
  }

  return true;
}
```

### 2. Control de Acceso

```javascript
// server.js - Middleware de autorización WireMock
const requireWireMockAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verificar permisos de WireMock
  if (!req.user.permissions?.includes('wiremock')) {
    return res.status(403).json({ error: 'WireMock access denied' });
  }

  next();
};
```

## 📊 Monitoreo y Métricas

### 1. Estadísticas de Uso

```javascript
// server.js - Métricas de WireMock
const wireMockMetrics = {
  totalRequests: 0,
  totalMappings: 0,
  recordingsCount: 0,
  activeRecordings: new Set(),
};

// Middleware para métricas
app.use('/api/wiremock/*', (req, res, next) => {
  if (req.path.includes('/requests')) {
    wireMockMetrics.totalRequests++;
  }
  next();
});
```

### 2. Health Check

```javascript
// server.js - Health check de WireMock
app.get('/api/wiremock/health', async (req, res) => {
  try {
    const response = await fetch(`${process.env.WIREMOCK_URL}/__admin/`);

    if (response.ok) {
      res.json({
        status: 'healthy',
        url: process.env.WIREMOCK_URL,
        timestamp: Date.now(),
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        error: 'WireMock service unavailable',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

## 📖 Documentos Relacionados

- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
- [03-frontend/01-module-overview.md](../03-frontend/01-module-overview.md) - Módulos del frontend
- [04-features/01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [04-features/03-git-integration.md](./03-git-integration.md) - Integración Git
