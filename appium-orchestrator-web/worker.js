const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let workspaceDir = '';
let branch = ''; // Guardamos la branch para usarla en los scripts

/**
 * Envía un mensaje al proceso padre (el orquestador).
 * @param {object} message - El objeto de mensaje a enviar.
 */
function sendToParent(message) {
    if (process.send) {
        process.send(message);
    } else {
        console.log('[WORKER] No se puede enviar mensaje al padre:', message);
    }
}

/**
 * Ejecuta un script de bash y maneja su ciclo de vida.
 * @param {string} scriptPath - Ruta al script a ejecutar.
 * @param {string[]} args - Argumentos para el script.
 * @param {function} onDone - Callback a ejecutar cuando el script termina.
 */
function runScript(scriptPath, args, onDone) {
    sendToParent({ type: 'LOG', data: `[worker] Ejecutando: ${path.basename(scriptPath)} ${args.join(' ')}\n` });

    const scriptProcess = spawn('bash', [scriptPath, ...args]);

    scriptProcess.stdout.on('data', (data) => {
        sendToParent({ type: 'LOG', data: data.toString() });
    });

    scriptProcess.stderr.on('data', (data) => {
        sendToParent({ type: 'LOG', data: `[stderr] ${data.toString()}` });
    });

    scriptProcess.on('close', (code) => {
        onDone(code);
    });

    scriptProcess.on('error', (err) => {
        sendToParent({ type: 'LOG', data: `[worker] Error al iniciar el script: ${err.message}\n` });
        onDone(1); // Finalizar con código de error
    });
}

/**
 * Fase 1: Prepara el workspace del worker.
 */
function setupWorkspace() {
    // Crear un directorio de trabajo único y persistente para este worker
    workspaceDir = path.join(os.tmpdir(), `worker-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    sendToParent({ type: 'LOG', data: `[worker] Workspace creado en: ${workspaceDir}\n` });

    const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');
    runScript(setupScript, [workspaceDir, branch], (code) => {
        if (code === 0) {
            sendToParent({ type: 'LOG', data: '[worker] ✅ Workspace listo.\n' });
            // Notificar al padre que el worker está listo para recibir trabajos
            sendToParent({ type: 'READY' });
        } else {
            sendToParent({ type: 'LOG', data: `[worker] ❌ Falló la preparación del workspace con código ${code}.\n` });
            // Si el setup falla, el worker no puede continuar.
            process.exit(1);
        }
    });
}

/**
 * Fase 2: Ejecuta un test de feature.
 * @param {object} job - Los detalles del trabajo a ejecutar.
 */
function runTest(job) {
    const { client, feature } = job;
    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');

    runScript(runnerScript, [workspaceDir, branch, client, feature], (code) => {
        sendToParent({ type: 'DONE', data: { exitCode: code } });
        // Notifica que está listo para el siguiente trabajo.
        sendToParent({ type: 'READY_FOR_NEXT_JOB' });
    });
}

/**
 * Limpia el directorio de trabajo y termina el proceso.
 * @param {number} code - El código de salida.
 */
function cleanupAndExit(code) {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        sendToParent({ type: 'LOG', data: `[worker] Workspace ${workspaceDir} eliminado.\n` });
    }
    process.exit(code);
}

// --- Flujo Principal del Worker ---

process.on('message', (message) => {
    switch (message.type) {
        case 'INIT': // Mensaje inicial del servidor con la branch
            branch = message.branch;
            setupWorkspace();
            break;
        case 'START':
            runTest(message.job);
            break;
        case 'TERMINATE':
            sendToParent({ type: 'LOG', data: '[worker] Recibida orden de terminar. Limpiando y saliendo...\n' });
            cleanupAndExit(0); // Salida limpia
            break;
        default:
            sendToParent({ type: 'LOG', data: `[worker] Mensaje desconocido recibido: ${message.type}` });
            break;
    }
});

// Manejo de señales para terminación limpia
process.on('SIGTERM', () => {
    sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGTERM. Limpiando y terminando...\n' });
    cleanupAndExit(143); // Código de salida estándar para SIGTERM
});