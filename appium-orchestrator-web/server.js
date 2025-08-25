const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

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
    process.exit(1); // Detener la aplicación si la configuración falta
}

/**
 * Construye una URL de repositorio Git con credenciales inyectadas.
 * @returns {string} La URL autenticada.
 */
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

// Servir archivos estáticos desde el directorio 'public'
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
        console.log(`Clonando branch '${branch}' en ${tmpDir}...`);
        // Clonamos solo la estructura, sin hacer checkout de todos los archivos para optimizar
        await git.clone(authenticatedUrl, tmpDir, ['--branch', branch, '--depth', '1', '--no-checkout']);
        
        // **PASO CRUCIAL AÑADIDO DE NUEVO**:
        // Hacemos checkout únicamente del directorio que nos interesa para que exista en el disco.
        const featureDirForCheckout = path.join('test', 'features', client, 'feature');
        await git.checkout(branch, ['--', featureDirForCheckout]);

        const featuresPath = path.join(tmpDir, featureDirForCheckout);

        if (!fs.existsSync(featuresPath)) {
            console.log(`No se encontró el directorio de features para el cliente '${client}' en la branch '${branch}'.`);
            return res.json([]); // No existe el directorio para el cliente, devolver lista vacía
        }

        // Leemos el directorio de forma no recursiva y con tipos de archivo
        const allEntries = await fs.promises.readdir(featuresPath, { withFileTypes: true });
        
        // Filtramos para quedarnos solo con archivos que terminen en .feature
        const featureFiles = allEntries
            .filter(dirent => dirent.isFile() && dirent.name.endsWith('.feature'))
            .map(dirent => dirent.name); // Devolvemos solo el nombre del archivo

        res.json(featureFiles);

    } catch (error) {
        console.error(`Error al listar features para la branch '${branch}':`, error);
        res.status(500).json({ error: 'Error interno al listar features.' });
    } finally {
        // Limpieza del directorio temporal
        if (fs.existsSync(tmpDir)) {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
            console.log(`Directorio temporal ${tmpDir} eliminado.`);
        }
    }
});


const { spawn } = require('child_process');

// --- Lógica de la Cola de Ejecución ---
const jobQueue = [];
let jobIdCounter = 0;
const maxParallelJobs = parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
const executionSlots = new Array(maxParallelJobs).fill(null);

/**
 * Emite el estado actual de la cola a todos los clientes conectados.
 */
function broadcastQueueStatus() {
    const active = executionSlots.filter(s => s !== null).length;
    io.emit('queue_status_update', { 
        active: active,
        queued: jobQueue.length,
        limit: maxParallelJobs
    });
}

function findFreeSlot() {
    return executionSlots.findIndex(slot => slot === null);
}

/**
 * Procesa la cola, iniciando tantos trabajos como slots haya disponibles.
 */
function processQueue() {
    let freeSlotIndex = findFreeSlot();
    while (freeSlotIndex !== -1 && jobQueue.length > 0) {
        const job = jobQueue.shift();
        
        // Asignar job al slot
        executionSlots[freeSlotIndex] = job;
        job.slotId = freeSlotIndex;

        console.log(`Iniciando job ${job.id} en slot ${job.slotId} para feature: ${job.feature}.`);
        
        // Notificar a la UI que un job ha comenzado en un slot específico
        io.emit('job_started', { 
            slotId: job.slotId, 
            featureName: job.feature,
            jobId: job.id
        });
        
        broadcastQueueStatus();
        executeJob(job);

        // Buscar el siguiente slot libre para el bucle
        freeSlotIndex = findFreeSlot();
    }
}

function executeJob(job) {
    const { branch, client, feature, socket, slotId, id: jobId } = job;
    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');
    const runner = spawn('bash', [runnerScript, branch, client, feature]);

    // Guardar el proceso en el slot para poder detenerlo después
    executionSlots[slotId].runnerProcess = runner;

    const sendLog = (logLine) => {
        // Enviar el log junto con el slotId para que la UI sepa dónde mostrarlo
        io.emit('log_update', { slotId, logLine });
    };

    runner.stdout.on('data', (data) => sendLog(data.toString()));
    // Cambiar el prefijo de stderr para no tratarlo siempre como un error fatal
    runner.stderr.on('data', (data) => sendLog(`[stderr] ${data.toString()}`));

    runner.on('close', (code) => {
        const finalMessage = code === 0 
            ? `--- ✅ Ejecución finalizada con éxito (código ${code}) ---\n`
            : `--- ❌ Ejecución finalizada con error (código ${code}) ---\n`;
        sendLog(finalMessage);
        
        // Liberar el slot
        executionSlots[slotId] = null;
        
        // Notificar a la UI que el slot ha terminado
        io.emit('job_finished', { slotId, jobId, exitCode: code });
        
        console.log(`Job ${jobId} en slot ${slotId} finalizado.`);
        
        broadcastQueueStatus();
        processQueue();
    });
}

// Manejo de conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('Un cliente se ha conectado:', socket.id);

  // Enviar el estado actual y la configuración de slots al nuevo cliente
  socket.emit('init', { 
      slots: executionSlots.map((job, index) => ({ slotId: index, job: job ? {id: job.id, featureName: job.feature} : null })),
      status: { active: executionSlots.filter(s => s !== null).length, queued: jobQueue.length, limit: maxParallelJobs }
  });

  socket.on('run_test', (data) => {
    jobIdCounter++;
    const job = { ...data, socket, id: jobIdCounter };
    jobQueue.push(job);
    // Este log ahora es genérico y no va a un panel específico hasta que el job empieza
    socket.emit('log_update', { logLine: `--- ⏳ Petición recibida. El test para '${job.feature}' ha sido añadido a la cola. ---\n` });
    
    broadcastQueueStatus();
    processQueue();
  });

  socket.on('stop_test', (data) => {
    const { slotId, jobId } = data;
    console.log(`Petición para detener job ${jobId} en slot ${slotId}`);
    const jobInSlot = executionSlots[slotId];

    if (jobInSlot && jobInSlot.id === jobId && jobInSlot.runnerProcess) {
        jobInSlot.runnerProcess.kill('SIGTERM'); // Enviar señal de terminación
        console.log(`Señal de terminación enviada al proceso del job ${jobId}`);
    } else {
        console.log(`No se pudo detener el job ${jobId}: no se encontró o ya había terminado.`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Un cliente se ha desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});