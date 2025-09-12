const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
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

    // If repo parameter is provided, use legacy method
    if (repo) {
      result = await apkManager.getRegistryApkVersions(repo);
    }
    // If client parameter is provided, use client-specific method
    else if (client) {
      result = await apkManager.getClientApkVersions(client);
    }
    // If no parameters, try to get all available versions
    else {
      result = await apkManager.getApkVersions();
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
        message: 'No existe workspace local para esta branch',
      });
    } else if (result.status === 'ready') {
      const modifiedFeatures = workspace.modified.filter(
        (file) =>
          file.includes('/feature/modulos/') && file.endsWith('.feature'),
      );
      res.json({
        exists: true,
        modified_features: modifiedFeatures,
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

// --- Lógica de Workers ---

// Worker management now handled by dedicated modules
// All worker operations use the new modular system

// Socket.io event handling is now managed by SocketIOManager module
// All socket.io functionality has been extracted to src/modules/socketio/socketio-manager.js

// Socket.io authentication and middleware is now handled by SocketIOManager module

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
