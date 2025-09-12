# Features - Gestión de Workspaces

## 📋 Visión General

La gestión de workspaces es una feature fundamental que permite preparar y mantener entornos de trabajo aislados para cada branch del repositorio. Cada workspace contiene el código fuente, dependencias y configuración necesaria para ejecutar tests de forma independiente.

El sistema incluye detección precisa de cambios Git para mostrar indicadores visuales solo cuando hay archivos trackeados que necesitan commit.

## 🏗️ Arquitectura de Workspaces

### 1. Estructura de Directorios

```bash
# Estructura típica de workspace
workspace-<branch>-<timestamp>/
├── .git/                    # Repositorio Git
├── node_modules/            # Dependencias Node.js
├── features/                # Archivos de features
│   ├── client1/
│   ├── client2/
│   └── ...
├── package.json            # Configuración del proyecto
├── wdio.conf.js            # Configuración WebDriverIO
├── appium/                 # Directorio de Appium
│   ├── logs/              # Logs de ejecución
│   └── allure-report/     # Reportes generados
└── scripts/               # Scripts personalizados
```

### 2. Ciclo de Vida del Workspace

```javascript
// Estados del workspace
const WORKSPACE_STATES = {
  NOT_EXISTS: 'not_exists',
  PREPARING: 'preparing',
  READY: 'ready',
  DIRTY: 'dirty',
  STALE: 'stale',
  ERROR: 'error',
};
```

## 🚀 Preparación de Workspace

### 1. Inicio desde el Frontend

```javascript
// public/js/main.js - Eventos de preparación
function initializeAppControls(socket) {
  const prepareBtn = document.getElementById('prepare-workspace-btn');
  prepareBtn.addEventListener('click', () => {
    handlePrepareWorkspace(socket);
  });
}

async function handlePrepareWorkspace(socket) {
  const branch = document.getElementById('branch-select').value;
  if (!branch) {
    alert('Por favor selecciona una branch primero');
    return;
  }

  // Confirmar preparación
  const confirmed = confirm(`¿Preparar workspace para la branch "${branch}"?`);
  if (!confirmed) return;

  try {
    // Deshabilitar botón durante preparación
    const prepareBtn = document.getElementById('prepare-workspace-btn');
    prepareBtn.disabled = true;
    prepareBtn.textContent = 'Preparando...';

    // Enviar solicitud de preparación
    prepareWorkspace(socket, branch);

    // Iniciar monitoreo de progreso
    monitorWorkspacePreparation(branch);
  } catch (error) {
    console.error('Error preparando workspace:', error);
    showError('Error al preparar workspace');

    // Restaurar botón
    const prepareBtn = document.getElementById('prepare-workspace-btn');
    prepareBtn.disabled = false;
    prepareBtn.textContent = 'Preparar Workspace';
  }
}
```

### 2. Monitoreo de Preparación

```javascript
// public/js/api.js - Monitoreo asíncrono
export async function monitorWorkspacePreparation(
  branch,
  onProgress,
  onComplete,
) {
  const maxAttempts = 60; // 5 minutos máximo
  const interval = 5000; // 5 segundos entre chequeos

  let attempts = 0;

  const checkStatus = async () => {
    try {
      const status = await getWorkspaceStatus(branch);

      if (status.ready) {
        onComplete({ success: true, status });
        return;
      }

      if (status.error) {
        onComplete({ success: false, error: status.error });
        return;
      }

      attempts++;
      onProgress({ attempts, maxAttempts, status });

      if (attempts >= maxAttempts) {
        onComplete({
          success: false,
          error: 'Tiempo de espera agotado para la preparación del workspace',
        });
        return;
      }

      // Continuar monitoreando
      setTimeout(checkStatus, interval);
    } catch (error) {
      onComplete({ success: false, error: error.message });
    }
  };

  // Iniciar monitoreo
  checkStatus();
}
```

### 3. Comunicación con Backend

