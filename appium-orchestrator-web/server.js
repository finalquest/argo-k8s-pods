const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { fork } = require('child_process');

// Cargar variables de entorno desde .env
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Configuración ---
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
        console.error('La GIT_REPO_URL en el archivo .env no es una URL válida.');
        process.exit(1);
    }
};

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// --- API Endpoints ---
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


// --- Lógica de Workers ---

const jobQueue = [];
let jobIdCounter = 0;
const maxWorkers = parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
const workerPool = [];

function broadcastStatus() {
    const activeJobs = workerPool.filter(w => w.status === 'busy').length;
    io.emit('queue_status_update', {
        active: activeJobs,
        queued: jobQueue.length,
        limit: maxWorkers
    });
    const slots = workerPool.map(worker => ({
        slotId: worker.id,
        job: worker.currentJob ? { id: worker.currentJob.id, featureName: worker.currentJob.feature } : null,
        status: worker.status,
        branch: worker.branch
    }));
    io.emit('worker_pool_update', slots);
}

function checkIdleAndCleanup() {
    const isQueueEmpty = jobQueue.length === 0;
    const allWorkersIdle = workerPool.every(w => w.status === 'ready');

    if (isQueueEmpty && allWorkersIdle && workerPool.length > 0) {
        console.log('Todos los trabajos han finalizado y la cola está vacía. Terminando workers...');
        io.emit('log_update', { logLine: `--- 🧹 Todos los trabajos completados. Limpiando y terminando workers... ---\n` });
        
        const workersToTerminate = [...workerPool];
        workersToTerminate.forEach(worker => {
            worker.terminating = true; // Marcar para que no se re-encole el job
            worker.process.send({ type: 'TERMINATE' });
        });
    }
}

function processQueue() {
    if (jobQueue.length === 0) {
        checkIdleAndCleanup(); // Si no hay trabajos, verificar si hay que limpiar
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
    let worker = workerPool.find(w => w.branch === job.branch && w.status === 'ready');
    if (worker) {
        runJobOnWorker(job, worker);
        return true;
    }

    if (workerPool.length < maxWorkers) {
        const newWorker = createWorker(job.branch);
        runJobOnWorker(job, newWorker);
        return true;
    }

    return false;
}

function runJobOnWorker(job, worker) {
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
        console.log(`Enviando job ${job.id} a worker ${worker.id} que ya estaba listo.`);
        worker.process.send({ type: 'START', job });
    }
    
    broadcastStatus();
}

function createWorker(branch) {
    const workerId = workerPool.length > 0 ? Math.max(...workerPool.map(w => w.id)) + 1 : 0;
    const workerProcess = fork(path.join(__dirname, 'worker.js'));

    const worker = {
        id: workerId,
        process: workerProcess,
        branch: branch,
        status: 'initializing',
        currentJob: null,
        terminating: false
    };

    workerPool.push(worker);
    console.log(`Worker ${worker.id} creado para la branch ${branch}.`);
    
    worker.process.send({ type: 'INIT', branch: branch });

    workerProcess.on('message', (message) => {
        const currentJob = worker.currentJob;
        const slotId = worker.id;

        switch (message.type) {
            case 'READY':
                console.log(`Worker ${worker.id} reportó READY (setup completado).`);
                worker.status = 'ready';
                
                if (worker.currentJob) {
                    console.log(`Worker ${worker.id} está listo, iniciando job ${worker.currentJob.id}.`);
                    worker.status = 'busy';
                    worker.process.send({ type: 'START', job: worker.currentJob });
                } else {
                    processQueue();
                }
                broadcastStatus();
                break;

            case 'READY_FOR_NEXT_JOB':
                console.log(`Worker ${worker.id} reportó READY_FOR_NEXT_JOB.`);
                worker.status = 'ready';
                worker.currentJob = null;
                io.emit('job_finished', { slotId, jobId: currentJob.id, exitCode: message.data?.exitCode ?? 0 });
                broadcastStatus();
                processQueue();
                break;

            case 'LOG':
                io.emit('log_update', { slotId, logLine: message.data });
                break;

            case 'DONE':
                console.log(`Worker ${worker.id} reportó DONE para job ${currentJob?.id}`);
                break;
        }
    });

    workerProcess.on('close', (code) => {
        console.log(`Worker ${worker.id} se cerró con código ${code}.`);
        const index = workerPool.findIndex(w => w.id === worker.id);
        if (index !== -1) {
            workerPool.splice(index, 1);
        }
        
        if (worker.status === 'busy' && worker.currentJob && !worker.terminating) {
            io.emit('log_update', { logLine: `--- ⚠️ Worker murió inesperadamente. Re-encolando job ${worker.currentJob.id}... ---\n` });
            io.emit('job_finished', { slotId: worker.id, jobId: worker.currentJob.id, exitCode: code });
            jobQueue.unshift(worker.currentJob);
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
        jobIdCounter++;
        const job = { ...data, id: jobIdCounter };
        jobQueue.push(job);
        io.emit('log_update', { logLine: `--- ⏳ Petición para '${job.feature}' encolada. ---\n` });
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

    socket.on('disconnect', () => {
        console.log('Un cliente se ha desconectado:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});