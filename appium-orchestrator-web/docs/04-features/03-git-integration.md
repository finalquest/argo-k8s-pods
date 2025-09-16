# Features - Integración Git

## 📋 Visión General

La integración Git permite a los usuarios gestionar el control de versiones directamente desde la interfaz web, incluyendo operaciones como commits, push, pull, y monitoreo de cambios. Esta feature es esencial para mantener el código sincronizado y colaborar eficientemente.

## 🏗️ Arquitectura de Git Integration

### 1. Componentes de Git

```javascript
// Arquitectura de integración Git
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   API Endpoints │    │   Git Operations│
│   Git Controls  │────│   REST Routes   │────│   simple-git     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Socket.IO     │
                    │   Real-time     │
                    │   Updates       │
                    └─────────────────┘
```

### 2. Estados Git

```javascript
// Estados de archivos y repositorio
const GIT_STATES = {
  CLEAN: 'clean',
  MODIFIED: 'modified',
  ADDED: 'added',
  DELETED: 'deleted',
  UNTRACKED: 'untracked',
};

const REPO_STATES = {
  SYNCED: 'synced',
  AHEAD: 'ahead',
  BEHIND: 'behind',
  DIVERGED: 'diverged',
};
```

## 🔄 Operaciones Git Básicas

### 1. Verificación de Estado

```javascript
// public/js/api.js - Funciones de estado Git
export async function getCommitStatus(branch) {
  try {
    const response = await fetch(`/api/commit-status/${branch}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Normalize the response to match expected format
    if (data.success) {
      return {
        hasPendingCommits: data.hasPendingCommits || false,
        commitCount: data.commitCount || 0,
      };
    } else {
      console.error('Server error in commit status:', data.error);
      return { hasPendingCommits: false, commitCount: 0 };
    }
  } catch (error) {
    console.error('Error getting commit status:', error);
    return { hasPendingCommits: false, commitCount: 0 };
  }
}