```javascript
// public/js/socket.js - Envío de preparación
export function prepareWorkspace(socket, branch) {
  if (!branch) {
    alert('Por favor, selecciona una branch para preparar el workspace.');
    return;
  }

  socket.emit('prepare_workspace', { branch });

  // Mostrar indicador de progreso
  showNotification(`Preparando workspace para ${branch}...`, 'info');
}

// Manejo de respuesta
socket.on('workspace_ready', (data) => {
  console.log(`Workspace para la branch ${data.branch} está listo.`);

  const selectedBranch = document.getElementById('branch-select').value;
  if (data.branch === selectedBranch) {
    console.log('Refrescando features automáticamente...');
    document.getElementById('fetch-features-btn').click();
  }

  // Actualizar UI
  updateWorkspaceStatus(data.branch, 'ready');
  showNotification(`Workspace para ${data.branch} está listo`, 'success');

  // Restaurar botón
  const prepareBtn = document.getElementById('prepare-workspace-btn');
  prepareBtn.disabled = false;
  prepareBtn.textContent = 'Preparar Workspace';
});

socket.on('workspace_error', (data) => {
  console.error(`Error en workspace para ${data.branch}:`, data.error);
  showError(`Error en workspace: ${data.error}`);

  // Restaurar botón
  const prepareBtn = document.getElementById('prepare-workspace-btn');
  prepareBtn.disabled = false;
  prepareBtn.textContent = 'Preparar Workspace';
});
```

## 🔧 Backend - Manejo de Workspaces

### 1. Endpoint de Preparación

```javascript
// server.js - API de workspaces
app.post('/api/workspace/:branch/prepare', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;
    const userId = req.user.id;

    console.log(
      `[${req.user.displayName}] Preparando workspace para branch: ${branch}`,
    );

    // Validar branch
    if (!branch || !/^[a-zA-Z0-9_\-\/]+$/.test(branch)) {
      return res.status(400).json({
        error: 'Nombre de branch inválido',
      });
    }

    // Verificar si ya existe un workspace en preparación
    const existingWorkspace = workspaceManager.getWorkspace(branch);
    if (existingWorkspace && existingWorkspace.status === 'preparing') {
      return res.status(409).json({
        error: 'Ya hay un workspace en preparación para esta branch',
      });
    }

    // Iniciar preparación asíncrona
    const workspaceId = await workspaceManager.prepareWorkspace(branch, userId);

    res.json({
      success: true,
      workspaceId,
      message: `Workspace para ${branch} en preparación`,
    });
  } catch (error) {
    console.error('Error preparando workspace:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Gestor de Workspaces

```javascript
// server.js - WorkspaceManager
class WorkspaceManager {
  constructor() {
    this.workspaces = new Map();
    this.basePath = path.join(__dirname, 'workspaces');
    this.maxWorkspaces = parseInt(process.env.MAX_WORKSPACES) || 10;
  }

  async prepareWorkspace(branch, userId) {
    const workspaceId = this.generateWorkspaceId(branch);
    const workspacePath = path.join(this.basePath, workspaceId);

    // Registrar workspace
    this.workspaces.set(workspaceId, {
      id: workspaceId,
      branch,
      userId,
      path: workspacePath,
      status: 'preparing',
      createdAt: Date.now(),
      lastUsed: Date.now(),
    });

    // Limpiar workspaces antiguos si es necesario
    await this.cleanupOldWorkspaces();

    // Iniciar preparación en background
    this.prepareWorkspaceAsync(workspaceId, branch, workspacePath);

    return workspaceId;
  }

