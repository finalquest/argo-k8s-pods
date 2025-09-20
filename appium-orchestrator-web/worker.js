const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Parser de logs para detectar progreso de ejecución de tests de Appium
 */
class LogProgressParser {
  constructor() {
    this.currentState = {
      feature: null,
      scenario: null,
      currentStep: null,
      stepHistory: [],
      startTime: null,
    };
    this.emitThrottle = null;
    this.featureFileCache = new Map();
    this.jobId = null;
  }

  /**
   * Parsea una línea de log y extrae información de progreso
   * @param {string} logLine - Línea de log a parsear
   * @returns {Object|null} Evento de progreso o null si no aplica
   */
  parseLogLine(logLine) {
    // Limpiar timestamp y prefijos comunes
    const cleanLine = this.cleanLogLine(logLine);

    // Detect Appium session lifecycle markers
    const sessionStartMatch = cleanLine.match(/^\[APPIUM_SESSION_START\]\s+(.+)$/);
    if (sessionStartMatch) {
      const sessionId = sessionStartMatch[1].trim();
      if (sessionId) {
        sendToParent({
          type: 'APPIUM_SESSION_STARTED',
          sessionId,
        });
      }
      return null;
    }

    if (cleanLine.startsWith('[APPIUM_SESSION_END]')) {
      sendToParent({ type: 'APPIUM_SESSION_ENDED' });
      return null;
    }

    // Intentar diferentes patrones en orden de prioridad
    const patterns = [
      this.tryStepPattern.bind(this),
      this.tryScenarioPattern.bind(this),
      this.tryFeaturePattern.bind(this),
      this.tryErrorPattern.bind(this),
    ];

    for (const pattern of patterns) {
      const result = pattern(cleanLine);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Limpia la línea de log para mejor parsing
   */
  cleanLogLine(logLine) {
    // Remover timestamps comunes
    return logLine
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/, '')
      .replace(/^\[INFO\]\s*/, '') // Nivel de log
      .replace(/^\[DEBUG\]\s*/, '')
      .replace(/^\[WARN\]\s*/, '')
      .replace(/^\[ERROR\]\s*/, '')
      .replace(/^\[stderr\]\s*/, '')
      .replace(/^\[worker\]\s*/, '')
      .replace(/^\[Android.*?\]\s*/, '') // Formato WDIO: [Android #0-0]
      .replace(/^\s*[✖✓-]\s*/, '') // Caracteres de estado WDIO
      .replace(/^\s*-\s*/, '') // Guiones de WDIO
      .trim();
  }

  /**
   * Intenta identificar un step en el log
   */
  tryStepPattern(logLine) {
    // Patrones para el formato real de WDIO que observamos en los logs
    const stepPatterns = [
      // Formato con prefijo [0-0]: [0-0] ➡️  Given user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^\[0-0\]\s*➡️\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato con prefijo [0-0]: [0-0] ✅ Ok (147.370957 ms): user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^\[0-0\]\s*✅.*:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato con prefijo [0-0]: [0-0] ❌ Fail: user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^\[0-0\]\s*❌ Fail:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Nuevo formato sin prefijo: ➡️  Given user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^➡️\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato sin prefijo: ✅ Ok (147.370957 ms): user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^✅.*:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato sin prefijo: ❌ Fail: user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^❌ Fail:\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato WDIO actual: [Android #0-0]    ✖ Given user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^\[Android.*\]\s*[✖✓-]?\s*(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato: [0-0] • Given user "romeroro" "Jaques1952" login secure NBCH mode "welcomeModeSelect.btnSimple"
      /^\[0-0\]\s*[•✖✓-]?\s*(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato: STEP Given I am on the login page
      /^STEP\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato: [STEP] Given I am on the login page
      /^\[STEP\]\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato: • Given I am on the login page
      /^•\s+(Given|When|Then|And|But)\s+(.+)$/i,
      // Formato: Given I am on the login page (directo)
      /^(Given|When|Then|And|But)\s+(.+)$/i,
    ];

    for (const pattern of stepPatterns) {
      const match = logLine.match(pattern);
      if (match) {
        const [, keyword, stepText] = match;

        // Determinar el estado basado en los caracteres especiales
        let status = 'running';
        if (logLine.includes('✖') || logLine.includes('❌')) {
          status = 'failed';
        } else if (
          logLine.includes('✓') ||
          logLine.includes('✔') ||
          logLine.includes('✅')
        ) {
          status = 'passed';
        } else if (logLine.includes('-') || logLine.includes('➡️')) {
          status = 'running';
        }

        return this.handleStepStart(keyword, stepText, status);
      }
    }

    return null;
  }

  /**
   * Maneja el inicio de un step
   */
  handleStepStart(keyword, stepText, status = 'running') {
    const location = this.estimateStepLocation();

    this.currentState.currentStep = {
      keyword,
      text: stepText,
      location,
      feature: this.currentState.feature,
      scenario: this.currentState.scenario,
      startTime: Date.now(),
      status: status,
    };

    this.emitProgress('step:start', this.currentState.currentStep);
    return this.currentState.currentStep;
  }

  /**
   * Maneja el final de un step
   */
  handleStepEnd(keyword, stepText, status) {
    if (!this.currentState.currentStep) return null;

    const duration = Date.now() - this.currentState.currentStep.startTime;

    this.currentState.currentStep.status = status;
    this.currentState.currentStep.duration = duration;

    this.emitProgress('step:end', this.currentState.currentStep);

    // Guardar en historial
    this.currentState.stepHistory.push({
      ...this.currentState.currentStep,
      endTime: Date.now(),
    });

    this.currentState.currentStep = null;
    return { type: 'step:end', status, duration };
  }

  /**
   * Intenta identificar un scenario en el log
   */
  tryScenarioPattern(logLine) {
    const scenarioPatterns = [
      // Formato con prefijo [0-0]: [0-0] 📋 Scenario: [LOGIN - Historial de Operaciones btnSimple - Orden De Extracción ] Persona Física romeroro...
      /^\[0-0\]\s*📋 Scenario:\s+(.+)$/i,
      // Formato sin prefijo: 📋 Scenario: [LOGIN - Historial de Operaciones btnSimple - Orden De Extracción ] Persona Física romeroro...
      /^📋 Scenario:\s+(.+)$/i,
      // Formato: Scenario: Login user
      /^Scenario:\s+(.+)$/i,
      /^\[SCENARIO\]\s+(.+)$/i,
      /^Scenario Outline:\s+(.+)$/i,
    ];

    for (const pattern of scenarioPatterns) {
      const match = logLine.match(pattern);
      if (match) {
        const scenarioName = match[1];
        this.currentState.scenario = scenarioName;
        this.currentState.currentStep = null; // Reset step

        this.emitProgress('scenario:start', {
          name: scenarioName,
          feature: this.currentState.feature,
        });

        return { type: 'scenario:start', name: scenarioName };
      }
    }

    return null;
  }

  /**
   * Intenta identificar un feature en el log
   */
  tryFeaturePattern(logLine) {
    const featurePatterns = [
      /^Feature:\s*(.+)$/i,
      /^\[FEATURE\]\s*(.+)$/i,
      // Patrón para cuando WDIO muestra qué feature está ejecutando
      /^.*Executing\s+(.+)\.feature.*$/i,
      /^.*Running\s+(.+)\.feature.*$/i,
      /^.*Spec:\s*(.+)\.feature.*$/i,
    ];

    for (const pattern of featurePatterns) {
      const match = logLine.match(pattern);
      if (match) {
        const featureName = match[1];
        this.currentState.feature = featureName;
        this.currentState.scenario = null;
        this.currentState.currentStep = null;
        this.currentState.stepHistory = [];

        this.emitProgress('feature:start', { name: featureName });

        return { type: 'feature:start', name: featureName };
      }
    }

    return null;
  }

  /**
   * Intenta identificar errores en el log
   */
  tryErrorPattern(logLine) {
    const errorPatterns = [
      /^Error:\s+(.+)$/i,
      /^\[ERROR\]\s+(.+)$/i,
      /^Failed:\s+(.+)$/i,
      /AssertionError:\s+(.+)$/,
      /TimeoutError:\s+(.+)$/,
      /ElementNotInteractableError:\s+(.+)$/,
      /NoSuchElementError:\s+(.+)$/,
    ];

    for (const pattern of errorPatterns) {
      const match = logLine.match(pattern);
      if (match) {
        const error = match[1];

        if (this.currentState.currentStep) {
          this.currentState.currentStep.status = 'failed';
          this.currentState.currentStep.error = error;

          this.emitProgress('step:error', {
            step: this.currentState.currentStep,
            error: error,
          });
        }

        return { type: 'error', error };
      }
    }

    return null;
  }

  /**
   * Estima la ubicación (línea) de un step en el archivo
   */
  estimateStepLocation() {
    // Estrategia 1: Si conocemos el feature, intentar encontrar la línea
    if (this.currentState.feature && this.currentState.scenario) {
      const location = this.findStepInFeature();
      if (location) {
        return location;
      }
    }

    // Estrategia 2: Estimación basada en el historial
    const estimatedLine = this.currentState.stepHistory.length + 1;

    return {
      file: this.estimateFeatureFile(),
      line: estimatedLine,
      column: 1,
      estimated: true,
    };
  }

  /**
   * Busca un step en el archivo de feature (implementación simplificada)
   */
  findStepInFeature() {
    // En una implementación real, aquí se leería el archivo de feature
    // y se buscaría el step exacto para obtener la línea correcta
    // Por ahora, estimamos basado en el historial
    return {
      file: this.estimateFeatureFile(),
      line: this.currentState.stepHistory.length + 1,
      column: 1,
      estimated: false,
    };
  }

  /**
   * Estima el nombre del archivo de feature
   */
  estimateFeatureFile() {
    if (!this.currentState.feature) return 'unknown.feature';

    // Convertir nombre de feature a nombre de archivo
    return (
      this.currentState.feature
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '.feature'
    );
  }

  /**
   * Emite evento de progreso con throttling
   */
  emitProgress(type, data) {
    if (this.emitThrottle) {
      clearTimeout(this.emitThrottle);
    }

    this.emitThrottle = setTimeout(() => {
      sendToParent({
        type: 'PROGRESS_UPDATE',
        event: type,
        data: data,
        timestamp: new Date().toISOString(),
      });
    }, 50); // 50ms de throttle para no sobrecargar
  }

  /**
   * Reinicia el estado para una nueva ejecución
   */
  reset(jobId = null) {
    this.currentState = {
      feature: null,
      scenario: null,
      currentStep: null,
      stepHistory: [],
      startTime: null,
    };
    this.featureFileCache.clear();
    this.jobId = jobId;
  }
}

// Estado del worker
let workspaceDir = '';
let branch = '';
let client = '';
let apkVersion = '';
let localApkPath = '';
let isWorkspacePersistent = false; // Flag to prevent deleting persistent workspaces
let isQuickTest = false; // Flag to skip APK installation in quick test mode
let deviceSerialForLocalWorker = null; // Para workers locales, el serial se fija al inicio.
let environment = {
  appiumPid: null,
  appiumPort: null,
  adbHost: null, // Puede ser el host remoto o el serial del dispositivo local.
  emulatorId: null,
};

// Instancia global del parser de progreso
let logProgressParser = null;

function sendToParent(message) {
  if (process.send) {
    process.send(message);
  } else {
    console.log('[WORKER] No se puede enviar mensaje al padre:', message);
  }
}

function runScript(
  scriptPath,
  args,
  env,
  onDone,
  enableProgressParsing = false,
) {
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

    // Enviar logs al padre como antes
    sendToParent({ type: 'LOG', data: output });

    // Si el parsing de progreso está habilitado, procesar los logs
    if (enableProgressParsing && logProgressParser) {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          logProgressParser.parseLogLine(line);
        }
      }
    }
  });

  scriptProcess.stderr.on('data', (data) => {
    const errorOutput = data.toString();
    sendToParent({ type: 'LOG', data: `[stderr] ${errorOutput}` });

    // También procesar errores para el parsing de progreso
    if (enableProgressParsing && logProgressParser) {
      const lines = errorOutput.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          logProgressParser.parseLogLine(`[stderr] ${line}`);
        }
      }
    }
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
  sendToParent({
    type: 'LOG',
    data: `[worker] Iniciando setupWorkerEnvironment...\n`,
  });
  sendToParent({
    type: 'LOG',
    data: `[worker] DEVICE_SOURCE=${process.env.DEVICE_SOURCE}\n`,
  });
  sendToParent({
    type: 'LOG',
    data: `[worker] workspaceDir=${workspaceDir}\n`,
  });
  sendToParent({
    type: 'LOG',
    data: `[worker] deviceSerialForLocalWorker=${deviceSerialForLocalWorker}\n`,
  });
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
  sendToParent({
    type: 'LOG',
    data: `[worker] Iniciando finishSetup()...\n`,
  });
  const startAppiumScript = path.join(__dirname, 'scripts', 'start-appium.sh');
  sendToParent({
    type: 'LOG',
    data: `[worker] Ejecutando script: ${startAppiumScript}\n`,
  });
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

    // Notify parent about Appium port
    sendToParent({
      type: 'APPIUM_PORT_READY',
      appiumPort: environment.appiumPort,
    });

    const installApkScript = path.join(__dirname, 'scripts', 'install-apk.sh');
    const env = { DEVICE_SOURCE: process.env.DEVICE_SOURCE };

    if (isQuickTest) {
      // Skip APK installation in quick test mode
      sendToParent({
        type: 'LOG',
        data: `[worker] ⚡ Quick test mode activado - Saltando instalación del APK.
`,
      });
      sendToParent({ type: 'READY' });
    } else {
      // Install APK normally
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
    }
  });
}

