# Features - Gestión de Archivos y Sistema de Configuración

## 📋 Visión General

El sistema de gestión de archivos y configuración permite la manipulación segura de archivos de features, gestión de entornos y configuración dinámica del sistema. Este módulo proporciona una interfaz centralizada para leer, escribir y organizar archivos, además de manejar la configuración del entorno a través de variables de entorno y endpoints dinámicos.

## 🏗️ Arquitectura del Sistema

### 1. Componentes Principales

```javascript
// Arquitectura de gestión de archivos y configuración
const FileConfigSystem = {
  FileManager: {
    Read: 'Lectura de archivos de features',
    Write: 'Escritura segura de archivos',
    Validate: 'Validación de rutas y contenido',
    Organize: 'Estructura jerárquica',
  },
  ConfigManager: {
    Environment: 'Variables de entorno',
    API: 'Endpoints de configuración',
    Validation: 'Validación de configuración',
    Defaults: 'Valores por defecto',
  },
  Security: {
    PathValidation: 'Prevención de path traversal',
    Authorization: 'Control de acceso',
    Sanitization: 'Limpieza de entradas',
  },
};
```

### 2. Flujo de Operaciones

```javascript
// Flujo de gestión de archivos
User Request → Path Validation → File Operation → Response
     ↓
  /api/feature-content → securityCheck() → readFile() → content
     ↓
  /api/feature-content → securityCheck() → writeFile() → success
```

## 🔧 Backend - Gestión de Archivos

### 1. Lectura de Archivos de Features

```javascript
// server.js - Endpoint de lectura de archivos
app.get('/api/feature-content', async (req, res) => {
  const { branch, client, feature } = req.query;
  if (!branch || !client || !feature) {
    return res
      .status(400)
      .json({ error: 'Faltan parámetros (branch, client, feature).' });
  }

  if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
    return res.status(404).json({
      error: 'La funcionalidad de workspaces persistentes no está habilitada.',
    });
  }

  const workspacePath = path.join(
    process.env.PERSISTENT_WORKSPACES_ROOT,
    sanitize(branch),
    'appium',
  );

  // Construir ruta segura al archivo del feature
  const featurePath = path.join(
    workspacePath,
    'features',
    client,
    `${feature}.feature`,
  );

  // Verificación de seguridad
  const resolvedPath = path.resolve(featurePath);
  if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
    return res.status(403).json({ error: 'Acceso a archivo no autorizado.' });
  }

  try {
    const content = await fs.promises.readFile(featurePath, 'utf-8');
    res.type('text/plain').send(content);
  } catch (error) {
    console.error(`Error al leer el archivo del feature ${feature}:`, error);
    res.status(500).json({ error: 'No se pudo leer el archivo del feature.' });
  }
});
```

### 2. Escritura de Archivos de Features

```javascript
// server.js - Endpoint de escritura de archivos
app.post('/api/feature-content', async (req, res) => {
  const { branch, client, feature, content } = req.body;
  if (!branch || !client || !feature || content === undefined) {
    return res
      .status(400)
      .json({ error: 'Faltan parámetros (branch, client, feature, content).' });
  }

  if (!process.env.PERSISTENT_WORKSPACES_ROOT) {
    return res.status(404).json({
      error: 'La funcionalidad de workspaces persistentes no está habilitada.',
    });
  }

  const workspacePath = path.join(
    process.env.PERSISTENT_WORKSPACES_ROOT,
    sanitize(branch),
    'appium',
  );

  // Construir ruta segura al archivo del feature
  const featurePath = path.join(
    workspacePath,
    'features',
    client,
    `${feature}.feature`,
  );

  // Verificación de seguridad
  const resolvedPath = path.resolve(featurePath);
  if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
    return res.status(403).json({ error: 'Acceso a archivo no autorizado.' });
  }

  try {
    // Asegurar que el directorio existe
    await fs.promises.mkdir(path.dirname(featurePath), { recursive: true });

    // Escribir contenido
    await fs.promises.writeFile(featurePath, content, 'utf-8');

    console.log(`Feature actualizado: ${feature}`);
    res.json({ success: true, message: 'Feature guardado correctamente.' });
  } catch (error) {
    console.error(`Error al guardar el feature ${feature}:`, error);
    res.status(500).json({ error: 'No se pudo guardar el feature.' });
  }
});
```

