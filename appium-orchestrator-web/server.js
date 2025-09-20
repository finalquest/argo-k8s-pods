const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const https = require('https');
const archiver = require('archiver');

// Import security modules
const AuthenticationManager = require('./src/modules/security/authentication');
const ConfigurationManager = require('./src/modules/security/configuration');
const ValidationManager = require('./src/modules/security/validation');

// Import core API modules
const BranchManager = require('./src/modules/core/branch-manager');
const DeviceManager = require('./src/modules/core/device-manager');
const ApkManager = require('./src/modules/core/apk-manager');
const FeatureManager = require('./src/modules/core/feature-manager');
const WorkspaceManager = require('./src/modules/core/workspace-manager');
const StepScannerManager = require('./src/modules/core/step-scanner-manager');
const JsonReferenceScannerManager = require('./src/modules/core/json-reference-scanner-manager');
const InspectorManager = require('./src/modules/core/inspector-manager');

// Import worker management modules
const WorkerPoolManager = require('./src/modules/worker-management/worker-pool-manager');
const JobQueueManager = require('./src/modules/worker-management/job-queue-manager');
const ProcessManager = require('./src/modules/worker-management/process-manager');
const ResourceManager = require('./src/modules/worker-management/resource-manager');
const SocketIOManager = require('./src/modules/socketio/socketio-manager');

// Import services and utils modules
const PathUtilities = require('./src/modules/utils/path-utilities');
const LoggingUtilities = require('./src/modules/utils/logging-utilities');

// Initialize security modules
const configManager = new ConfigurationManager();
const authManager = new AuthenticationManager(configManager);
const validationManager = new ValidationManager();

// Initialize core API modules
const branchManager = new BranchManager(configManager, validationManager);
const deviceManager = new DeviceManager(configManager, validationManager);
const apkManager = new ApkManager(configManager, validationManager);
const featureManager = new FeatureManager(configManager, validationManager);
const workspaceManager = new WorkspaceManager(configManager, validationManager);
const stepScannerManager = new StepScannerManager(
  configManager,
  validationManager,
);
const jsonReferenceScannerManager = new JsonReferenceScannerManager(
  configManager,
  validationManager,
);

// Initialize worker management modules
const processManager = new ProcessManager(configManager, validationManager);
const resourceManager = new ResourceManager(configManager, validationManager);
const jobQueueManager = new JobQueueManager();
const workerPoolManager = new WorkerPoolManager(
  configManager,
  validationManager,
  processManager,
  jobQueueManager,
);

// Initialize inspector manager after workerPoolManager is available
const inspectorManager = new InspectorManager(
  configManager,
  validationManager,
  workerPoolManager,
);

// Set the workerPoolManager reference in jobQueueManager after both are created
jobQueueManager.workerPoolManager = workerPoolManager;

// Initialize socket.io manager
const socketIOManager = new SocketIOManager(
  authManager,
  workerPoolManager,
  jobQueueManager,
  configManager,
  validationManager,
);

// Initialize services and utils modules
const pathUtilities = new PathUtilities(configManager);
const loggingUtilities = new LoggingUtilities(configManager, pathUtilities);

const app = express();
const server = http.createServer(app);

const PORT = configManager.get('PORT');

// Initialize socket.io manager first to get io instance
socketIOManager.initialize(
  server,
  authManager.getSessionMiddleware(),
  authManager.getPassport(),
);
const io = socketIOManager.getIO();

// Initialize worker management modules with dependencies
processManager.initialize(io);
resourceManager.initialize();
jobQueueManager.initialize(io);
workerPoolManager.initialize(io, workspaceManager);

// Apply authentication middleware
authManager.applyMiddleware(app);

// Add configuration endpoint (must be before authentication middleware)
app.get('/api/config', (req, res) => {
  res.json({
    ...configManager.getClientConfig(),
    auth: authManager.getAuthStatus(),
  });
});