function runTest(job) {
  const { client, feature, mappingToLoad, deviceSerial, jobId } = job;
  const runnerScript = path.join(__dirname, 'scripts', 'feature-runner.sh');

  // Inicializar el parser de progreso para este job
  logProgressParser = new LogProgressParser();
  logProgressParser.reset(jobId);

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

    // Habilitar parsing de progreso para la ejecución del test
    runScript(
      runnerScript,
      args,
      env,
      (code) => {
        // Limpiar el parser después de la ejecución
        if (logProgressParser) {
          logProgressParser.reset();
        }

        sendToParent({
          type: 'READY_FOR_NEXT_JOB',
          data: { exitCode: code, reportPath: null },
        });
      },
      true,
    ); // true habilita el parsing de progreso
  };

  if (mappingToLoad) {
    // Extraer solo el nombre base del feature para el mapping
    const featureName = path.basename(feature, '.feature');
    const mappingFileName = `${featureName}.json`;

    const logMessage = job.usePreexistingMapping
      ? `[worker] 💾 Usando mapping preexistente: ${mappingFileName}\n`
      : `[worker] 📼 Job de verificación detectado. Cargando mapping: ${mappingFileName}\n`;

    sendToParent({ type: 'LOG', data: logMessage });

    const loadMappingScript = path.join(
      __dirname,
      'scripts',
      'load-mapping.sh',
    );
    runScript(
      loadMappingScript,
      [mappingFileName],
      null,
      (code) => {
        if (code !== 0) {
          sendToParent({
            type: 'LOG',
            data: `[worker] ❌ Falló la carga del mapping ${mappingFileName}. Abortando test.
`,
          });
          sendToParent({
            type: 'READY_FOR_NEXT_JOB',
            data: { exitCode: code, reportPath: null },
          });
        } else {
          sendToParent({
            type: 'LOG',
            data: `[worker] ✅ Mapping ${mappingFileName} cargado. Ejecutando test...
`,
          });
          executeTest();
        }
      },
      false,
    ); // No habilitar parsing para carga de mapping
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
      isQuickTest = message.quickTest || false; // Aceptar el flag de quick test
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