### 3. Validación de Seguridad

```javascript
// server.js - Funciones de seguridad
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function validateFilePath(requestedPath, basePath) {
  const resolvedPath = path.resolve(requestedPath);
  const resolvedBase = path.resolve(basePath);

  // Verificar que la ruta está dentro del directorio base
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Path traversal detectado');
  }

  // Verificar caracteres permitidos
  if (!/^[a-zA-Z0-9_\-\/.]+$/.test(requestedPath)) {
    throw new Error('Caracteres no permitidos en la ruta');
  }

  return true;
}

function validateFileContent(content) {
  // Validar contenido del archivo para prevenir inyección
  if (typeof content !== 'string') {
    throw new Error('El contenido debe ser una cadena de texto');
  }

  // Limitar tamaño del archivo (1MB)
  if (content.length > 1024 * 1024) {
    throw new Error('El archivo es demasiado grande');
  }

  return true;
}
```

## ⚙️ Sistema de Configuración

### 1. Gestión de Variables de Entorno

```javascript
// server.js - Configuración del servidor
require('dotenv').config();

// Validación de variables de entorno requeridas
const {
  PORT,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SESSION_SECRET,
  GIT_REPO_URL,
  GIT_USER,
  GIT_PAT,
  DEVICE_SOURCE,
  PERSISTENT_WORKSPACES_ROOT,
  WIREMOCK_URL,
  MAX_PARALLEL_TESTS,
  MAX_REPORTS_PER_FEATURE,
} = process.env;

// Validación crítica
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
  console.error(
    'Error: Debes definir GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y SESSION_SECRET en el archivo .env',
  );
  process.exit(1);
}

if (!GIT_REPO_URL || !GIT_USER || !GIT_PAT) {
  console.error(
    'Error: Debes definir GIT_REPO_URL, GIT_USER y GIT_PAT en el archivo .env',
  );
  process.exit(1);
}

// Configuración condicional
const config = {
  port: PORT || 3000,
  isLocalDevice: DEVICE_SOURCE === 'local',
  hasPersistentWorkspaces: !!PERSISTENT_WORKSPACES_ROOT,
  maxWorkers: parseInt(MAX_PARALLEL_TESTS, 10) || 2,
  maxReports: parseInt(MAX_REPORTS_PER_FEATURE, 10) || 5,
  wireMockUrl: WIREMOCK_URL || 'http://localhost:8080',
};
```

### 2. API de Configuración

```javascript
// server.js - Endpoints de configuración
app.get('/api/config', (req, res) => {
  res.json({
    persistentWorkspacesEnabled: !!process.env.PERSISTENT_WORKSPACES_ROOT,
    deviceSource: process.env.DEVICE_SOURCE || 'local',
    maxParallelTests: config.maxWorkers,
    maxReportsPerFeature: config.maxReports,
    wireMockEnabled: !!process.env.WIREMOCK_URL,
    gitIntegration: {
      repoUrl: process.env.GIT_REPO_URL,
      user: process.env.GIT_USER,
    },
  });
});

// Endpoint para validar configuración
app.post('/api/config/validate', (req, res) => {
  const { configKey, configValue } = req.body;

  try {
    const validationResult = validateConfiguration(configKey, configValue);
    res.json({
      valid: validationResult.valid,
      message: validationResult.message,
      normalizedValue: validationResult.normalizedValue,
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      message: error.message,
    });
  }
});

function validateConfiguration(key, value) {
  const validators = {
    MAX_PARALLEL_TESTS: (val) => {
      const num = parseInt(val, 10);
      return {
        valid: !isNaN(num) && num > 0 && num <= 10,
        message:
          num > 0 && num <= 10 ? 'Válido' : 'Debe ser un número entre 1 y 10',
        normalizedValue: num.toString(),
      };
    },
    MAX_REPORTS_PER_FEATURE: (val) => {
      const num = parseInt(val, 10);
      return {
        valid: !isNaN(num) && num > 0 && num <= 20,
        message:
          num > 0 && num <= 20 ? 'Válido' : 'Debe ser un número entre 1 y 20',
        normalizedValue: num.toString(),
      };
    },
    WIREMOCK_URL: (val) => {
      try {
        new URL(val);
        return {
          valid: true,
          message: 'URL válida',
          normalizedValue: val,
        };
      } catch {
        return {
          valid: false,
          message: 'URL inválida',
        };
      }
    },
  };

  const validator = validators[key];
  if (validator) {
    return validator(value);
  }

  return {
    valid: false,
    message: 'Clave de configuración no reconocida',
  };
}
```