app.get('/api/local-devices', async (req, res) => {
  const result = await deviceManager.getLocalDevices();
  if (result.success) {
    res.json(result.devices);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Endpoints de la API ---

app.get('/api/branches', async (req, res) => {
  const result = await branchManager.getBranches();
  if (result.success) {
    res.json(result.branches);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/apk/versions', async (req, res) => {
  const { repo, client } = req.query;

  try {
    let result;

    // If LOCAL_APK_DIRECTORY is defined, use local method (ignore repo parameter)
    if (process.env.LOCAL_APK_DIRECTORY) {
      result = await apkManager.getApkVersions();
    } else if (repo) {
      result = await apkManager.getRegistryApkVersions(repo);
    } else if (client) {
      result = await apkManager.getClientApkVersions(client);
    }

    if (result.success) {
      res.json({ source: result.source, versions: result.versions });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error en /api/apk/versions:', error);
    res
      .status(500)
      .json({ error: 'Error interno al obtener versiones de APK.' });
  }
});

app.get('/api/features', async (req, res) => {
  const { branch, client } = req.query;
  const result = await featureManager.getFeatures(branch, client);
  if (result.success) {
    res.json(result.features);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/history/branches', async (req, res) => {
  const result = await branchManager.getBranchHistory();
  if (result.success) {
    res.json(result.branches.map((b) => b.name));
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/history', async (req, res) => {
  const { branch: branchFilter } = req.query;
  const result = await branchManager.getBranchDetailedHistory(branchFilter);
  if (result.success) {
    res.json(result.history);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/workspace-status/:branch', async (req, res) => {
  const { branch } = req.params;
  const result = await workspaceManager.getWorkspaceStatus(branch);
  if (result.success) {
    const workspace = result.workspace;
    if (result.status === 'not_found') {
      res.json({
        exists: false,
        modified_features: [],
        untracked_features: [],
        message: 'No existe workspace local para esta branch',
      });
    } else if (result.status === 'ready') {
      const modifiedFeatures = workspace.modified.filter(
        (file) =>
          file.includes('/feature/modulos/') && file.endsWith('.feature'),
      );
      const untrackedFeatures = workspace.not_added.filter(
        (file) =>
          file.includes('/feature/modulos/') && file.endsWith('.feature'),
      );
      res.json({
        exists: true,
        modified_features: modifiedFeatures,
        untracked_features: untrackedFeatures,
        message: 'Workspace local existe y está disponible para edición',
      });
    } else {
      res.status(500).json({ error: result.message });
    }
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/feature-content', async (req, res) => {
  const { branch, client, feature } = req.query;
  const result = await featureManager.getFeatureContent(
    branch,
    client,
    feature,
  );
  if (result.success) {
    res.json({
      content: result.content,
      isLocal: result.source === 'persistent',
    });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.post('/api/feature-content', async (req, res) => {
  const { branch, client, feature, content } = req.body;

  const result = await featureManager.saveFeatureContent(
    branch,
    client,
    feature,
    content,
  );

  if (result.success) {
    res.json({ message: result.message });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/commit-status/:branch', async (req, res) => {
  const { branch } = req.params;
  const result = await branchManager.getCommitStatus(branch);
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/workspace-changes/:branch', async (req, res) => {
  const { branch } = req.params;
  const result = await branchManager.getWorkspaceChanges(branch);
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json({ error: result.error });
  }
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/api/wiremock/mappings', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`,
      { agent: httpsAgent },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching mappings from Wiremock:', error);
    res.status(500).json({ error: 'Error fetching mappings from Wiremock' });
  }
});

app.delete('/api/wiremock/mappings', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`,
      {
        method: 'DELETE',
        agent: httpsAgent,
      },
    );
    res.status(response.status).send();
  } catch (error) {
    console.error('Error deleting mappings from Wiremock:', error);
    res.status(500).json({ error: 'Error deleting mappings from Wiremock' });
  }
});

app.post('/api/wiremock/mappings/reset', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/reset`,
      {
        method: 'POST',
        agent: httpsAgent,
      },
    );
    res.status(response.status).send();
  } catch (error) {
    console.error('Error resetting mappings in Wiremock:', error);
    res.status(500).json({ error: 'Error resetting mappings in Wiremock' });
  }
});

app.post('/api/wiremock/mappings/import', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`,
      {
        method: 'POST',
        agent: httpsAgent,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      },
    );
    res.status(response.status).send();
  } catch (error) {
    console.error('Error importing mappings to Wiremock:', error);
    res.status(500).json({ error: 'Error importing mappings to Wiremock' });
  }
});

app.post('/api/wiremock/load-base-mappings', async (req, res) => {
  try {
    const baseMappingsPath = path.join(
      __dirname,
      'public',
      'js',
      'base_mapping.json',
    );
    if (!fs.existsSync(baseMappingsPath)) {
      return res.status(404).json({ error: 'base_mapping.json not found' });
    }
    const mappings = JSON.parse(fs.readFileSync(baseMappingsPath, 'utf8'));

    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`,
      {
        method: 'POST',
        agent: httpsAgent,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappings),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Wiremock import failed with status ${response.status}: ${errorBody}`,
      );
    }

    res.status(200).json({ message: 'Base mappings loaded successfully' });
  } catch (error) {
    console.error('Error loading base mappings to Wiremock:', error);
    res
      .status(500)
      .json({ error: 'Failed to load base mappings', details: error.message });
  }
});

app.get('/api/wiremock/requests', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`,
      { agent: httpsAgent },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching requests from Wiremock:', error);
    res.status(500).json({ error: 'Error fetching requests from Wiremock' });
  }
});

app.delete('/api/wiremock/requests', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`,
      {
        method: 'DELETE',
        agent: httpsAgent,
      },
    );
    res.status(response.status).send();
  } catch (error) {
    console.error('Error deleting requests from Wiremock:', error);
    res.status(500).json({ error: 'Error deleting requests from Wiremock' });
  }
});

app.post('/api/wiremock/recordings/start', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/start`,
      {
        method: 'POST',
        agent: httpsAgent,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetBaseUrl: process.env.WIREMOCK_RECORDING_TARGET_URL,
        }),
      },
    );
    res.status(response.status).send();
  } catch (error) {
    console.error('Error starting recording in Wiremock:', error);
    res.status(500).json({ error: 'Error starting recording in Wiremock' });
  }
});

function splitAndSaveMappings(mappings, recordingName) {
  const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
  const mappingsDir = path.join(baseDir, recordingName);

  if (!fs.existsSync(mappingsDir)) {
    fs.mkdirSync(mappingsDir, { recursive: true });
  }

  const groupedMappings = new Map();

  mappings.forEach((mapping) => {
    const url = mapping.request.url;
    if (!url) return;

    const pathParts = url.split('?')[0].split('/').filter(Boolean);
    if (pathParts.length === 0) return;

    const dirPath = path.join(mappingsDir, ...pathParts.slice(0, -1));
    const fileName = `${pathParts[pathParts.length - 1] || 'index'}.json`;
    const filePath = path.join(dirPath, fileName);

    if (!groupedMappings.has(filePath)) {
      groupedMappings.set(filePath, []);
    }
    groupedMappings.get(filePath).push(mapping);
  });

  let filesCreated = 0;
  groupedMappings.forEach((mappings, filePath) => {
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));
    filesCreated++;
  });

  return { totalMappings: mappings.length, filesCreated };
}

