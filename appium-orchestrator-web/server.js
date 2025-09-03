const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { fork, exec } = require('child_process');
const fetch = require('node-fetch');
const https = require('https');
const archiver = require('archiver');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const { GIT_REPO_URL, GIT_USER, GIT_PAT } = process.env;
if (!GIT_REPO_URL || !GIT_USER || !GIT_PAT) {
    console.error('Error: Debes definir GIT_REPO_URL, GIT_USER y GIT_PAT en el archivo .env');
    process.exit(1);
}

const getAuthenticatedUrl = () => {
    try {
        const url = new URL(GIT_REPO_URL);
        url.username = GIT_USER;
        url.password = GIT_PAT;
        return url.toString();
    } catch (error) {
        console.error('La GIT_REPO_URL no es una URL válida.');
        process.exit(1);
    }
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Endpoints de la API ---

app.get('/api/branches', async (req, res) => {
  try {
    const git = simpleGit();
    const authenticatedUrl = getAuthenticatedUrl();
    const remoteInfo = await git.listRemote(['--heads', authenticatedUrl]);
    if (!remoteInfo) {
        return res.status(500).json({ error: 'No se pudo obtener información del repositorio.' });
    }
    const branches = remoteInfo.split('\n').filter(Boolean).map(line => {
        const parts = line.split('/');
        return parts[parts.length - 1];
    });
    res.json(branches);
  } catch (error) {
    console.error('Error al listar branches:', error);
    res.status(500).json({ error: 'Error interno al listar branches. Revisa la URL del repo y el PAT.' });
  }
});

app.get('/api/apk/versions', (req, res) => {
    // Modo 1: Directorio Local de APKs
    if (process.env.LOCAL_APK_DIRECTORY) {
        const apkDir = process.env.LOCAL_APK_DIRECTORY;
        if (!fs.existsSync(apkDir)) {
            console.error(`El directorio de APKs locales especificado no existe: ${apkDir}`);
            return res.status(500).json({ error: 'El directorio de APKs locales no existe.' });
        }
        try {
            const files = fs.readdirSync(apkDir);
            const apkFiles = files.filter(file => path.extname(file).toLowerCase() === '.apk');
            return res.json({ source: 'local', versions: apkFiles });
        } catch (error) {
            console.error(`Error al leer el directorio de APKs locales: ${error.message}`);
            return res.status(500).json({ error: 'Error al leer el directorio de APKs locales.' });
        }
    }

    // Modo 2: Registro ORAS (comportamiento anterior)
    const { repo } = req.query;
    if (!repo) {
        return res.status(400).json({ error: 'Se requiere el parámetro \'repo\'.' });
    }

    const sanitizedRepo = repo.replace(/[^a-zA-Z0-9_\-\/.]/g, '');
    if (sanitizedRepo !== repo) {
        return res.status(400).json({ error: 'Parámetro \'repo\' contiene caracteres inválidos.' });
    }

    const command = `oras repo tags harbor:8080/${sanitizedRepo} --plain-http`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al ejecutar oras: ${error.message}`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ error: 'Error al obtener las versiones del APK.', details: stderr });
        }
        
        const versions = stdout.trim().split('\n').filter(Boolean);
        res.json({ source: 'registry', versions: versions });
    });
});

app.get('/api/features', async (req, res) => {
    const { branch, client } = req.query;
    if (!branch || !client) {
        return res.status(400).json({ error: 'Se requieren los parámetros \'branch\' y \'client\'.' });
    }
    const tmpDir = path.join(os.tmpdir(), `appium-features-${crypto.randomBytes(16).toString('hex')}`);
    const authenticatedUrl = getAuthenticatedUrl();
    try {
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const git = simpleGit(tmpDir);
        await git.clone(authenticatedUrl, tmpDir, ['--branch', branch, '--depth', '1', '--no-checkout']);
        const featureDirForCheckout = path.join('test', 'features', client, 'feature');
        await git.checkout(branch, ['--', featureDirForCheckout]);
        const featuresPath = path.join(tmpDir, featureDirForCheckout);
        if (!fs.existsSync(featuresPath)) {
            return res.json([]);
        }
        const allEntries = await fs.promises.readdir(featuresPath, { withFileTypes: true });
        const featureFiles = allEntries
            .filter(dirent => dirent.isFile() && dirent.name.endsWith('.feature'))
            .map(dirent => dirent.name.replace(/\.feature$/, ''));
        res.json(featureFiles);
    } catch (error) {
        console.error(`Error al listar features para la branch '${branch}':`, error);
        res.status(500).json({ error: 'Error interno al listar features.' });
    } finally {
        if (fs.existsSync(tmpDir)) {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        }
    }
});

app.get('/api/history/branches', (req, res) => {
    const reportsDir = path.join(__dirname, 'public', 'reports');
    if (!fs.existsSync(reportsDir)) {
        return res.json([]);
    }
    try {
        const branches = fs.readdirSync(reportsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        res.json(branches);
    } catch (error) {
        console.error('Error al leer las branches del historial:', error);
        res.status(500).json({ error: 'Error interno al leer las branches del historial.' });
    }
});

app.get('/api/history', (req, res) => {
    const { branch: branchFilter } = req.query;
    const reportsDir = path.join(__dirname, 'public', 'reports');
    if (!fs.existsSync(reportsDir)) {
        return res.json([]);
    }

    try {
        const history = [];
        const branches = fs.readdirSync(reportsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const branch of branches) {
            if (branchFilter && branch !== branchFilter) {
                continue;
            }
            const branchPath = path.join(reportsDir, branch);
            const features = fs.readdirSync(branchPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const feature of features) {
                const featurePath = path.join(branchPath, feature);
                const timestamps = fs.readdirSync(featurePath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                for (const timestamp of timestamps) {
                    history.push({
                        branch: branch,
                        feature: feature,
                        timestamp: timestamp,
                        reportUrl: `/reports/${branch}/${feature}/${timestamp}/`
                    });
                }
            }
        }
        history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        res.json(history);
    } catch (error) {
        console.error('Error al leer el historial de reportes:', error);
        res.status(500).json({ error: 'Error interno al leer el historial.' });
    }
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get('/api/wiremock/mappings', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching mappings from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching mappings from Wiremock' });
    }
});

app.delete('/api/wiremock/mappings', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings`, { 
            method: 'DELETE',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error deleting mappings from Wiremock:', error);
        res.status(500).json({ error: 'Error deleting mappings from Wiremock' });
    }
});

app.post('/api/wiremock/mappings/reset', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/reset`, { 
            method: 'POST',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error resetting mappings in Wiremock:', error);
        res.status(500).json({ error: 'Error resetting mappings in Wiremock' });
    }
});

app.post('/api/wiremock/mappings/import', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error importing mappings to Wiremock:', error);
        res.status(500).json({ error: 'Error importing mappings to Wiremock' });
    }
});

app.post('/api/wiremock/load-base-mappings', async (req, res) => {
    try {
        const baseMappingsPath = path.join(__dirname, 'public', 'js', 'base_mapping.json');
        if (!fs.existsSync(baseMappingsPath)) {
            return res.status(404).json({ error: 'base_mapping.json not found' });
        }
        const mappings = JSON.parse(fs.readFileSync(baseMappingsPath, 'utf8'));
        
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/mappings/import`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappings)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Wiremock import failed with status ${response.status}: ${errorBody}`);
        }

        res.status(200).json({ message: 'Base mappings loaded successfully' });
    } catch (error) {
        console.error('Error loading base mappings to Wiremock:', error);
        res.status(500).json({ error: 'Failed to load base mappings', details: error.message });
    }
});

app.get('/api/wiremock/requests', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching requests from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching requests from Wiremock' });
    }
});

app.delete('/api/wiremock/requests', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/requests`, { 
            method: 'DELETE',
            agent: httpsAgent 
        });
        res.status(response.status).send();
    } catch (error) {
        console.error('Error deleting requests from Wiremock:', error);
        res.status(500).json({ error: 'Error deleting requests from Wiremock' });
    }
});

