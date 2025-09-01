const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Estado del worker
let workspaceDir = '';
let branch = '';
let client = '';
let apkVersion = ''; // El worker ahora está asociado a una versión de APK
let environment = {
    appiumPid: null,
    appiumPort: null,
    adbHost: null,
    emulatorId: null
};

function sendToParent(message) {
    if (process.send) {
        process.send(message);
    } else {
        console.log('[WORKER] No se puede enviar mensaje al padre:', message);
    }
}

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
        onDone(1, null);
    });
}

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

function setupWorkerEnvironment() {
    workspaceDir = path.join(os.tmpdir(), `worker-${crypto.randomBytes(8).toString('hex')}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    sendToParent({ type: 'LOG', data: `[worker] Workspace creado en: ${workspaceDir}\n` });

    const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');
    runScript(setupScript, [workspaceDir, branch], (code) => {
        if (code !== 0) {
            sendToParent({ type: 'LOG', data: `[worker] ❌ Falló la preparación del workspace. Terminando.\n` });
            return process.exit(1);
        }
        sendToParent({ type: 'LOG', data: '[worker] ✅ Workspace listo.\n' });

        const findEmulatorScript = path.join(__dirname, 'scripts', 'find-and-lock-emulator.sh');
        runScript(findEmulatorScript, [], (code, output) => {
            if (code !== 0) {
                sendToParent({ type: 'LOG', data: `[worker] ❌ No se pudo bloquear un emulador. Terminando.\n` });
                return process.exit(1);
            }
            const { EMULATOR_ID, ADB_HOST } = parseScriptOutput(output);
            environment.emulatorId = EMULATOR_ID;
            environment.adbHost = ADB_HOST;

            // Permitir sobreescribir el ADB_HOST para desarrollo local contra un clúster
            if (process.env.ADB_HOST_OVERRIDE) {
                sendToParent({ type: 'LOG', data: `[worker] ⚠️  ADB_HOST original ('${environment.adbHost}') será sobreescrito por ADB_HOST_OVERRIDE.\n` });
                environment.adbHost = process.env.ADB_HOST_OVERRIDE;
            }

            sendToParent({ type: 'LOG', data: `[worker] ✅ Emulador ${environment.emulatorId || 'local'} bloqueado. Usando ADB_HOST: ${environment.adbHost}\n` });

            const startAppiumScript = path.join(__dirname, 'scripts', 'start-appium.sh');
            runScript(startAppiumScript, [workspaceDir], (code, output) => {
                if (code !== 0) {
                    sendToParent({ type: 'LOG', data: `[worker] ❌ Falló el inicio de Appium. Terminando.\n` });
                    return cleanupAndExit(1);
                }
                const { APPIUM_PID, APPIUM_PORT } = parseScriptOutput(output);
                environment.appiumPid = APPIUM_PID;
                environment.appiumPort = APPIUM_PORT;
                sendToParent({ type: 'LOG', data: `[worker] ✅ Appium iniciado en puerto ${environment.appiumPort}.\n` });

                const installApkScript = path.join(__dirname, 'scripts', 'install-apk.sh');
                runScript(installApkScript, [workspaceDir, environment.adbHost, client, apkVersion], (code) => {
                    if (code !== 0) {
                        sendToParent({ type: 'LOG', data: `[worker] ❌ Falló la instalación del APK. Terminando.\n` });
                        return cleanupAndExit(1);
                    }
                    sendToParent({ type: 'LOG', data: `[worker] ✅ APK de cliente ${client} instalado.\n` });

                    sendToParent({ type: 'READY' });
                });
            });
        });
    });
}

function runTest(job) {
    const { client, feature, mappingToLoad } = job;
    const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');
    const args = [workspaceDir, branch, client, feature, environment.adbHost, environment.appiumPort];

    const executeTest = () => {
        runScript(runnerScript, args, (code) => {
            // El reporte ya no se genera aquí, así que no se envía la ruta.
            sendToParent({
                type: 'READY_FOR_NEXT_JOB',
                data: { exitCode: code, reportPath: null }
            });
        });
    };

    if (mappingToLoad) {
        sendToParent({ type: 'LOG', data: `[worker] 📼 Job de verificación detectado. Cargando mapping: ${mappingToLoad}\n` });
        const loadMappingScript = path.join(__dirname, 'scripts', 'load-mapping.sh');
        runScript(loadMappingScript, [mappingToLoad], (code) => {
            if (code !== 0) {
                sendToParent({ type: 'LOG', data: `[worker] ❌ Falló la carga del mapping ${mappingToLoad}. Abortando test.\n` });
                sendToParent({
                    type: 'READY_FOR_NEXT_JOB',
                    data: { exitCode: code, reportPath: null }
                });
            } else {
                sendToParent({ type: 'LOG', data: `[worker] ✅ Mapping ${mappingToLoad} cargado. Ejecutando test de verificación...\n` });
                executeTest();
            }
        });
    } else {
        // Es un job normal o de grabación
        executeTest();
    }
}

function cleanupAndExit(code) {
    sendToParent({ type: 'LOG', data: `[worker] Iniciando limpieza...\n` });
    if (environment.appiumPid) {
        const stopAppiumScript = path.join(__dirname, 'scripts', 'stop-appium.sh');
        try { execSync(`bash ${stopAppiumScript} ${environment.appiumPid}`); } catch (e) { /* Ignorar errores */ }
    }
    if (environment.emulatorId && environment.adbHost) {
        const releaseEmulatorScript = path.join(__dirname, 'scripts', 'release-emulator.sh');
        try { execSync(`bash ${releaseEmulatorScript} "${environment.emulatorId}" ${environment.adbHost}`); } catch (e) { /* Ignorar errores */ }
    }
    if (workspaceDir && fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        sendToParent({ type: 'LOG', data: `[worker] Workspace ${workspaceDir} eliminado.\n` });
    }
    sendToParent({ type: 'LOG', data: `[worker] Limpieza completa. Saliendo con código ${code}.\n` });
    process.exit(code);
}

process.on('message', (message) => {
    switch (message.type) {
        case 'INIT':
            branch = message.branch;
            client = message.client;
            apkVersion = message.apkVersion || ''; // Guardar la versión de APK
            setupWorkerEnvironment();
            break;
        case 'START':
            runTest(message.job);
            break;
        case 'GENERATE_UNIFIED_REPORT':
            const generateReportScript = path.join(__dirname, 'scripts', 'generate-report.sh');
            runScript(generateReportScript, [workspaceDir], (code) => {
                if (code === 0) {
                    const reportDir = path.join(workspaceDir, 'appium', 'allure-report');
                    sendToParent({ type: 'UNIFIED_REPORT_READY', data: { reportPath: reportDir } });
                } else {
                    sendToParent({ type: 'LOG', data: '[worker] ❌ Falló la generación del reporte unificado.\n' });
                    // Aún así, avisamos que estamos listos para terminar
                    sendToParent({ type: 'UNIFIED_REPORT_READY', data: { reportPath: null } });
                }
            });
            break;
        case 'TERMINATE':
            sendToParent({ type: 'LOG', data: '[worker] Recibida orden de terminar.\n' });
            cleanupAndExit(0);
            break;
        default:
            sendToParent({ type: 'LOG', data: `[worker] Mensaje desconocido recibido: ${message.type}` });
            break;
    }
});

process.on('SIGTERM', () => {
    sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGTERM.\n' });
    cleanupAndExit(143);
});

process.on('SIGINT', () => {
    sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGINT.\n' });
    cleanupAndExit(130);
});