  async prepareWorkspaceAsync(workspaceId, branch, workspacePath) {
    try {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) return;

      // Crear directorio
      await fs.promises.mkdir(workspacePath, { recursive: true });

      // Clonar repositorio
      await this.cloneRepository(workspacePath, branch);

      // Instalar dependencias
      await this.installDependencies(workspacePath);

      // Actualizar estado
      workspace.status = 'ready';
      workspace.readyAt = Date.now();

      // Notificar via Socket.IO
      const io = app.get('io');
      io.emit('workspace_ready', {
        branch,
        workspaceId,
        status: 'ready',
        message: `Workspace para ${branch} está listo`,
        timestamp: Date.now(),
      });

      console.log(`Workspace ${workspaceId} para branch ${branch} está listo`);
    } catch (error) {
      console.error(`Error preparando workspace ${workspaceId}:`, error);

      // Actualizar estado a error
      const workspace = this.workspaces.get(workspaceId);
      if (workspace) {
        workspace.status = 'error';
        workspace.error = error.message;
      }

      // Notificar error
      const io = app.get('io');
      io.emit('workspace_error', {
        branch,
        workspaceId,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }

  async cloneRepository(workspacePath, branch) {
    const repoUrl = process.env.GIT_REPO_URL;
    const git = simpleGit();

    console.log(`Clonando repositorio en ${workspacePath}`);

    await git.clone(repoUrl, workspacePath, {
      '--branch': branch,
      '--depth': 1, // Clon superficial para velocidad
    });

    console.log(`Repositoritorio clonado para branch ${branch}`);
  }

  async installDependencies(workspacePath) {
    console.log(`Instalando dependencias en ${workspacePath}`);

    // Ejecutar npm install
    await new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: workspacePath,
        stdio: 'pipe',
      });

      let output = '';
      npm.stdout.on('data', (data) => (output += data.toString()));
      npm.stderr.on('data', (data) => (output += data.toString()));

      npm.on('close', (code) => {
        if (code === 0) {
          console.log('Dependencias instaladas correctamente');
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      npm.on('error', reject);
    });
  }

  async cleanupOldWorkspaces() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas

    const workspacesToDelete = [];

    for (const [id, workspace] of this.workspaces) {
      if (now - workspace.lastUsed > maxAge) {
        workspacesToDelete.push(id);
      }
    }

    // Eliminar workspaces antiguos
    for (const id of workspacesToDelete) {
      await this.deleteWorkspace(id);
    }
  }

  async deleteWorkspace(id) {
    const workspace = this.workspaces.get(id);
    if (!workspace) return;

    try {
      // Eliminar directorio
      await fs.promises.rm(workspace.path, { recursive: true, force: true });

      // Remover del registro
      this.workspaces.delete(id);

      console.log(`Workspace ${id} eliminado`);
    } catch (error) {
      console.error(`Error eliminando workspace ${id}:`, error);
    }
  }

  generateWorkspaceId(branch) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `workspace-${branch.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}-${random}`;
  }
}
```

## 🔧 Worker - Configuración del Entorno

### 1. Script de Preparación

```bash
#!/bin/bash
# scripts/setup-workspace.sh

WORKSPACE_DIR=$1
BRANCH=$2

echo "[SETUP] Preparando workspace en: $WORKSPACE_DIR"
echo "[SETUP] Branch: $BRANCH"

# Verificar que el directorio existe
if [ ! -d "$WORKSPACE_DIR" ]; then
    echo "[SETUP] Error: El directorio $WORKSPACE_DIR no existe"
    exit 1
fi

# Cambiar al directorio del workspace
cd "$WORKSPACE_DIR"

# Verificar que es un repositorio git
if [ ! -d ".git" ]; then
    echo "[SETUP] Error: No es un repositorio git válido"
    exit 1
fi

# Verificar la branch actual
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "[SETUP] Branch actual: $CURRENT_BRANCH"

# Actualizar repositorio si es necesario
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "[SETUP] Cambiando a branch: $BRANCH"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
fi

# Verificar package.json
if [ ! -f "package.json" ]; then
    echo "[SETUP] Error: No se encontró package.json"
    exit 1
fi

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo "[SETUP] Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[SETUP] Error: Falló la instalación de dependencias"
        exit 1
    fi
fi

# Verificar configuración de WebDriverIO
if [ ! -f "wdio.conf.js" ]; then
    echo "[SETUP] Advertencia: No se encontró wdio.conf.js"
fi

# Crear directorios necesarios
mkdir -p "appium/logs"
mkdir -p "appium/allure-report"

