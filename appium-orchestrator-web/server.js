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

// Manejo de conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('Un cliente se ha conectado:', socket.id);

  socket.on('run_test', (data) => {
    const { branch, client, feature } = data;
    console.log(`Petición de test recibida para: ${branch}/${client}/${feature}`);

    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');
    const runner = spawn('bash', [runnerScript, branch, client, feature]);

    socket.emit('log_update', `--- Iniciando ejecución del test: ${feature} ---\n`);

    runner.stdout.on('data', (logData) => {
        const logLine = logData.toString();
        console.log(`[RUNNER]: ${logLine.trim()}`);
        socket.emit('log_update', logLine);
    });

    runner.stderr.on('data', (logData) => {
        const logLine = logData.toString();
        console.error(`[RUNNER_ERROR]: ${logLine.trim()}`);
        socket.emit('log_update', `ERROR: ${logLine}`);
    });

    runner.on('close', (code) => {
        console.log(`El script de ejecución ha finalizado con código ${code}`);
        socket.emit('log_update', `--- Ejecución finalizada con código ${code} ---\n`);
        socket.emit('job_finished');
    });
  });

  socket.on('disconnect', () => {
    console.log('Un cliente se ha desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});