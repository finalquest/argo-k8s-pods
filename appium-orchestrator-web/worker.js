const { spawn } = require('child_process');
const path = require('path');

/**
 * Envía un mensaje al proceso padre (el orquestador).
 * @param {object} message - El objeto de mensaje a enviar.
 */
function sendToParent(message) {
    if (process.send) {
        process.send(message);
    } else {
        // Esto puede ocurrir si se ejecuta el worker directamente y no como un proceso hijo
        console.log('[WORKER] No se puede enviar mensaje al padre:', message);
    }
}

/**
 * Ejecuta el script de bash y retransmite su salida.
 * @param {object} job - Los detalles del trabajo a ejecutar.
 */
function runTest(job) {
    const { branch, client, feature } = job;
    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');

    sendToParent({ type: 'LOG', data: `[worker] Iniciando script para ${feature}...\n` });

    const runner = spawn('bash', [runnerScript, branch, client, feature]);

    runner.stdout.on('data', (data) => {
        sendToParent({ type: 'LOG', data: data.toString() });
    });

    runner.stderr.on('data', (data) => {
        sendToParent({ type: 'LOG', data: `[stderr] ${data.toString()}` });
    });

    runner.on('close', (code) => {
        sendToParent({ type: 'DONE', data: { exitCode: code } });
        // El worker termina su ejecución después de un solo trabajo
        process.exit(code);
    });

    runner.on('error', (err) => {
        sendToParent({ type: 'LOG', data: `[worker] Error al iniciar el script: ${err.message}\n` });
        sendToParent({ type: 'DONE', data: { exitCode: 1 } });
        process.exit(1);
    });
}

// Escuchar mensajes del proceso padre (server.js)
process.on('message', (message) => {
    if (message.type === 'START') {
        runTest(message.job);
    } else {
        sendToParent({ type: 'LOG', data: `[worker] Mensaje desconocido recibido: ${message.type}` });
    }
});

// Notificar al padre que el worker está listo para recibir un trabajo
sendToParent({ type: 'READY' });
