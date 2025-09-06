const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Estado del worker
let workspaceDir = '';
let branch = '';
let client = '';
let apkVersion = '';
let localApkPath = '';
let isWorkspacePersistent = false; // Flag to prevent deleting persistent workspaces
let deviceSerialForLocalWorker = null; // Para workers locales, el serial se fija al inicio.
let environment = {
  appiumPid: null,
  appiumPort: null,
  adbHost: null, // Puede ser el host remoto o el serial del dispositivo local.
  emulatorId: null,
};

function sendToParent(message) {
  if (process.send) {
    process.send(message);
  } else {
    console.log('[WORKER] No se puede enviar mensaje al padre:', message);
  }
}

function runScript(scriptPath, args, env, onDone) {
  sendToParent({
    type: 'LOG',
    data: `[worker] Ejecutando: ${path.basename(scriptPath)} ${args.join(' ')}
`,
  });
  const options = { env: { ...process.env, ...env } };
  const scriptProcess = spawn('bash', [scriptPath, ...args], options);

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
    sendToParent({
      type: 'LOG',
      data: `[worker] Error al iniciar el script: ${err.message}
`,
    });
    onDone(1, null);
  });
}

function parseScriptOutput(output) {
  const result = {};
  if (!output) return result;
  output.split('\n').forEach((line) => {
    if (line.includes('=')) {
      const [key, ...value] = line.split('=');
      result[key.trim()] = value.join('=').trim();
    }
  });
  return result;
}

function setupWorkerEnvironment() {
  // La ruta del workspace ahora es definida por el servidor y recibida en INIT.
  sendToParent({
    type: 'LOG',
    data: `[worker] Usando workspace asignado: ${workspaceDir}
`,
  });

  const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');

  runScript(setupScript, [workspaceDir, branch], null, (code) => {
    if (code !== 0) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Falló la preparación del workspace. Terminando.
`,
      });
      return process.exit(1);
    }
    sendToParent({ type: 'LOG', data: '[worker] ✅ Workspace listo.' });

    // Si estamos en modo local, nos saltamos la búsqueda de emuladores remotos.
    if (process.env.DEVICE_SOURCE === 'local') {
      sendToParent({
        type: 'LOG',
        data: `[worker]  Modo local detectado. Omitiendo búsqueda de emulador remoto.
`,
      });
      // En modo local, el adbHost es el serial del dispositivo, que debe ser provisto en INIT.
      if (!deviceSerialForLocalWorker) {
        sendToParent({
          type: 'LOG',
          data: `[worker] ❌ Error: DEVICE_SOURCE=local pero no se proveyó un deviceSerial en INIT.
`,
        });
        return process.exit(1);
      }
      environment.adbHost = deviceSerialForLocalWorker;
      sendToParent({
        type: 'LOG',
        data: `[worker]  Dispositivo local asignado: ${environment.adbHost}
`,
      });
      finishSetup();
    } else {
      // Modo remoto: Ejecutar la lógica de búsqueda y bloqueo de emuladores.
      const findEmulatorScript = path.join(
        __dirname,
        'scripts',
        'find-and-lock-emulator.sh',
      );
      runScript(findEmulatorScript, [], null, (code, output) => {
        if (code !== 0) {
          sendToParent({
            type: 'LOG',
            data: `[worker] ❌ No se pudo bloquear un emulador. Terminando.
`,
          });
          return process.exit(1);
        }
        const { EMULATOR_ID, ADB_HOST } = parseScriptOutput(output);
        environment.emulatorId = EMULATOR_ID;
        environment.adbHost = ADB_HOST;
        sendToParent({
          type: 'LOG',
          data: `[worker] ✅ Emulador ${environment.emulatorId} bloqueado. Usando ADB_HOST: ${environment.adbHost}
`,
        });
        finishSetup();
      });
    }
  });
}

// Función refactorizada con los pasos finales de la configuración
function finishSetup() {
  const startAppiumScript = path.join(__dirname, 'scripts', 'start-appium.sh');
  runScript(startAppiumScript, [workspaceDir], null, (code, output) => {
    if (code !== 0) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Falló el inicio de Appium. Terminando.
`,
      });
      return cleanupAndExit(1);
    }
    const { APPIUM_PID, APPIUM_PORT } = parseScriptOutput(output);
    environment.appiumPid = APPIUM_PID;
    environment.appiumPort = APPIUM_PORT;
    sendToParent({
      type: 'LOG',
      data: `[worker] ✅ Appium iniciado en puerto ${environment.appiumPort}.
`,
    });

    const installApkScript = path.join(__dirname, 'scripts', 'install-apk.sh');
    const env = { DEVICE_SOURCE: process.env.DEVICE_SOURCE };
    runScript(
      installApkScript,
      [workspaceDir, environment.adbHost, client, apkVersion, localApkPath],
      env,
      (code) => {
        if (code !== 0) {
          sendToParent({
            type: 'LOG',
            data: `[worker] ❌ Falló la instalación del APK. Terminando.
`,
          });
          return cleanupAndExit(1);
        }
        sendToParent({
          type: 'LOG',
          data: `[worker] ✅ APK de cliente ${client} instalado.
`,
        });

        sendToParent({ type: 'READY' });
      },
    );
  });
}