echo "[SETUP] ✅ Workspace preparado correctamente"
```

### 2. Integración con Worker

```javascript
// worker.js - Configuración del workspace
function setupWorkerEnvironment() {
  const setupScript = path.join(__dirname, 'scripts', 'setup-workspace.sh');

  sendToParent({
    type: 'LOG',
    data: `[worker] Usando workspace asignado: ${workspaceDir}`,
  });

  runScript(setupScript, [workspaceDir, branch], null, (code) => {
    if (code !== 0) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Falló la preparación del workspace. Terminando.`,
      });
      return process.exit(1);
    }

    sendToParent({ type: 'LOG', data: '[worker] ✅ Workspace listo.' });

    // Continuar con la configuración del dispositivo y Appium
    setupDeviceAndAppium();
  });
}
```

## 📊 Estados y Monitoreo

### 1. Verificación de Estado

```javascript
// server.js - Endpoint de estado
app.get('/api/workspace/:branch/status', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;

    // Buscar workspace para la branch
    const workspace = workspaceManager.getWorkspaceByBranch(branch);

    if (!workspace) {
      return res.json({
        exists: false,
        ready: false,
        status: 'not_exists',
      });
    }

    // Verificar si el workspace está listo
    let isReady = workspace.status === 'ready';

    // Verificación adicional del sistema de archivos
    if (isReady) {
      try {
        await fs.promises.access(workspace.path);
        // Verificar archivos críticos
        const packageJsonPath = path.join(workspace.path, 'package.json');
        await fs.promises.access(packageJsonPath);
      } catch (error) {
        isReady = false;
        workspace.status = 'stale';
      }
    }

    res.json({
      exists: true,
      ready: isReady,
      status: workspace.status,
      workspaceId: workspace.id,
      createdAt: workspace.createdAt,
      readyAt: workspace.readyAt,
      lastUsed: workspace.lastUsed,
      error: workspace.error,
    });
  } catch (error) {
    console.error('Error getting workspace status:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Actualización de Estados

```javascript
// public/js/ui.js - Actualización visual de workspace
function updateWorkspaceStatus(branch, status) {
  const statusIndicator = document.getElementById('workspace-status');
  if (!statusIndicator) return;

  // Limpiar todas las clases de estado
  statusIndicator.classList.remove(
    'status-ready',
    'status-preparing',
    'status-error',
    'status-stale',
  );

  // Actualizar según estado
  switch (status) {
    case 'ready':
      statusIndicator.classList.add('status-ready');
      statusIndicator.textContent = `✅ Workspace listo (${branch})`;
      break;
    case 'preparing':
      statusIndicator.classList.add('status-preparing');
      statusIndicator.textContent = `🔄 Preparando workspace (${branch})...`;
      break;
    case 'error':
      statusIndicator.classList.add('status-error');
      statusIndicator.textContent = `❌ Error en workspace (${branch})`;
      break;
    case 'stale':
      statusIndicator.classList.add('status-stale');
      statusIndicator.textContent = `⚠️ Workspace obsoleto (${branch})`;
      break;
    default:
      statusIndicator.textContent = `❓ Workspace desconocido (${branch})`;
  }
}
```

## 🛡️ Manejo de Errores y Recuperación

### 1. Estrategias de Recuperación

```javascript
// server.js - Recuperación de workspaces
async function recoverWorkspace(workspaceId) {
  const workspace = workspaceManager.workspaces.get(workspaceId);
  if (!workspace) return false;

  try {
    // Verificar integridad del sistema de archivos
    await fs.promises.access(workspace.path);

    // Verificar archivos críticos
    const criticalFiles = [
      path.join(workspace.path, 'package.json'),
      path.join(workspace.path, '.git'),
    ];

    for (const filePath of criticalFiles) {
      await fs.promises.access(filePath);
    }

    // Si todo está bien, marcar como listo
    workspace.status = 'ready';
    workspace.readyAt = Date.now();

    return true;
  } catch (error) {
    console.error(`Workspace ${workspaceId} necesita recreación:`, error);

    // Eliminar workspace dañado
    await workspaceManager.deleteWorkspace(workspaceId);

    return false;
  }
}
```

### 2. Validaciones de Seguridad

```javascript
// server.js - Validaciones de workspace
function validateWorkspacePath(workspacePath) {
  // Evitar path traversal
  const resolvedPath = path.resolve(workspacePath);
  const basePath = path.resolve(__dirname, 'workspaces');

  if (!resolvedPath.startsWith(basePath)) {
    throw new Error('Ruta de workspace inválida');
  }

  // Validar caracteres permitidos
  if (!/^[a-zA-Z0-9_\-\/]+$/.test(workspacePath)) {
    throw new Error('Caracteres no permitidos en la ruta del workspace');
  }

  return true;
}
```

## 📖 Documentos Relacionados

- [01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [03-git-integration.md](./03-git-integration.md) - Integración Git
- [04-device-management.md](./04-device-management.md) - Gestión de dispositivos
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