app.post('/api/wiremock/recordings/start', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/start`, { 
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetBaseUrl: process.env.WIREMOCK_RECORDING_TARGET_URL })
        });
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

    mappings.forEach(mapping => {
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
    console.log('--- DEBUG: /api/wiremock/recordings/stop ---');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    try {
        const { recordingName, saveAsSingleFile } = req.body;
        if (!recordingName) {
            return res.status(400).json({ error: 'El nombre de la grabación es requerido.' });
        }

        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/stop`, { 
            method: 'POST',
            agent: httpsAgent 
        });
        const data = await response.json();

        const summary = saveAsSingleFile
            ? saveMappingsAsSingleFile(data.mappings, recordingName)
            : splitAndSaveMappings(data.mappings, recordingName);

        res.json({
            message: `Grabación '${recordingName}' finalizada y mappings guardados.`, 
            summary: summary
        });
    } catch (error) {
        console.error('Error stopping recording in Wiremock:', error);
        res.status(500).json({ error: 'Error stopping recording in Wiremock' });
    }
});

app.get('/api/wiremock/recordings/status', async (req, res) => {
    try {
        const response = await fetch(`${process.env.WIREMOCK_ADMIN_URL}/__admin/recordings/status`, { agent: httpsAgent });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching recording status from Wiremock:', error);
        res.status(500).json({ error: 'Error fetching recording status from Wiremock' });
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
        return res.status(400).json({ error: 'Se requiere un array de nombres de mappings.' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const mappingsDir = path.join(__dirname, 'wiremock', 'mappings');

    res.attachment('mappings-batch.zip');
    archive.pipe(res);

    names.forEach(name => {
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

const jobQueue = [];
let jobIdCounter = 0;
const maxWorkers = parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
const workerPool = [];

function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function cleanupOldReports(featureReportDir) {
    const maxReports = parseInt(process.env.MAX_REPORTS_PER_FEATURE, 10) || 5;
    if (!fs.existsSync(featureReportDir)) return;

    const reports = fs.readdirSync(featureReportDir)
        .map(name => ({ name, path: path.join(featureReportDir, name) }))
        .filter(item => fs.statSync(item.path).isDirectory())
        .map(item => ({ ...item, time: fs.statSync(item.path).mtime.getTime() }))
        .sort((a, b) => a.time - b.time); // Sort oldest first

    if (reports.length > maxReports) {
        const reportsToDelete = reports.slice(0, reports.length - maxReports);
        reportsToDelete.forEach(report => {
            fs.rm(report.path, { recursive: true, force: true }, (err) => {
                if (err) console.error(`Error eliminando reporte antiguo ${report.path}:`, err);
                else console.log(`Reporte antiguo eliminado: ${report.name}`);
            });
        });
    }
}

function handleReport(job, reportPath) {
    try {
        const branch = sanitize(job.branch);
        const feature = sanitize(job.feature);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const destDir = path.join(__dirname, 'public', 'reports', branch, feature, timestamp);

        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(reportPath, destDir, { recursive: true });
        
        console.log(`Reporte copiado a ${destDir}`);

        const featureReportDir = path.join(__dirname, 'public', 'reports', branch, feature);
        cleanupOldReports(featureReportDir);

        return `/reports/${branch}/${feature}/${timestamp}/`;
    } catch (error) {
        console.error('Error al manejar el reporte de Allure:', error);
        return null;
    }
}

function broadcastStatus() {
    const activeJobs = workerPool.filter(w => w.status === 'busy').length;
    io.emit('queue_status_update', {
        active: activeJobs,
        queued: jobQueue.length,
        limit: maxWorkers,
        queue: jobQueue
    });
    const slots = workerPool.map(worker => ({
        slotId: worker.id,
        job: worker.currentJob ? { id: worker.currentJob.id, featureName: worker.currentJob.feature } : null,
        status: worker.status,
        branch: worker.branch,
        client: worker.client,
        apkIdentifier: worker.apkIdentifier,
        apkSourceType: worker.apkSourceType
    }));
    io.emit('worker_pool_update', slots);
}

function checkIdleAndCleanup() {
    const isQueueEmpty = jobQueue.length === 0;
    const idleWorkers = workerPool.filter(w => w.status === 'ready');

    if (isQueueEmpty && idleWorkers.length > 0) {
        io.emit('log_update', { logLine: `--- 🧹 Cola vacía. Generando reportes finales para workers inactivos... ---
` });
        
        idleWorkers.forEach(worker => {
            if (!worker.terminating) { 
                worker.terminating = true; 
                worker.process.send({ type: 'GENERATE_UNIFIED_REPORT' });
            }
        });
    }
}

function processQueue() {
    if (jobQueue.length === 0) {
        checkIdleAndCleanup();
        return;
    }

    console.log(`Procesando cola con ${jobQueue.length} trabajos...`);

    const jobsToProcess = jobQueue.length;
    for (let i = 0; i < jobsToProcess; i++) {
        const job = jobQueue.shift();
        const assigned = assignJobToWorker(job);
        if (!assigned) {
            jobQueue.push(job);
        }
    }
    broadcastStatus();
}

function assignJobToWorker(job) {
    const apkSourceType = job.localApk ? 'local' : 'registry';
    const apkIdentifier = job.localApk || job.apkVersion || process.env.APK_PATH;

    let worker = workerPool.find(w => 
        w.branch === job.branch && 
        w.client === job.client && 
        w.apkIdentifier === apkIdentifier &&
        w.apkSourceType === apkSourceType &&
        w.status === 'ready'
    );

    if (worker) {
        runJobOnWorker(job, worker);
        return true;
    }

    if (workerPool.length < maxWorkers) {
        const newWorker = createWorker(job.branch, job.client, apkIdentifier, apkSourceType);
        runJobOnWorker(job, newWorker);
        return true;
    }

    return false;
}

async function startRecordingSequence(job, worker) {
    const { id, feature } = job;
    const { id: slotId } = worker;
    try {
        console.log(`Iniciando secuencia de grabación para el job ${id}`);
        io.emit('log_update', { slotId, logLine: `--- 🔴 Iniciando secuencia de grabación para ${feature} ---
` });
        
        io.emit('log_update', { slotId, logLine: `   -> Reseteando mappings...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/mappings/reset`, { method: 'POST' });
        
        io.emit('log_update', { slotId, logLine: `   -> Cargando mappings base...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/load-base-mappings`, { method: 'POST' });
        
        io.emit('log_update', { slotId, logLine: `   -> Iniciando grabación...
` });
        await fetch(`http://localhost:${PORT}/api/wiremock/recordings/start`, { method: 'POST' });

        io.emit('log_update', { slotId, logLine: `--- ▶️ Grabación iniciada. Ejecutando test... ---
` });
    } catch (error) {
        console.error(`Error durante la secuencia de grabación para el job ${id}:`, error);
        io.emit('log_update', { slotId, logLine: `--- ❌ Error al iniciar la grabación para ${feature}: ${error.message} ---
` });
        throw error;
    }
}

async function runJobOnWorker(job, worker) {
    const wasReady = worker.status === 'ready';
    worker.status = 'busy';
    worker.currentJob = job;
    job.slotId = worker.id;

    io.emit('job_started', {
        slotId: worker.id,
        featureName: job.feature,
        jobId: job.id,
        branch: worker.branch
    });

    if (wasReady) {
        try {
            if (job.record) {
                await startRecordingSequence(job, worker);
            }
            console.log(`Enviando job ${job.id} a worker ${worker.id} que ya estaba listo.`);
            worker.process.send({ type: 'START', job });
        } catch (error) {
            // Handle recording sequence error
        }
    }
    
    broadcastStatus();
}

function createWorker(branch, client, apkIdentifier, apkSourceType) {
    const workerId = workerPool.length > 0 ? Math.max(...workerPool.map(w => w.id)) + 1 : 0;
    const workerProcess = fork(path.join(__dirname, 'worker.js'));

    const worker = {
        id: workerId,
        process: workerProcess,
        branch: branch,
        client: client,
        apkIdentifier: apkIdentifier,
        apkSourceType: apkSourceType,
        status: 'initializing',
        currentJob: null,
        terminating: false
    };

    workerPool.push(worker);
    console.log(`Worker ${worker.id} creado para la branch ${branch}, cliente ${client}, APK: ${apkIdentifier} (source: ${apkSourceType})`);
    
    const initMessage = { type: 'INIT', branch, client };
    if (apkSourceType === 'local') {
        initMessage.localApkPath = path.join(process.env.LOCAL_APK_DIRECTORY, apkIdentifier);
    } else {
        initMessage.apkVersion = apkIdentifier;
    }
    
    worker.process.send(initMessage);

    workerProcess.on('message', async (message) => {
        const currentJob = worker.currentJob;
        const slotId = worker.id;

        switch (message.type) {
            case 'READY':
                console.log(`Worker ${worker.id} reportó READY.`);
                worker.status = 'ready';
                
                if (worker.currentJob) {
                    try {
                        if (worker.currentJob.record) {
                            await startRecordingSequence(worker.currentJob, worker);
                        }
                        console.log(`Worker ${worker.id} está listo, iniciando job ${worker.currentJob.id}.`);
                        worker.status = 'busy';
                        worker.process.send({ type: 'START', job: worker.currentJob });
                    } catch (error) {
                        // Handle recording sequence error
                    }
                } else {
                    processQueue();
                }
                broadcastStatus();
                break;

            case 'READY_FOR_NEXT_JOB':
                console.log(`Worker ${worker.id} reportó READY_FOR_NEXT_JOB.`);

                if (currentJob && currentJob.record) {
                    try {
                        console.log(`Finalizando secuencia de grabación para el job ${currentJob.id}`);
                        io.emit('log_update', { slotId, logLine: `--- ⏹ Deteniendo grabación para ${currentJob.feature}... ---
` });
                        const featureName = path.basename(currentJob.feature, '.feature');
                        const response = await fetch(`http://localhost:${PORT}/api/wiremock/recordings/stop`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ recordingName: featureName, saveAsSingleFile: true })
                        });
                        if (!response.ok) throw new Error(`Status ${response.status}`);
                        const result = await response.json();
                        io.emit('log_update', { slotId, logLine: `--- 💾 Mappings guardados en ${result.summary.filesCreated > 1 ? 'directorio' : 'archivo'} ${featureName}.json (${result.summary.totalMappings} mappings) ---
` });
                    } catch (error) {
                        console.error(`Error al detener la grabación para el job ${currentJob.id}:`, error);
                        io.emit('log_update', { slotId, logLine: `--- ❌ Error al guardar los mappings para ${currentJob.feature}: ${error.message} ---
` });
                    }
                }

                worker.status = 'ready';

                let reportUrl = null;
                if (message.data && message.data.reportPath) {
                    reportUrl = handleReport(currentJob, message.data.reportPath);
                }

                worker.currentJob = null;
                io.emit('job_finished', { 
                    slotId,
                    jobId: currentJob.id,
                    exitCode: message.data?.exitCode ?? 0,
                    reportUrl: reportUrl 
                });
                broadcastStatus();
                processQueue();
                break;

            case 'UNIFIED_REPORT_READY':
                console.log(`Worker ${worker.id} reportó UNIFIED_REPORT_READY.`);
                if (message.data && message.data.reportPath) {
                    const syntheticJob = { branch: worker.branch, feature: `_ReporteUnificado_${worker.client}`, client: worker.client };
                    handleReport(syntheticJob, message.data.reportPath);
                }
                worker.process.send({ type: 'TERMINATE' });
                break;

            case 'LOG':
                io.emit('log_update', { slotId, logLine: message.data });
                break;
        }
    });

    workerProcess.on('close', async (code) => {
        console.log(`Worker ${worker.id} se cerró con código ${code}.`);
        const index = workerPool.findIndex(w => w.id === worker.id);
        if (index !== -1) {
            workerPool.splice(index, 1);
        }

        const { currentJob } = worker;
        if (worker.status === 'busy' && currentJob && !worker.terminating) {
            io.emit('log_update', { logLine: `--- ⚠️ Worker murió inesperadamente. Re-encolando job ${currentJob.id}... ---
` });
            io.emit('job_finished', { slotId: worker.id, jobId: currentJob.id, exitCode: code });
            jobQueue.unshift(currentJob);
        }
        
        broadcastStatus();
        processQueue();
    });

    workerProcess.on('error', (err) => {
        console.error(`Error irrecuperable en el worker ${worker.id}:`, err);
    });

    return worker;
}


// --- Manejo de Socket.IO ---
io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado:', socket.id);

    socket.emit('init', {
        slots: workerPool.map(worker => ({
            slotId: worker.id,
            job: worker.currentJob ? { id: worker.currentJob.id, featureName: worker.currentJob.feature } : null,
            status: worker.status,
            branch: worker.branch
        })),
        status: {
            active: workerPool.filter(w => w.status === 'busy').length,
            queued: jobQueue.length,
            limit: maxWorkers
        }
    });

    socket.on('run_test', (data) => {
        console.log('--- DEBUG: Datos recibidos en run_test ---', data);

        if (data.record) {
            // --- Lógica de Record & Verify ---
            const recordJobId = ++jobIdCounter;
            const verifyJobId = ++jobIdCounter;

            const recordJob = { ...data, id: recordJobId, record: true };
            const verifyJob = {
                ...data,
                id: verifyJobId,
                record: false,
                highPriority: true, // Para que se ejecute justo después
                mappingToLoad: `${data.feature}.json`
            };

            // Encolar el de grabación primero, luego el de verificación
            if (recordJob.highPriority) {
                jobQueue.unshift(verifyJob, recordJob); // El de grabación queda primero
                io.emit('log_update', { logLine: `--- ⚡️ Test de grabación y verificación para '${data.feature}' añadido a la cola con prioridad alta. ---
` });
            } else {
                jobQueue.push(recordJob, verifyJob);
                io.emit('log_update', { logLine: `--- 📼 Petición de grabación y verificación para '${data.feature}' encolada. ---
` });
            }

        } else {
            // --- Lógica normal ---
            const job = { ...data, id: ++jobIdCounter };
            if (data.usePreexistingMapping) {
                job.mappingToLoad = `${data.feature}.json`;
            }
            if (job.highPriority) {
                jobQueue.unshift(job);
                io.emit('log_update', { logLine: `--- ⚡️ Test '${job.feature}' añadido a la cola con prioridad alta. ---
` });
            } else {
                jobQueue.push(job);
                io.emit('log_update', { logLine: `--- ⏳ Petición para '${job.feature}' encolada. ---
` });
            }
        }
        processQueue();
    });

    socket.on('run_batch', (data) => {
        console.log('--- DEBUG: Datos recibidos en run_batch ---', data);
        const { jobs = [], record = false, usePreexistingMapping = false } = data;
        const highPriority = jobs.length > 0 && jobs[0].highPriority;

        let jobsToQueue = [];

        if (record) {
            // --- Lógica de Record & Verify para Lotes ---
            const logMessage = highPriority
                ? `--- ⚡️ Recibido lote de ${jobs.length} tests para Grabación y Verificación con prioridad alta. Encolando... ---
`
                : `--- 📼 Recibido lote de ${jobs.length} tests para Grabación y Verificación. Encolando... ---
`;
            io.emit('log_update', { logLine: logMessage });

            jobsToQueue = jobs.flatMap(jobData => {
                const recordJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: true
                };
                const verifyJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: false,
                    mappingToLoad: `${jobData.feature}.json`
                };
                return [recordJob, verifyJob]; // Devuelve el par intercalado
            });

        } else {
            // --- Lógica normal para Lotes ---
            const logMessage = highPriority
                ? `--- ⚡️ Recibido lote de ${jobs.length} tests con prioridad alta. Encolando... ---
`
                : `--- 📥 Recibido lote de ${jobs.length} tests. Encolando... ---
`;
            io.emit('log_update', { logLine: logMessage });

            jobsToQueue = jobs.map(jobData => {
                const newJob = {
                    ...jobData,
                    id: ++jobIdCounter,
                    record: false // Asegurarse que record es false si no es un lote de grabación
                };
                if (usePreexistingMapping) {
                    newJob.mappingToLoad = `${jobData.feature}.json`;
                }
                return newJob;
            });
        }

        if (highPriority) {
            jobQueue.unshift(...jobsToQueue.reverse());
        } else {
            jobQueue.push(...jobsToQueue);
        }
        
        processQueue();
    });

    socket.on('stop_test', (data) => {
        const { slotId, jobId } = data;
        const worker = workerPool.find(w => w.id === slotId && w.currentJob?.id === jobId);
        if (worker) {
            worker.terminating = true;
            worker.process.kill('SIGTERM');
            console.log(`Señal SIGTERM enviada al worker ${worker.id}`);
        } else {
            console.log(`No se pudo detener el job ${jobId}: no se encontró.`);
        }
    });

    socket.on('cancel_job', (data) => {
        const { jobId } = data;
        const index = jobQueue.findIndex(job => job.id === jobId);
        if (index !== -1) {
            const canceledJob = jobQueue.splice(index, 1);
            console.log(`Job ${jobId} (${canceledJob[0].feature}) cancelado de la cola.`);
            io.emit('log_update', { logLine: `--- 🚫 Job '${canceledJob[0].feature}' cancelado por el usuario. ---
` });
            broadcastStatus();
        } else {
            console.log(`No se pudo cancelar el job ${jobId}: no se encontró en la cola.`);
        }
    });

    socket.on('stop_all_execution', () => {
        console.log('--- 🛑 Recibida orden de PARAR TODO ---');
        io.emit('log_update', { logLine: `--- 🛑 Recibida orden de PARAR TODO por un usuario. Limpiando cola y deteniendo workers... ---
` });

        // 1. Limpiar la cola de jobs pendientes
        const canceledJobs = jobQueue.splice(0, jobQueue.length);
        console.log(`Cancelados ${canceledJobs.length} jobs de la cola.`);

        // 2. Detener todos los workers activos
        workerPool.forEach(worker => {
            if (worker.process) {
                worker.terminating = true;
                worker.process.kill('SIGTERM');
                console.log(`Señal SIGTERM enviada al worker ${worker.id}`);
            }
        });

        // 3. Actualizar el estado en la UI
        broadcastStatus();
    });

    socket.on('disconnect', () => {
        console.log('Un cliente se ha desconectado:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});