function runTest(job) {
  const { client, feature, mappingToLoad, deviceSerial } = job;
  const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');

  // Si estamos en modo local (deviceSerial existe), lo usamos como identificador del dispositivo.
  // Si no, usamos el adbHost del emulador remoto que el worker bloqueó al iniciar.
  const deviceIdentifier = deviceSerial || environment.adbHost;
  const args = [
    workspaceDir,
    branch,
    client,
    feature,
    deviceIdentifier,
    environment.appiumPort,
  ];

  const executeTest = () => {
    const env = {};
    // Si es un job local, establecemos ANDROID_SERIAL.
    // Los scripts usarán esta variable para apuntar a un dispositivo específico.
    if (deviceSerial) {
      env.ANDROID_SERIAL = deviceSerial;
    }

    runScript(runnerScript, args, env, (code) => {
      sendToParent({
        type: 'READY_FOR_NEXT_JOB',
        data: { exitCode: code, reportPath: null },
      });
    });
  };

  if (mappingToLoad) {
    const logMessage = job.usePreexistingMapping
      ? `[worker] 💾 Usando mapping preexistente: ${mappingToLoad}\n`
      : `[worker] 📼 Job de verificación detectado. Cargando mapping: ${mappingToLoad}\n`;

    sendToParent({ type: 'LOG', data: logMessage });

    const loadMappingScript = path.join(
      __dirname,
      'scripts',
      'load-mapping.sh',
    );
    runScript(loadMappingScript, [mappingToLoad], null, (code) => {
      if (code !== 0) {
        sendToParent({
          type: 'LOG',
          data: `[worker] ❌ Falló la carga del mapping ${mappingToLoad}. Abortando test.
`,
        });
        sendToParent({
          type: 'READY_FOR_NEXT_JOB',
          data: { exitCode: code, reportPath: null },
        });
      } else {
        sendToParent({
          type: 'LOG',
          data: `[worker] ✅ Mapping ${mappingToLoad} cargado. Ejecutando test...
`,
        });
        executeTest();
      }
    });
  } else {
    // Es un job normal o de grabación sin carga de mapping
    executeTest();
  }
}

function cleanupAndExit(code) {
  sendToParent({
    type: 'LOG',
    data: `[worker] Iniciando limpieza...
`,
  });
  if (environment.appiumPid) {
    const stopAppiumScript = path.join(__dirname, 'scripts', 'stop-appium.sh');
    try {
      execSync(`bash ${stopAppiumScript} ${environment.appiumPid}`);
    } catch {
      /* Ignorar errores */
    }
  }
  if (environment.emulatorId && environment.adbHost) {
    const releaseEmulatorScript = path.join(
      __dirname,
      'scripts',
      'release-emulator.sh',
    );
    try {
      execSync(
        `bash ${releaseEmulatorScript} "${environment.emulatorId}" ${environment.adbHost}`,
      );
    } catch {
      /* Ignorar errores */
    }
  }
  // Solo borrar el workspace si NO es persistente
  if (!isWorkspacePersistent && workspaceDir && fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    sendToParent({
      type: 'LOG',
      data: `[worker] Workspace temporal ${workspaceDir} eliminado.
`,
    });
  }
  sendToParent({
    type: 'LOG',
    data: `[worker] Limpieza completa. Saliendo con código ${code}.
`,
  });
  process.exit(code);
}

process.on('message', (message) => {
  switch (message.type) {
    case 'INIT':
      sendToParent({
        type: 'LOG',
        data: `[worker] Initializing. ANDROID_ADB_SERVER_HOST=${process.env.ANDROID_ADB_SERVER_HOST}\n`,
      });
      branch = message.branch;
      client = message.client;
      apkVersion = message.apkVersion || '';
      localApkPath = message.localApkPath || '';
      deviceSerialForLocalWorker = message.deviceSerial || null;
      workspaceDir = message.workerWorkspacePath; // Aceptar la ruta del workspace del servidor
      isWorkspacePersistent = message.isPersistent; // Aceptar el flag del servidor
      setupWorkerEnvironment();
      break;
    case 'START':
      runTest(message.job);
      break;
    case 'GENERATE_UNIFIED_REPORT': {
      const generateReportScript = path.join(
        __dirname,
        'scripts',
        'generate-report.sh',
      );
      runScript(generateReportScript, [workspaceDir], null, (code) => {
        if (code === 0) {
          const reportDir = path.join(workspaceDir, 'appium', 'allure-report');
          sendToParent({
            type: 'UNIFIED_REPORT_READY',
            data: { reportPath: reportDir },
          });
        } else {
          sendToParent({
            type: 'LOG',
            data: '[worker] ❌ Falló la generación del reporte unificado.',
          });
          // Aún así, avisamos que estamos listos para terminar
          sendToParent({
            type: 'UNIFIED_REPORT_READY',
            data: { reportPath: null },
          });
        }
      });
      break;
    }
    case 'TERMINATE':
      sendToParent({
        type: 'LOG',
        data: '[worker] Recibida orden de terminar.',
      });
      cleanupAndExit(0);
      break;
    default:
      sendToParent({
        type: 'LOG',
        data: `[worker] Mensaje desconocido recibido: ${message.type}`,
      });
      break;
  }
});

process.on('SIGTERM', () => {
  sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGTERM.' });
  cleanupAndExit(143);
});

process.on('SIGINT', () => {
  sendToParent({ type: 'LOG', data: '[worker] Recibida señal SIGINT.' });
  cleanupAndExit(130);
});