function saveMappingsAsSingleFile(mappings, recordingName) {
  const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
  const filePath = path.join(baseDir, `${recordingName}.json`);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));

  return { totalMappings: mappings.length, filesCreated: 1 };
}

app.post('/api/wiremock/recordings/stop', async (req, res) => {
  try {
    const { recordingName, saveAsSingleFile } = req.body;
    if (!recordingName) {
      return res
        .status(400)
        .json({ error: 'El nombre de la grabación es requerido.' });
    }

    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/stop`,
      {
        method: 'POST',
        agent: httpsAgent,
      },
    );
    const data = await response.json();

    const summary = saveAsSingleFile
      ? saveMappingsAsSingleFile(data.mappings, recordingName)
      : splitAndSaveMappings(data.mappings, recordingName);

    res.json({
      message: `Grabación '${recordingName}' finalizada y mappings guardados.`,
      summary: summary,
    });
  } catch (error) {
    console.error('Error stopping recording in Wiremock:', error);
    res.status(500).json({ error: 'Error stopping recording in Wiremock' });
  }
});

app.get('/api/wiremock/recordings/status', async (req, res) => {
  try {
    const response = await fetch(
      `${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/status`,
      { agent: httpsAgent },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching recording status from Wiremock:', error);
    res
      .status(500)
      .json({ error: 'Error fetching recording status from Wiremock' });
  }
});

app.get('/api/mappings/list', (req, res) => {
  const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');
  if (!fs.existsSync(mappingsDir)) {
    return res.json([]);
  }
  try {
    const files = fs.readdirSync(mappingsDir);
    res.json(files);
  } catch (error) {
    console.error('Error listing mappings:', error);
    res.status(500).json({ error: 'Error listing mappings' });
  }
});

app.get('/api/mappings/download/:name', (req, res) => {
  const name = req.params.name;
  const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');
  const fullPath = path.join(mappingsDir, name);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('Mapping not found');
  }

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`${name}.zip`);
    archive.pipe(res);
    archive.directory(fullPath, false);
    archive.finalize();
  } else {
    res.download(fullPath); // Sirve el archivo directamente
  }
});

app.post('/api/mappings/download-batch', (req, res) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names) || names.length === 0) {
    return res
      .status(400)
      .json({ error: 'Se requiere un array de nombres de mappings.' });
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');

  res.attachment('mappings-batch.zip');
  archive.pipe(res);

  names.forEach((name) => {
    const fullPath = path.join(mappingsDir, name);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        archive.directory(fullPath, name);
      } else {
        archive.file(fullPath, { name });
      }
    }
  });

  archive.finalize();
});

// Step Scanner API Endpoints
app.get('/api/steps/scan', async (req, res) => {
  const { branch } = req.query;

  if (!branch) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro branch es requerido',
      code: 'MISSING_BRANCH',
    });
  }

  try {
    const result = await stepScannerManager.scanSteps(branch);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'WORKSPACE_NOT_EXISTS' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error en /api/steps/scan:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.get('/api/steps/status', async (req, res) => {
  const { branch } = req.query;

  if (!branch) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro branch es requerido',
      code: 'MISSING_BRANCH',
    });
  }

  try {
    const result = await stepScannerManager.getStatus(branch);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/steps/status:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.post('/api/steps/cache/clear', async (req, res) => {
  const { branch } = req.body;

  try {
    const result = await stepScannerManager.clearCache(branch);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/steps/cache/clear:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

// JSON Reference Scanner API Endpoints
app.get('/api/json-references/scan', async (req, res) => {
  const { branch, forceRefresh } = req.query;
  if (!branch) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro branch es requerido',
      code: 'MISSING_BRANCH',
    });
  }
  try {
    const forceRefreshBool = forceRefresh === 'true' || forceRefresh === '1';
    const result = await jsonReferenceScannerManager.scanJsonReferences(
      branch,
      forceRefreshBool,
    );
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'WORKSPACE_NOT_EXISTS' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error en /api/json-references/scan:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.get('/api/json-references/status', async (req, res) => {
  const { branch } = req.query;
  if (!branch) {
    return res.status(400).json({
      success: false,
      error: 'El parámetro branch es requerido',
      code: 'MISSING_BRANCH',
    });
  }
  try {
    const result = await jsonReferenceScannerManager.getStatus(branch);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/json-references/status:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

app.post('/api/json-references/cache/clear', async (req, res) => {
  const { branch } = req.body;
  try {
    const result = await jsonReferenceScannerManager.clearCache(branch);
    res.json(result);
  } catch (error) {
    console.error('Error en /api/json-references/cache/clear:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

// --- Lógica de Workers ---

// Worker management now handled by dedicated modules
// All worker operations use the new modular system

// Socket.io event handling is now managed by SocketIOManager module
// All socket.io functionality has been extracted to src/modules/socketio/socketio-manager.js

// Socket.io authentication and middleware is now handled by SocketIOManager module

// ===== INSPECTOR API ENDPOINTS =====

// Get inspector health and available sessions
app.get('/api/inspector/health', (req, res) => {
  try {
    const health = inspectorManager.getHealth();
    res.json(health);
  } catch (error) {
    console.error('[INSPECTOR] Health check failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all active Appium sessions
app.get('/api/inspector/sessions', (req, res) => {
  try {
    const sessions = inspectorManager.getActiveSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('[INSPECTOR] Failed to get sessions:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Attach inspector to a session
app.post('/api/inspector/:sessionId/attach', async (req, res) => {
  try {
    const result = await inspectorManager.attachToSession(req.params.sessionId);

    if (result.success) {
      // Emit socket event for real-time updates
      io.emit('inspector_session_attached', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Attach failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Detach inspector from session
app.post('/api/inspector/:sessionId/detach', async (req, res) => {
  try {
    const result = await inspectorManager.detachFromSession(
      req.params.sessionId,
    );

    if (result.success) {
      io.emit('inspector_session_detached', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Detach failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get UI elements from session
app.get('/api/inspector/:sessionId/inspect', async (req, res) => {
  try {
    const options = {
      q: req.query.q,
      clickableOnly: req.query.clickableOnly === 'true',
      maxElements: req.query.maxElements
        ? parseInt(req.query.maxElements)
        : null,
    };

    const result = await inspectorManager.getElements(
      req.params.sessionId,
      options,
    );

    if (result.success) {
      io.emit('inspector_elements_updated', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Inspect failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get raw XML from session for debugging
app.get('/api/inspector/:sessionId/xml', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    console.log(`[INSPECTOR] XML capture requested for session ${sessionId}`);

    // Find the session in activeSessions
    const session = inspectorManager.activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get XML source from Appium
    const source = await session.client.getPageSource();

    // Log XML info for debugging
    console.log(`[INSPECTOR] Captured XML for session ${sessionId}:`, {
      length: source.length,
      preview: source.substring(0, 200) + '...'
    });

    // Save XML to file for offline debugging
    // const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `debug-xml-${sessionId}-${timestamp}.xml`;
    const filepath = path.join(__dirname, 'debug-xml', filename);

    // Create debug-xml directory if it doesn't exist
    // if (!fs.existsSync(path.join(__dirname, 'debug-xml'))) {
    //   fs.mkdirSync(path.join(__dirname, 'debug-xml'), { recursive: true });
    // }

    // Save XML to file
    // fs.writeFileSync(filepath, source);
    // console.log(`[INSPECTOR] XML saved to ${filepath}`);

    res.json({
      success: true,
      sessionId,
      xmlLength: source.length,
      filename,
      filepath,
      preview: source.substring(0, 1000) + '...',
      xml: source // Return full XML as well
    });
  } catch (error) {
    console.error('[INSPECTOR] XML capture failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get screenshot from session
app.get('/api/inspector/:sessionId/screenshot', async (req, res) => {
  try {
    const result = await inspectorManager.getScreenshot(req.params.sessionId);

    if (result.success) {
      io.emit('inspector_screenshot_updated', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Screenshot failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate overlay with element boundaries
app.get('/api/inspector/:sessionId/overlay', async (req, res) => {
  try {
    const elementIds = req.query.elements
      ? req.query.elements.split(',')
      : null;
    const result = await inspectorManager.generateOverlay(
      req.params.sessionId,
      elementIds,
    );

    if (result.success) {
      // Send as image response
      res.set('Content-Type', 'image/png');
      res.send(Buffer.from(result.overlay, 'base64'));
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('[INSPECTOR] Overlay failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Tap on specific coordinates
app.post('/api/inspector/:sessionId/tap', async (req, res) => {
  try {
    const { x, y } = req.body;

    if (typeof x !== 'number' || typeof y !== 'number') {
      return res
        .status(400)
        .json({ error: 'Coordinates x and y are required' });
    }

    const result = await inspectorManager.tapCoordinates(
      req.params.sessionId,
      x,
      y,
    );

    if (result.success) {
      io.emit('inspector_tap_executed', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Tap failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Type text in specific element
app.post('/api/inspector/:sessionId/type', async (req, res) => {
  try {
    const { locators = [], locatorType, locatorValue, text } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Text payload is required',
        code: 'MISSING_TEXT',
      });
    }

    const result = await inspectorManager.typeText(
      req.params.sessionId,
      locators,
      locatorType,
      locatorValue,
      text,
    );

    if (result.success) {
      io.emit('inspector_text_entered', result);
    }

    res.json(result);
  } catch (error) {
    console.error('[INSPECTOR] Type text failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Worker Management Endpoints
app.post('/api/workers', async (req, res) => {
  try {
    const {
      branch,
      client,
      apkVersion,
      apkSourceType = 'registry',
      deviceSerial = null,
      quickTest = false,
      persistent = false
    } = req.body;

    // Validate required fields
    if (!branch || !client || !apkVersion) {
      return res.status(400).json({
        error: 'Missing required fields: branch, client, apkVersion'
      });
    }

    // Determine APK source type based on apkVersion format
    let finalApkSourceType = apkSourceType;
    let finalApkIdentifier = apkVersion;

    // If apkVersion is a path, treat it as local APK
    if (apkVersion.includes('/') || apkVersion.includes('\\')) {
      finalApkSourceType = 'local';
      finalApkIdentifier = apkVersion;
    }

    // Create worker without an associated job
    const worker = workerPoolManager.createWorker(
      branch,
      client,
      finalApkIdentifier,
      finalApkSourceType,
      deviceSerial,
      quickTest,
      persistent
    );

    // Return worker creation response
    res.json({
      success: true,
      workerId: worker.id,
      message: `Worker creado para ${client}/${branch} con APK ${finalApkIdentifier}`,
      worker: {
        id: worker.id,
        slotId: worker.id,
        branch: worker.branch,
        client: worker.client,
        apkIdentifier: worker.apkIdentifier,
        apkSourceType: worker.apkSourceType,
        deviceSerial: worker.deviceSerial,
        status: worker.status,
        quickTest: worker.quickTest,
        persistent: worker.persistent
      }
    });

    console.log(`[API] Worker ${worker.id} created for ${client}/${branch} - APK: ${finalApkIdentifier}`);
  } catch (error) {
    console.error('[API] Error creating worker:', error);
    res.status(500).json({
      error: error.message || 'Error creating worker'
    });
  }
});

app.get('/api/workers', (req, res) => {
  try {
    const workers = workerPoolManager.getWorkers().map(worker => ({
      id: worker.id,
      slotId: worker.id,
      branch: worker.branch,
      client: worker.client,
      apkIdentifier: worker.apkIdentifier,
      apkSourceType: worker.apkSourceType,
      deviceSerial: worker.deviceSerial,
      status: worker.status,
      currentJob: worker.currentJob ? {
        id: worker.currentJob.id,
        feature: worker.currentJob.feature
      } : null,
      quickTest: worker.quickTest,
      appiumSessionId: worker.appiumSessionId || null,
      persistent: worker.persistent
    }));

    res.json({
      success: true,
      workers,
      total: workers.length,
      stats: workerPoolManager.getStatistics()
    });
  } catch (error) {
    console.error('[API] Error getting workers:', error);
    res.status(500).json({
      error: error.message || 'Error getting workers'
    });
  }
});

app.delete('/api/workers/:workerId', (req, res) => {
  try {
    const { workerId } = req.params;
    const worker = workerPoolManager.getWorkerById(parseInt(workerId));

    if (!worker) {
      return res.status(404).json({
        error: `Worker ${workerId} not found`
      });
    }

    workerPoolManager.terminateWorker(parseInt(workerId));

    res.json({
      success: true,
      message: `Worker ${workerId} terminated`,
      workerId: parseInt(workerId)
    });

    console.log(`[API] Worker ${workerId} terminated`);
  } catch (error) {
    console.error('[API] Error terminating worker:', error);
    res.status(500).json({
      error: error.message || 'Error terminating worker'
    });
  }
});

// Cleanup stale sessions (periodic maintenance)
setInterval(
  async () => {
    try {
      await inspectorManager.cleanupStaleSessions();
    } catch (error) {
      console.error('[INSPECTOR] Cleanup failed:', error.message);
    }
  },
  5 * 60 * 1000,
); // Every 5 minutes

server.listen(PORT, () => {
  loggingUtilities.logStartup(PORT);

  // Display authentication mode
  if (authManager.isDevelopmentMode()) {
    console.log('🔓 MODO DESARROLLO: Autenticación deshabilitada');
    console.log(
      '   Para habilitar autenticación, configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET',
    );
  } else {
    console.log('🔒 MODO PRODUCCIÓN: Autenticación habilitada');
  }
});
