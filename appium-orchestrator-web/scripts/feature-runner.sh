#!/bin/bash

# Cargar funciones de logging
source "$(dirname "$0")/logger.sh"

# Desactivar buffering para que los logs salgan línea por línea en Node.js
export STDBUF_O=0

header "🚀 Appium Feature Runner - Inicio"

# === ARGUMENTOS ===
WORKSPACE_DIR="${1:?Debe especificar el directorio de trabajo del worker}"
APPIUM_BRANCH="${2:?Debe especificar la branch}"
CLIENT="${3:?Debe especificar el cliente (bind, nbch, bpn)}"
FEATURE_NAME="${4:?Debe especificar el nombre del feature}"
ADB_HOST="${5:?Se requiere el ADB_HOST del emulador}"
APPIUM_PORT="${6:?Se requiere el APPIUM_PORT del servidor}"


APPIUM_DIR="${WORKSPACE_DIR}/appium"
SYS_PORT_BASE=${SYS_PORT_BASE:-8200}

# === INICIO DE EJECUCIÓN ===
cd "$WORKSPACE_DIR"

header "🔎 Paso 1: Validar Workspace y Entorno"

if [ ! -d "$APPIUM_DIR" ]; then
    error "El directorio de trabajo de Appium no existe: $APPIUM_DIR"
    exit 1
fi
success "Workspace validado en $APPIUM_DIR"
success "Usando ADB Host: $ADB_HOST (provisto por el worker)"
success "Usando Appium Port: $APPIUM_PORT (provisto por el worker)"


header "🎯 Paso 2: Ejecutar el feature con Appium"

SYSTEM_PORT=$((SYS_PORT_BASE + (RANDOM % 100)))

# Determinar el package name dinámicamente
CLIENT_UPPER=$(echo "$CLIENT" | tr 'a-z' 'A-Z')
PACKAGE_NAME=$(grep "APP_PACKAGE_${CLIENT_UPPER}" "${APPIUM_DIR}/.env" | cut -d'=' -f2 | tr -d '
')
if [[ -z "$PACKAGE_NAME" ]]; then
    error "No se pudo determinar el PACKAGE_NAME para el cliente $CLIENT"
    exit 1
fi

# Crear archivo de configuración de WDIO al vuelo
CONFIG_FILE="${APPIUM_DIR}/config/wdio.conf.ts"

DOCKER_CAPS=""
if [[ "$IS_DOCKER" == "true" ]]; then
    info "Docker detectado. Forzando remoteAdbHost a 'host.docker.internal'."
    DOCKER_CAPS="'appium:remoteAdbHost': 'host.docker.internal',"
fi

cat > "$CONFIG_FILE" <<- EOM
import { config } from './wdio.local.shared';

const originalAfterStep = config.afterStep;
config.hostname = 'localhost';
config.port = ${APPIUM_PORT};
config.path = '/wd/hub';

// Reducir nivel de log para ver menos verbosidad de webdriver pero mantener algo de info
config.logLevel = 'warn';
config.logLevels = {
  webdriver: 'warn',
  '@wdio/cli': 'warn',
  '@wdio/utils': 'warn',
  '@wdio/config': 'warn'
};

// Modificar los formatos de cucumber para mostrar steps en tiempo real
config.cucumberOpts = {
  require: ['./test/steps-definitions/*.js'],
  backtrace: true,
  requireModule: [],
  dryRun: false,
  failFast: false,
  // Usar format que muestra steps en tiempo real
  format: ['@cucumber/pretty-formatter'],
  colors: true,
  snippets: true,
  source: true,
  profile: [],
  strict: false,
  tagExpression: '',
  timeout: 120000,
  ignoreUndefinedDefinitions: true
};

// Logs de escenario y steps en vivo (sin TS ni ?. ni ??)
config.beforeScenario = function (world) {
  var name = (world && world.pickle && world.pickle.name) ? world.pickle.name : 'Scenario';
  console.log('\n📋 Scenario: ' + name);
};

config.beforeStep = function (step /*, scenario */) {
  var k = (step && step.keyword) ? String(step.keyword).trim() : '';
  var t = (step && step.text) ? step.text : '';
  console.log('➡️  ' + k + ' ' + t);
};

config.afterStep = async function (step, scenario, result) {

  var t = (step && step.text) ? step.text : '';
  if (result && result.passed) {
    var dur = (typeof result.duration === 'number') ? (' (' + result.duration + ' ms)') : '';
    console.log('✅ Ok' + dur + ': ' + t);
  } else {
    console.error('❌ Fail: ' + t);
    if (result && result.error) {
      console.error('   → ' + (result.error.message || result.error));
    }
  }
  if (typeof originalAfterStep === 'function') {
    await originalAfterStep.call(this, step, scenario, result);
  }
};

config.before = async function () {
  try {
    if (typeof browser !== 'undefined' && browser && browser.sessionId) {
      console.log('[APPIUM_SESSION_START] ' + browser.sessionId);
    }
  } catch (error) {
    console.error('[APPIUM_SESSION_START_ERROR]', error && error.message ? error.message : error);
  }
};

config.afterSession = async function () {
  console.log('[APPIUM_SESSION_END]');
};

config.capabilities = [{
    "appium:waitForIdleTimeout": 300,
    "appium:allowDelayAdb": true,
    "appium:isHeadless": true,
    platformName: 'Android',
     "appium:deviceReadyTimeout": 60000,
    "appium:androidInstallTimeout": 90000,
     "appium:ignoreHiddenApiPolicyError": true,
    "appium:avdReadyTimeout": 180000,
    "appium:skipDeviceInitialization": false,
    "appium:automationName": 'UiAutomator2',
    'appium:udid': '${ADB_HOST}',
    ${DOCKER_CAPS}
    'appium:systemPort': ${SYSTEM_PORT},
    'appium:appPackage': '${PACKAGE_NAME}',
    'appium:appActivity': 'com.poincenot.doit.MainActivity',
    'appium:noReset': false,
    'appium:adbExecTimeout': 120000,
    'appium:uiautomator2ServerLaunchTimeout': 120000,
    'appium:disableWindowAnimation': true,
    'appium:skipLogcatCapture': true,
    'appium:autoAcceptAlerts': true,
    'appium:autoDismissAlerts': true,
    "appium:unicodeKeyboard": true,
    "appium:resetKeyboard": true,
    "appium:autoGrantPermissions": true,
    "appium:hideKeyboard": true
}];



export { config };
EOM

success "Configuración de WDIO generada para ${FEATURE_NAME}"

debug "🎬 Ejecutando test..."

# Ejecutar WDIO con nivel de log reducido
cd "$APPIUM_DIR"
FEATURE_ARG="${CLIENT}/feature/modulos/${FEATURE_NAME}"
# Configurar nivel de log para ver menos verbosity de webdriver
export WDIO_LOG_LEVEL=error
if ! env -u RESET -u HEADER -u SUCCESS -u WARN -u ERROR -u DEBUG yarn run env-cmd -x -f ./.env -- wdio "${CONFIG_FILE}" "${FEATURE_ARG}"; then
    EXIT_CODE=$?
    error "La ejecución de WDIO falló con código de salida $EXIT_CODE"
else
    EXIT_CODE=0
    success "Ejecución de WDIO completada."
fi

cd ..

header "✅ Fin de la ejecución."

exit $EXIT_CODE
