const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Estado del worker
let workspaceDir = '';
let branch = '';
let environment = {
    appiumPid: null,
    appiumPort: null,
    adbHost: null,
    emulatorId: null
};

/**
 * Envía un mensaje al proceso padre (el orquestador).
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
 */
function runScript(scriptPath, args, onDone) {
    sendToParent({ type: 'LOG', data: `[worker] Ejecutando: ${path.basename(scriptPath)} ${args.join(' ')}
` });

    const scriptProcess = spawn('bash', [scriptPath, ...args]);
    let scriptOutput = '';

    scriptProcess.stdout.on('data', (data) => {
        const output = data.toString();
        scriptOutput += output;
        sendToParent({ type: 'LOG', data: output });
    });

    scriptProcess.stderr.on('data', (data) => {
        sendToParent({ type: 'LOG', data: `[stderr] ${data.toString()}` });
    });

    scriptProcess.on('close', (code) => {
        onDone(code, scriptOutput);
    });

    scriptProcess.on('error', (err) => {
        sendToParent({ type: 'LOG', data: `[worker] Error al iniciar el script: ${err.message}
` });
        onDone(1, null); // Finalizar con código de error
    });
}

/**
 * Parsea la salida de un script que devuelve variables (ej: KEY=VALUE)
 */
function parseScriptOutput(output) {
    const result = {};
    if (!output) return result;
    output.split('\n').forEach(line => {
        if (line.includes('=')) {
            const [key, ...value] = line.split('=');
            result[key.trim()] = value.join('=').trim();
        }
    });
    return result;
}

/**
 * Fase 1: Prepara el entorno completo del worker.
 */
function setupWorkerEnvironment() {
    // 1. Crear directorio de trabajo
    workspaceDir = path.join(os.tmpdir(), `worker-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    sendToParent({ type: 'LOG', data: `[worker] Workspace creado en: ${workspaceDir}
` });

    // 2. Clonar repo e instalar dependencias
    const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');
    runScript(setupScript, [workspaceDir, branch], (code) => {
        if (code !== 0) {
            sendToParent({ type: 'LOG', data: `[worker] ❌ Falló la preparación del workspace. Terminando.
` });
            process.exit(1);
            return;
        }
        sendToParent({ type: 'LOG', data: '[worker] ✅ Workspace listo.' });

        // 3. Buscar y bloquear emulador
        const findEmulatorScript = path.join(__dirname, 'scripts', 'find-and-lock-emulator.sh');
        runScript(findEmulatorScript, [], (code, output) => {
            if (code !== 0) {
                sendToParent({ type: 'LOG', data: `[worker] ❌ No se pudo bloquear un emulador. Terminando.
` });
                process.exit(1);
                return;
            }
            const { EMULATOR_ID, ADB_HOST } = parseScriptOutput(output);
            environment.emulatorId = EMULATOR_ID;
            environment.adbHost = ADB_HOST;
            sendToParent({ type: 'LOG', data: `[worker] ✅ Emulador ${environment.emulatorId} bloqueado.
` });

            // 4. Iniciar Appium
            const startAppiumScript = path.join(__dirname, 'scripts', 'start-appium.sh');
            runScript(startAppiumScript, [workspaceDir], (code, output) => {
                if (code !== 0) {
                    sendToParent({ type: 'LOG', data: `[worker] ❌ Falló el inicio de Appium. Terminando.
` });
                    cleanupAndExit(1);
                    return;
                }
                const { APPIUM_PID, APPIUM_PORT } = parseScriptOutput(output);
                environment.appiumPid = APPIUM_PID;
                environment.appiumPort = APPIUM_PORT;
                sendToParent({ type: 'LOG', data: `[worker] ✅ Appium iniciado en puerto ${environment.appiumPort}.
` });
                
                // 5. Worker listo para recibir trabajos
                sendToParent({ type: 'READY' });
            });
        });
    });
}

/**
 * Fase 2: Ejecuta un test de feature.
 */
function runTest(job) {
    const { client, feature } = job;
    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');

    const args = [workspaceDir, branch, client, feature, environment.adbHost, environment.appiumPort];

    runScript(runnerScript, args, (code) => {
        const reportDir = path.join(workspaceDir, 'appium', 'allure-report');
        let reportPath = null;

        if (fs.existsSync(reportDir)) {
            reportPath = reportDir;
            sendToParent({ type: 'LOG', data: `[worker] Reporte de Allure encontrado en: ${reportPath}
` });
        }

        sendToParent({
            type: 'READY_FOR_NEXT_JOB',
            data: {
                exitCode: code,
                reportPath: reportPath
            }
        });
    });
}

/**
 * Limpia el entorno y termina el proceso.
 */
function cleanupAndExit(code) {
    sendToParent({ type: 'LOG', data: `[worker] Iniciando limpieza...
` });

    // Detener Appium si está corriendo
    if (environment.appiumPid) {
        const stopAppiumScript = path.join(__dirname, 'scripts', 'stop-appium.sh');
        try { execSync(`bash ${stopAppiumScript} ${environment.appiumPid}`); } catch (e) { /* Ignorar errores */ }
    }

    // Liberar emulador si está bloqueado
    if (environment.emulatorId && environment.adbHost) {
        const releaseEmulatorScript = path.join(__dirname, 'scripts', 'release-emulator.sh');
        try { execSync(`bash ${releaseEmulatorScript} "${environment.emulatorId}" ${environment.adbHost}`); } catch (e) { /* Ignorar errores */ }
    }

    // Eliminar workspace
    if (workspaceDir && fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        sendToParent({ type: 'LOG', data: `[worker] Workspace ${workspaceDir} eliminado.
` });
    }
    
    sendToParent({ type: 'LOG', data: `[worker] Limpieza completa. Saliendo con código ${code}.
` });
    process.exit(code);
}

// --- Flujo Principal del Worker ---

process.on('message', (message) => {
    switch (message.type) {
        case 'INIT':
            branch = message.branch;
            setupWorkerEnvironment();
            break;
        case 'START':
            runTest(message.job);
            break;
        case 'TERMINATE':
            sendToParent({ type: 'LOG', data: '[worker] Recibida orden de terminar.' });
            cleanupAndExit(0);
            break;
        default:
            sendToParent({ type: 'LOG', data: `[worker] Mensaje desconocido recibido: ${message.type}` });
            break;
    }
});

// Manejo de señales para terminación limpia
process.on('SIGTERM', () => {
    sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGTERM.' });
    cleanupAndExit(143);
});

process.on('SIGINT', () => {
    sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGINT.' });
    cleanupAndExit(130);
});