export async function getWorkspaceChanges(branch) {
  try {
    const response = await fetch(`/api/workspace-changes/${branch}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // Normalize the response to match expected format
    return {
      hasChanges: data.hasChanges || false,
      modifiedFiles: data.modifiedFiles || 0,
      stagedFiles: data.stagedFiles || 0,
      unstagedFiles: data.unstagedFiles || 0,
      message: data.message || '',
    };
  } catch (error) {
    console.error('Error getting workspace changes:', error);
    return {
      hasChanges: false,
      modifiedFiles: 0,
      stagedFiles: 0,
      unstagedFiles: 0,
    };
  }
}
```

### 2. Detección Precisa de Cambios

El sistema implementa una lógica precisa para determinar qué archivos deben mostrar el indicador de commit:

#### Lógica de Detección en el Backend

```javascript
// src/modules/core/branch-manager.js - Cálculo de hasChanges
async getWorkspaceChanges(branch) {
  // ... validación y setup ...

  const git = simpleGit(workspacePath);
  const status = await git.status();

  const modifiedFiles = status.modified.length;    // Archivos trackeados modificados
  const stagedFiles = status.staged.length;        // Archivos en staging area
  const unstagedFiles = status.not_added.length;  // Archivos no trackeados
  const deletedFiles = status.deleted.length;      // Archivos eliminados
  const createdFiles = status.created.length;      // Archivos nuevos trackeados
  const renamedFiles = status.renamed.length;      // Archivos renombrados

  // Solo mostrar header si hay archivos trackeados que necesitan commit
  const hasChanges = modifiedFiles + stagedFiles > 0;

  return {
    success: true,
    hasChanges,
    modifiedFiles,
    stagedFiles,
    unstagedFiles,
    message: hasChanges
      ? `Hay ${modifiedFiles + stagedFiles} archivo(s) modificado(s)`
      : '',
  };
}
```

#### Comportamiento del Frontend

```javascript
// public/js/main.js - Lógica de indicadores
function updateCommitStatusIndicator(branch) {
  Promise.all([getCommitStatus(branch), getWorkspaceChanges(branch)]).then(
    ([commitStatus, workspaceStatus]) => {
      // Handle uncommitted changes (yellow indicator)
      if (workspaceStatus.hasChanges) {
        // Mostrar indicador amarillo con conteo de archivos trackeados
        const totalChanges =
          workspaceStatus.modifiedFiles + workspaceStatus.stagedFiles;
        uncommittedStatusText.textContent = `${totalChanges} archivo(s) modificado(s) sin commit`;
        uncommittedIndicator.classList.remove('hidden');
      } else {
        // Ocultar indicador si no hay archivos trackeados modificados
        uncommittedIndicator.classList.add('hidden');
      }

      // Handle pending commits (red indicator)
      if (commitStatus.hasPendingCommits) {
        pendingStatusText.textContent = `${commitStatus.commitCount} commit(s) pendiente(s) de push`;
        pendingCommitsIndicator.classList.remove('hidden');
      } else {
        pendingCommitsIndicator.classList.add('hidden');
      }
    },
  );
}
```

#### Escenarios Comportamentales

| Escenario                           | hasChanges | Header Visible     | Mensaje                                 |
| ----------------------------------- | ---------- | ------------------ | --------------------------------------- |
| Solo archivos no trackeados         | `false`    | ❌ Oculto          | No se muestra                           |
| Archivos modificados                | `true`     | ✅ Visible         | "N archivo(s) modificado(s) sin commit" |
| Archivos staged                     | `true`     | ✅ Visible         | "N archivo(s) modificado(s) sin commit" |
| Mixto (modificados + no trackeados) | `true`     | ✅ Visible         | "N archivo(s) modificado(s) sin commit" |
| Workspace limpio                    | `false`    | ❌ Oculto          | No se muestra                           |
| Solo commits pendientes             | `false`    | ❌ Oculto (commit) | ✅ Visible (push)                       |

### 2. Backend - Endpoints Git

```javascript
// server.js - Endpoints de Git
// Obtener estado de commits
app.get('/api/git/:branch/commit-status', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;

    // Obtener workspace para la branch
    const workspace = await workspaceManager.getWorkspaceByBranch(branch);
    if (!workspace || workspace.status !== 'ready') {
      return res.status(404).json({
        error: 'Workspace no encontrado o no está listo',
      });
    }

    const git = simpleGit(workspace.path);

    // Obtener estado vs remoto
    const status = await git.status();
    const logSummary = await git.log({ maxCount: 10 });

    const hasPendingCommits = status.behind > 0 || status.ahead > 0;

    res.json({
      hasPendingCommits,
      behind: status.behind,
      ahead: status.ahead,
      current: status.current,
      tracking: status.tracking,
      commits: logSummary.all,
      isClean: status.isClean(),
      modified: status.modified,
      staged: status.staged,
      not_added: status.not_added,
      deleted: status.deleted,
      created: status.created,
    });
  } catch (error) {
    console.error('Error getting commit status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener diferencias
app.get('/api/git/:branch/diff', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;
    const { path: filePath } = req.query;

    const workspace = await workspaceManager.getWorkspaceByBranch(branch);
    if (!workspace || workspace.status !== 'ready') {
      return res.status(404).json({
        error: 'Workspace no encontrado o no está listo',
      });
    }

    const git = simpleGit(workspace.path);

    let diff;
    if (filePath) {
      // Diff de archivo específico
      diff = await git.show([`${branch}:${filePath}`]);
    } else {
      // Diff completo del working directory
      diff = await git.diff();
    }

    res.json({
      diff,
      hasChanges: diff && diff.length > 0,
    });
  } catch (error) {
    console.error('Error getting git diff:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 💾 Operaciones de Commit

### 1. Frontend - Interface de Commit

```javascript
// public/js/main.js - Manejo de commits
function initializeAppControls(socket) {
  const commitBtn = document.getElementById('ide-commit-btn');
  commitBtn.addEventListener('click', () => {
    handleCommit(socket);
  });
}

async function handleCommit(socket) {
  const branch = getCurrentBranch();
  if (!branch) {
    alert('Por favor selecciona una branch primero');
    return;
  }

  // Obtener cambios
  const changes = await getWorkspaceChanges(branch);
  if (!changes.hasChanges) {
    alert('No hay cambios para commitear');
    return;
  }

  // Mostrar diálogo de commit
  const message = prompt('Mensaje del commit:');
  if (!message || message.trim() === '') {
    alert('El mensaje del commit es requerido');
    return;
  }

  try {
    // Realizar commit
    const result = await commitChanges(
      branch,
      changes.modifiedFiles,
      message.trim(),
    );

    // Actualizar UI
    updateCommitStatus(branch);
    updateGitIndicator('clean');

    showNotification(`Cambios commiteados: ${result.hash}`, 'success');
  } catch (error) {
    console.error('Error en commit:', error);
    showError(`Error al realizar commit: ${error.message}`);
  }
}

// public/js/api.js - Función de commit
export async function commitChanges(branch, files, message) {
  try {
    if (!message || message.trim() === '') {
      throw new Error('El mensaje de commit es requerido');
    }

    const response = await fetch(`/api/git/${branch}/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files, message: message.trim() }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Error ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Actualizar cache y estado local
    apiCache.clearPattern(`git:${branch}:*`);

    return result;
  } catch (error) {
    console.error('Error committing changes:', error);
    throw error;
  }
}
```

### 2. Backend - Procesamiento de Commit

```javascript
// server.js - Endpoint de commit
app.post('/api/git/:branch/commit', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;
    const { files, message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        error: 'El mensaje de commit es requerido',
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'No hay archivos para commitear',
      });
    }

    console.log(
      `[${req.user.displayName}] Commit en branch ${branch}: ${message}`,
    );

    // Obtener workspace
    const workspace = await workspaceManager.getWorkspaceByBranch(branch);
    if (!workspace || workspace.status !== 'ready') {
      return res.status(404).json({
        error: 'Workspace no encontrado o no está listo',
      });
    }

    const git = simpleGit(workspace.path);

    // Verificar estado actual
    const status = await git.status();

    // Validar que los archivos especificados tengan cambios
    const validFiles = files.filter((file) => {
      return (
        status.modified.includes(file) ||
        status.not_added.includes(file) ||
        status.created.includes(file)
      );
    });

    if (validFiles.length === 0) {
      return res.status(400).json({
        error: 'Los archivos especificados no tienen cambios',
      });
    }

    // Agregar archivos al staging area
    await git.add(validFiles);

    // Realizar commit
    const commitResult = await git.commit(message);

    console.log(`Commit realizado: ${commitResult.hash}`);

    // Obtener estado actualizado
    const newStatus = await git.status();
    const logSummary = await git.log({ maxCount: 1 });

    res.json({
      success: true,
      hash: commitResult.hash,
      message: commitResult.message,
      files: validFiles,
      isClean: newStatus.isClean(),
      hasPendingCommits: newStatus.ahead > 0,
      commit: logSummary.latest,
    });

    // Notificar via Socket.IO
    const io = app.get('io');
    io.emit('commit_completed', {
      branch,
      hash: commitResult.hash,
      message: commitResult.message,
      files: validFiles,
      timestamp: Date.now(),
      userId: req.user.id,
      userName: req.user.displayName,
    });
  } catch (error) {
    console.error('Error en commit:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 📤 Operaciones de Push

### 1. Frontend - Interface de Push

```javascript
// public/js/main.js - Manejo de push
function initializeAppControls(socket) {
  const pushBtn = document.getElementById('git-push-btn');
  pushBtn.addEventListener('click', () => {
    handlePush(socket);
  });
}

async function handlePush(socket) {
  const branch = getCurrentBranch();
  if (!branch) {
    alert('Por favor selecciona una branch primero');
    return;
  }

  // Verificar si hay commits para push
  const status = await getCommitStatus(branch);
  if (!status.hasPendingCommits) {
    alert('No hay commits pendientes para push');
    return;
  }

  // Confirmar operación
  const confirmed = confirm(`¿Push commits al repositorio remoto (${branch})?`);
  if (!confirmed) return;

  try {
    // Realizar push
    const result = await pushChanges(branch);

    // Actualizar UI
    updateCommitStatus(branch);
    updateGitIndicator('synced');

    showNotification('Cambios pushados correctamente', 'success');
  } catch (error) {
    console.error('Error en push:', error);
    showError(`Error al realizar push: ${error.message}`);
  }
}

// public/js/api.js - Función de push
export async function pushChanges(branch) {
  try {
    const response = await fetch(`/api/git/${branch}/push`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Error ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();

    // Actualizar cache
    apiCache.clearPattern(`git:${branch}:*`);

    return result;
  } catch (error) {
    console.error('Error pushing changes:', error);
    throw error;
  }
}
```

### 2. Backend - Procesamiento de Push

```javascript
// server.js - Endpoint de push
app.post('/api/git/${branch}/push', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;

    console.log(`[${req.user.displayName}] Push de branch ${branch}`);

    // Obtener workspace
    const workspace = await workspaceManager.getWorkspaceByBranch(branch);
    if (!workspace || workspace.status !== 'ready') {
      return res.status(404).json({
        error: 'Workspace no encontrado o no está listo',
      });
    }

    const git = simpleGit(workspace.path);

    // Verificar si hay commits para push
    const status = await git.status();
    if (status.ahead === 0) {
      return res.status(400).json({
        error: 'No hay commits pendientes para push',
      });
    }

    // Realizar push
    await git.push('origin', branch);

    console.log(`Push completado para branch ${branch}`);

    // Obtener estado actualizado
    const newStatus = await git.status();

    res.json({
      success: true,
      branch,
      pushedCommits: status.ahead,
      isSynced: newStatus.ahead === 0 && newStatus.behind === 0,
    });

    // Notificar via Socket.IO
    const io = app.get('io');
    io.emit('push_completed', {
      branch,
      result: {
        pushedCommits: status.ahead,
        isSynced: newStatus.ahead === 0 && newStatus.behind === 0,
      },
      timestamp: Date.now(),
      userId: req.user.id,
      userName: req.user.displayName,
    });
  } catch (error) {
    console.error('Error en push:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 📊 Monitoreo en Tiempo Real

### 1. Actualizaciones Socket.IO

```javascript
// public/js/socket.js - Manejo de eventos Git
socket.on('commit_status_update', async (data) => {
  console.log(`Commit status update for branch ${data.branch}:`, data);

  const selectedBranch = document.getElementById('branch-select').value;
  if (data.branch === selectedBranch) {
    // Actualizar indicadores visuales
    updateGitIndicators(data);

    // Actualizar estado de workspace
    const workspaceStatus = await getWorkspaceChanges(data.branch);
    updateWorkspaceStatus(
      data.branch,
      workspaceStatus.hasChanges ? 'dirty' : 'clean',
    );
  }
});

function updateGitIndicators(data) {
  const header = document.getElementById('main-header');
  const uncommittedIndicator = document.getElementById(
    'uncommitted-changes-indicator',
  );
  const pendingCommitsIndicator = document.getElementById(
    'pending-commits-indicator',
  );

  // Limpiar todas las clases
  header.classList.remove('has-pending-commits', 'has-uncommitted-changes');

  // Indicador de commits pendientes (rojo)
  if (data.hasPendingCommits) {
    header.classList.add('has-pending-commits');
    header.classList.remove('has-uncommitted-changes');

    pendingCommitsIndicator.classList.remove('hidden');
    pendingCommitsIndicator.querySelector('.status-text').textContent =
      data.message || 'Commits pendientes de push';
  } else {
    pendingCommitsIndicator.classList.add('hidden');
  }

  // Indicador de cambios sin commitear (amarillo)
  if (data.hasUncommittedChanges) {
    header.classList.add('has-uncommitted-changes');

    uncommittedIndicator.classList.remove('hidden');
    const totalChanges = data.modifiedFiles + data.stagedFiles;
    uncommittedIndicator.querySelector('.status-text').textContent =
      `${totalChanges} archivo(s) modificado(s) sin commit`;
  } else {
    uncommittedIndicator.classList.add('hidden');
  }
}
```

### 2. Indicadores Visuales

```css
/* public/css/styles.css - Indicadores Git */
.has-uncommitted-changes {
  border-left: 4px solid #ffc107;
}

.has-pending-commits {
  border-left: 4px solid #dc3545;
}

#uncommitted-changes-indicator {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
}

#pending-commits-indicator {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.git-status-indicator {
  padding: 8px 12px;
  margin: 4px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.git-status-indicator.hidden {
  display: none;
}
```

## 📜 Historial y Log

### 1. Visualización de Historial

```javascript
// public/js/api.js - Funciones de historial
export async function getGitLog(branch, limit = 10) {
  try {
    const response = await fetch(`/api/git/${branch}/log?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting git log:', error);
    return { commits: [] };
  }
}

// public/js/ui.js - Renderizado de historial
export function renderGitHistory(commits, container) {
  container.innerHTML = '';

  if (commits.length === 0) {
    container.innerHTML =
      '<p class="no-commits">No hay commits disponibles</p>';
    return;
  }

  commits.forEach((commit) => {
    const commitElement = document.createElement('div');
    commitElement.className = 'commit-item';

    const date = new Date(commit.date).toLocaleString();

    commitElement.innerHTML = `
      <div class="commit-header">
        <span class="commit-hash">${commit.hash.substring(0, 7)}</span>
        <span class="commit-date">${date}</span>
      </div>
      <div class="commit-message">${commit.message}</div>
      <div class="commit-author">${commit.author_name}</div>
    `;

    container.appendChild(commitElement);
  });
}
```

### 2. Backend - Endpoint de Log

```javascript
// server.js - Endpoint de historial
app.get('/api/git/:branch/log', requireAuth, async (req, res) => {
  try {
    const { branch } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const workspace = await workspaceManager.getWorkspaceByBranch(branch);
    if (!workspace || workspace.status !== 'ready') {
      return res.status(404).json({
        error: 'Workspace no encontrado o no está listo',
      });
    }

    const git = simpleGit(workspace.path);
    const logSummary = await git.log({ maxCount: limit });

    res.json({
      commits: logSummary.all,
      total: logSummary.total,
      latest: logSummary.latest,
    });
  } catch (error) {
    console.error('Error getting git log:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 🛡️ Seguridad y Validaciones

### 1. Validaciones de Seguridad

```javascript
// server.js - Validaciones Git
function validateGitBranch(branch) {
  // Validar formato de branch
  if (!branch || !/^[a-zA-Z0-9_\-\/]+$/.test(branch)) {
    throw new Error('Nombre de branch inválido');
  }

  // Evitar branches peligrosas
  const dangerousPatterns = [
    /^\//, // Path traversal
    /\.\./, // Parent directory
    /^\.git/, // Git internal
    /^\/etc/, // System paths
    /^c:\\\\/, // Windows paths
    /^\\\\/, // Network paths
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(branch)) {
      throw new Error('Nombre de branch no permitido');
    }
  }

  return true;
}

function validateGitMessage(message) {
  if (!message || message.trim().length === 0) {
    throw new Error('El mensaje de commit no puede estar vacío');
  }

  if (message.length > 1000) {
    throw new Error('El mensaje de commit es demasiado largo');
  }

  // Validar caracteres peligrosos
  const dangerousChars = /[\x00-\x1f\x7f]/;
  if (dangerousChars.test(message)) {
    throw new Error('El mensaje de commit contiene caracteres inválidos');
  }

  return true;
}
```

### 2. Manejo de Conflictos

```javascript
// server.js - Manejo de conflictos de Git
async function handleGitConflict(error, branch, operation) {
  console.error(`Git conflict en ${operation} para branch ${branch}:`, error);

  // Detectar tipos comunes de conflictos
  if (error.message.includes('non-fast-forward')) {
    return {
      type: 'NON_FAST_FORWARD',
      message:
        'El repositorio remoto tiene cambios que no están locales. Haga pull primero.',
      solution: 'git pull origin ' + branch,
    };
  }

  if (error.message.includes('merge conflict')) {
    return {
      type: 'MERGE_CONFLICT',
      message: 'Hay conflictos de merge que deben resolverse manualmente.',
      solution: 'Resolver conflictos manualmente y hacer commit',
    };
  }

  if (error.message.includes('detached HEAD')) {
    return {
      type: 'DETACHED_HEAD',
      message: 'HEAD está detached. Checkout a una branch.',
      solution: 'git checkout ' + branch,
    };
  }

  // Error genérico
  return {
    type: 'UNKNOWN',
    message: error.message,
    solution: 'Verificar el estado del repositorio',
  };
}
```

## 📖 Documentos Relacionados

- [01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [04-device-management.md](./04-device-management.md) - Gestión de dispositivos
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