## 🎨 Frontend - Integración con Editor

### 1. Carga y Guardado de Archivos

```javascript
// public/js/file-manager.js - Gestión de archivos
class FileManager {
  constructor() {
    this.currentFile = null;
    this.autoSave = false;
    this.autoSaveInterval = null;
    this.lastSavedContent = null;
  }

  async loadFile(branch, client, feature) {
    try {
      const response = await fetch(
        `/api/feature-content?branch=${encodeURIComponent(branch)}&client=${encodeURIComponent(client)}&feature=${encodeURIComponent(feature)}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const content = await response.text();

      // Actualizar editor
      if (window.ideCodeMirror) {
        window.ideCodeMirror.setValue(content);
        window.ideCodeMirror.clearHistory();
      }

      // Guardar estado actual
      this.currentFile = { branch, client, feature };
      this.lastSavedContent = content;

      // Actualizar UI
      this.updateFileStatus('loaded');

      return content;
    } catch (error) {
      console.error('Error loading file:', error);
      this.updateFileStatus('error');
      throw error;
    }
  }

  async saveFile(content) {
    if (!this.currentFile) {
      throw new Error('No file currently open');
    }

    try {
      const response = await fetch('/api/feature-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...this.currentFile,
          content: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Actualizar estado
      this.lastSavedContent = content;
      this.updateFileStatus('saved');

      return result;
    } catch (error) {
      console.error('Error saving file:', error);
      this.updateFileStatus('error');
      throw error;
    }
  }

  enableAutoSave(interval = 30000) {
    this.autoSave = true;

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, interval);
  }

  disableAutoSave() {
    this.autoSave = false;

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  async performAutoSave() {
    if (!this.currentFile || !window.ideCodeMirror) return;

    const currentContent = window.ideCodeMirror.getValue();

    // Solo guardar si el contenido ha cambiado
    if (currentContent !== this.lastSavedContent) {
      try {
        await this.saveFile(currentContent);
        console.log('Auto-save completed');
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }

  updateFileStatus(status) {
    const statusIndicator = document.getElementById('file-status');
    if (!statusIndicator) return;

    statusIndicator.className = `file-status status-${status}`;

    const statusMessages = {
      loaded: 'Archivo cargado',
      saving: 'Guardando...',
      saved: 'Guardado',
      error: 'Error',
      modified: 'Modificado',
    };

    statusIndicator.textContent = statusMessages[status] || status;
  }

  checkForModifications() {
    if (!window.ideCodeMirror || !this.lastSavedContent) return;

    const currentContent = window.ideCodeMirror.getValue();
    const isModified = currentContent !== this.lastSavedContent;

    this.updateFileStatus(isModified ? 'modified' : 'saved');

    return isModified;
  }
}

// Instancia global
const fileManager = new FileManager();
window.fileManager = fileManager;
```

### 2. Integración con CodeMirror

```javascript
// public/js/editor-integration.js - Integración con el editor
function initializeEditorIntegration() {
  if (!window.ideCodeMirror) return;

  // Eventos de cambio
  window.ideCodeMirror.on('change', () => {
    fileManager.checkForModifications();
  });

  // Atajos de teclado
  window.ideCodeMirror.setOption('extraKeys', {
    'Ctrl-S': () => {
      saveCurrentFile();
    },
    'Cmd-S': () => {
      saveCurrentFile();
    },
  });

  // Manejar eventos de cierre de pestaña
  window.addEventListener('beforeunload', (event) => {
    if (fileManager.checkForModifications()) {
      event.preventDefault();
      event.returnValue =
        'Tienes cambios sin guardar. ¿Estás seguro de que quieres salir?';
    }
  });
}

async function saveCurrentFile() {
  if (!window.ideCodeMirror || !fileManager.currentFile) {
    showNotification('No hay ningún archivo abierto', 'warning');
    return;
  }

  try {
    fileManager.updateFileStatus('saving');
    const content = window.ideCodeMirror.getValue();
    await fileManager.saveFile(content);
    showNotification('Archivo guardado correctamente', 'success');
  } catch (error) {
    showNotification('Error al guardar el archivo', 'error');
  }
}

// Inicializar integración
document.addEventListener('DOMContentLoaded', () => {
  initializeEditorIntegration();
});
```

## 🔍 Explorador de Archivos

### 1. Componente de Explorador

```javascript
// public/js/file-explorer.js - Explorador de archivos
class FileExplorer {
  constructor() {
    this.currentPath = null;
    this.fileTree = null;
    this.selectedFile = null;
  }

  async loadFileTree(branch) {
    try {
      const response = await fetch(
        `/api/features?branch=${encodeURIComponent(branch)}`,
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const features = await response.json();
      this.fileTree = this.buildFileTree(features);
      this.renderFileTree();

      return this.fileTree;
    } catch (error) {
      console.error('Error loading file tree:', error);
      throw error;
    }
  }

  buildFileTree(features) {
    const tree = {
      name: 'features',
      type: 'folder',
      children: {},
      path: '',
    };

    features.forEach((feature) => {
      const parts = feature.split('/');
      let current = tree;

      parts.forEach((part, index) => {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            type: index === parts.length - 1 ? 'file' : 'folder',
            children: {},
            path: parts.slice(0, index + 1).join('/'),
          };
        }
        current = current.children[part];
      });
    });

    return tree;
  }

  renderFileTree() {
    const container = document.getElementById('file-explorer');
    if (!container) return;

    container.innerHTML = '';
    const treeElement = this.createTreeElement(this.fileTree);
    container.appendChild(treeElement);
  }

  createTreeElement(node, level = 0) {
    const element = document.createElement('div');
    element.className = `file-tree-item file-tree-${node.type}`;
    element.style.paddingLeft = `${level * 20}px`;

    const icon = document.createElement('span');
    icon.className = 'file-tree-icon';
    icon.textContent = node.type === 'folder' ? '📁' : '📄';

    const name = document.createElement('span');
    name.className = 'file-tree-name';
    name.textContent = node.name;

    element.appendChild(icon);
    element.appendChild(name);

    if (node.type === 'folder') {
      element.addEventListener('click', () => {
        this.toggleFolder(element);
      });

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'file-tree-children';
      childrenContainer.style.display = 'none';

      Object.values(node.children).forEach((child) => {
        const childElement = this.createTreeElement(child, level + 1);
        childrenContainer.appendChild(childElement);
      });

      element.appendChild(childrenContainer);
    } else if (node.type === 'file') {
      element.addEventListener('click', () => {
        this.selectFile(node);
      });
    }

    return element;
  }

  toggleFolder(folderElement) {
    const childrenContainer = folderElement.querySelector(
      '.file-tree-children',
    );
    const icon = folderElement.querySelector('.file-tree-icon');

    if (childrenContainer.style.display === 'none') {
      childrenContainer.style.display = 'block';
      icon.textContent = '📂';
    } else {
      childrenContainer.style.display = 'none';
      icon.textContent = '📁';
    }
  }

  selectFile(fileNode) {
    // Remover selección anterior
    document.querySelectorAll('.file-tree-item.selected').forEach((item) => {
      item.classList.remove('selected');
    });

    // Seleccionar nuevo archivo
    const fileElement = event.currentTarget;
    fileElement.classList.add('selected');

    this.selectedFile = fileNode;

    // Disparar evento de selección
    this.dispatchEvent('fileSelected', {
      path: fileNode.path,
      name: fileNode.name,
    });
  }

  dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  }
}

// Instancia global
const fileExplorer = new FileExplorer();
window.fileExplorer = fileExplorer;
```

### 2. Estilos para Explorador

```css
/* public/css/styles.css - Estilos de explorador de archivos */
.file-explorer {
  width: 300px;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-y: auto;
  max-height: 600px;
}

.file-tree-item {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.file-tree-item:hover {
  background-color: #e9ecef;
}

.file-tree-item.selected {
  background-color: #007bff;
  color: white;
}

.file-tree-icon {
  margin-right: 8px;
  font-size: 14px;
}

.file-tree-name {
  flex: 1;
  font-size: 14px;
}

.file-tree-children {
  margin-left: 10px;
}

/* Indicador de estado de archivo */
.file-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  margin-left: 10px;
}

.file-status.status-loaded {
  background-color: #e7f3ff;
  color: #0066cc;
}

.file-status.status-saving {
  background-color: #fff3cd;
  color: #856404;
}

.file-status.status-saved {
  background-color: #d4edda;
  color: #155724;
}

.file-status.status-error {
  background-color: #f8d7da;
  color: #721c24;
}

.file-status.status-modified {
  background-color: #fff3cd;
  color: #856404;
}
```

## 🛡️ Seguridad y Validaciones

### 1. Middleware de Seguridad

```javascript
// server.js - Middleware para operaciones de archivos
const fileSecurityMiddleware = (req, res, next) => {
  // Validar que el usuario está autenticado
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Validar método HTTP
  const allowedMethods = ['GET', 'POST'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Para POST, validar Content-Type
  if (req.method === 'POST' && !req.is('application/json')) {
    return res
      .status(400)
      .json({ error: 'Content-Type must be application/json' });
  }

  next();
};

// Aplicar middleware a endpoints de archivos
app.use('/api/feature-content', fileSecurityMiddleware);
```

### 2. Validaciones Adicionales

```javascript
// server.js - Validaciones de contenido
function validateFeatureContent(content) {
  // Validar que el contenido es un string
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  // Validar tamaño máximo (1MB)
  if (content.length > 1024 * 1024) {
    throw new Error('Content too large (max 1MB)');
  }

  // Validar caracteres peligrosos (inyección de comandos)
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      throw new Error('Content contains potentially dangerous patterns');
    }
  }

  return true;
}

function validateFeatureName(name) {
  // Validar formato del nombre del feature
  const featureNamePattern = /^[a-zA-Z0-9_\-\.]+$/;
  if (!featureNamePattern.test(name)) {
    throw new Error('Invalid feature name format');
  }

  // Validar longitud
  if (name.length > 100) {
    throw new Error('Feature name too long (max 100 characters)');
  }

  return true;
}
```

## 📖 Documentos Relacionados

- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general
- [02-backend/01-server-architecture.md](../02-backend/01-server-architecture.md) - Arquitectura del backend
- [03-frontend/01-module-overview.md](../03-frontend/01-module-overview.md) - Módulos del frontend
- [04-features/02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [04-features/03-git-integration.md](./03-git-integration.md) - Integración Git
- [04-features/07-real-time-progress-indicators.md](./07-real-time-progress-indicators.md) - Indicadores de progreso
