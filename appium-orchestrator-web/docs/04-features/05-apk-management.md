# Features - Gestión de APKs

## 📋 Visión General

La gestión de APKs permite a Appium Orchestrator Web manejar diferentes versiones de aplicaciones Android para testing. Soporta tanto APKs remotos (versionadas) como APKs locales (cargados por el usuario), con instalación automática y gestión de versiones.

## 🏗️ Arquitectura de Gestión de APKs

### 1. Fuentes de APKs
```javascript
// Tipos de fuentes de APKs
const APK_SOURCES = {
  REMOTE: 'remote',    // APKs versionados en servidor remoto
  LOCAL: 'local'      // APKs cargados localmente por el usuario
};

// Estados de APKs
const APK_STATES = {
  AVAILABLE: 'available',
  INSTALLING: 'installing',
  INSTALLED: 'installed',
  FAILED: 'failed',
  MISSING: 'missing'
};
```

### 2. Flujo de Gestión
```javascript
// Arquitectura de gestión de APKs
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   APK Selector  │    │   Version       │    │   Installation  │
│   UI Component  │────│   Manager       │────│   System        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Device        │
                    │   Integration  │
                    └─────────────────┘
```

## 📤 Selección y Carga de APKs

### 1. Interface de Usuario
```javascript
// public/js/ui.js - Componente de selección de APKs
export function createApkSelector(apkSource, apkVersions) {
  const container = document.createElement('div');
  container.className = 'apk-selector';
  
  // Selector de fuente
  const sourceSelector = document.createElement('select');
  sourceSelector.id = 'apk-source-select';
  sourceSelector.className = 'apk-source-select';
  
  const localOption = document.createElement('option');
  localOption.value = 'local';
  localOption.textContent = 'APK Local';
  
  const remoteOption = document.createElement('option');
  remoteOption.value = 'remote';
  remoteOption.textContent = 'APK Remoto';
  
  sourceSelector.appendChild(localOption);
  sourceSelector.appendChild(remoteOption);
  sourceSelector.value = apkSource;
  
  // Selector de versiones (para APKs remotos)
  const versionSelector = document.createElement('select');
  versionSelector.id = 'apk-version-select';
  versionSelector.className = 'apk-version-select';
  
  // Input de archivo (para APKs locales)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'apk-file-input';
  fileInput.accept = '.apk';
  fileInput.style.display = 'none';
  
  // Contenedor de selección
  const selectionContainer = document.createElement('div');
  selectionContainer.className = 'apk-selection-container';
  
  // Actualizar según fuente seleccionada
  function updateApkSelection() {
    const selectedSource = sourceSelector.value;
    
    if (selectedSource === 'remote') {
      // Mostrar selector de versiones
      versionSelector.style.display = 'block';
      fileInput.style.display = 'none';
      
      // Poblar versiones
      versionSelector.innerHTML = '';
      apkVersions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        versionSelector.appendChild(option);
      });
    } else {
      // Mostrar input de archivo
      versionSelector.style.display = 'none';
      fileInput.style.display = 'block';
    }
  }
  
  // Event listeners
  sourceSelector.addEventListener('change', updateApkSelection);
  fileInput.addEventListener('change', handleApkFileSelection);
  
  // Construir UI
  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'Fuente APK:';
  sourceLabel.appendChild(sourceSelector);
  
  container.appendChild(sourceLabel);
  container.appendChild(versionSelector);
  container.appendChild(fileInput);
  
  // Inicializar estado
  updateApkSelection();
  
  return container;
}

function handleApkFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validar que sea un APK
  if (!file.name.endsWith('.apk')) {
    alert('Por favor selecciona un archivo .apk válido');
    event.target.value = '';
    return;
  }
  
  // Mostrar información del archivo seleccionado
  const fileInfo = document.createElement('div');
  fileInfo.className = 'apk-file-info';
  fileInfo.textContent = `Seleccionado: ${file.name} (${formatFileSize(file.size)})`;
  
  // Reemplazar información anterior
  const existingInfo = document.querySelector('.apk-file-info');
  if (existingInfo) {
    existingInfo.replaceWith(fileInfo);
  } else {
    event.target.parentNode.appendChild(fileInfo);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

### 2. Integración con Ejecución de Tests
```javascript
// public/js/socket.js - Integración con APKs en jobs
export function runTest(socket, branch, client, feature, highPriority = false, record = false) {
  const selectedApk = document.getElementById('apk-version-select').value;
  let jobPayload = {
    branch,
    client,
    feature,
    highPriority,
    record,
    deviceSerial: document.getElementById('device-select').value,
  };
  
  // Configurar APK según fuente
  if (apkSource === 'local') {
    jobPayload.localApk = selectedApk;
  } else {
    jobPayload.apkVersion = selectedApk;
  }
  
  // Configurar opciones adicionales
  const useLocalMappingsCheckbox = document.getElementById('use-local-mappings-checkbox');
  jobPayload.usePreexistingMapping = useLocalMappingsCheckbox.checked;
  
  const persistentWorkspaceCheckbox = document.getElementById('persistent-workspace-checkbox');
  jobPayload.persistentWorkspace = persistentWorkspaceCheckbox.checked;
  
  socket.emit('run_test', jobPayload);
}
```

## 🔧 Backend - Gestión de APKs

### 1. Endpoints de APKs
```javascript
// server.js - API de gestión de APKs
// Listar APKs disponibles
app.get('/api/apk/list', requireAuth, async (req, res) => {
  try {
    const apkDir = path.join(__dirname, 'apks');
    
    // Verificar que el directorio existe
    if (!await fs.pathExists(apkDir)) {
      return res.json({ versions: [] });
    }
    
    // Listar archivos APK
    const files = await fs.readdir(apkDir);
    const apkFiles = files.filter(file => file.endsWith('.apk'));
    
    // Extraer versiones de los nombres de archivo
    const versions = apkFiles.map(file => {
      const match = file.match(/app-(.+)\.apk/);
      return match ? match[1] : file;
    });
    
    res.json({
      versions: versions.sort(),
      total: versions.length
    });
    
  } catch (error) {
    console.error('Error listing APKs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Subir APK local
app.post('/api/apk/upload', requireAuth, upload.single('apk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }
    
    // Validar que sea un APK
    if (!req.file.originalname.endsWith('.apk')) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'El archivo debe ser un APK' });
    }
    
    // Validar tamaño del archivo
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (req.file.size > maxSize) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'El APK excede el tamaño máximo de 100MB' });
    }
    
    // Generar nombre único para el APK
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const apkName = `uploaded-${timestamp}-${randomId}.apk`;
    const apkPath = path.join(__dirname, 'apks', apkName);
    
    // Mover archivo a directorio de APKs
    await fs.move(req.file.path, apkPath);
    
    // Validar el APK
    const isValid = await validateApk(apkPath);
    if (!isValid) {
      await fs.unlink(apkPath);
      return res.status(400).json({ error: 'APK inválido o corrupto' });
    }
    
    console.log(`APK uploaded: ${apkName} by ${req.user.displayName}`);
    
    res.json({
      success: true,
      apkName,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error uploading APK:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### 2. Validación de APKs
```javascript
// server.js - Utilidades de validación de APKs
async function validateApk(apkPath) {
  try {
    // Verificar que el archivo existe
    if (!await fs.pathExists(apkPath)) {
      return false;
    }
    
    // Verificar tamaño mínimo
    const stats = await fs.stat(apkPath);
    if (stats.size < 1024) { // Mínimo 1KB
      return false;
    }
    
    // Verificar firma de ZIP (los APKs son archivos ZIP)
    const buffer = await fs.readFile(apkPath, 0, 4);
    const signature = buffer.readUInt32LE(0);
    
    // Firma ZIP: 0x04034b50
    if (signature !== 0x04034b50) {
      return false;
    }
    
    // Verificar estructura básica del APK
    const result = await spawnAsync('aapt', ['dump', 'badging', apkPath]);
    
    if (result.code !== 0) {
      return false;
    }
    
    // Parsear salida de aapt para verificar información básica
    const output = result.stdout;
    const hasPackage = output.includes('package:');
    const hasLaunchableActivity = output.includes('launchable-activity:');
    
    return hasPackage && hasLaunchableActivity;
    
  } catch (error) {
    console.error('Error validating APK:', error);
    return false;
  }
}

async function spawnAsync(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
```

## 📱 Instalación de APKs

### 1. Script de Instalación
```bash
#!/bin/bash
# scripts/install-apk.sh

WORKSPACE_DIR=$1
DEVICE_ID=$2
CLIENT=$3
APK_VERSION=$4
LOCAL_APK_PATH=$5

echo "[APK] Iniciando instalación de APK..."
echo "[APK] Dispositivo: $DEVICE_ID"
echo "[APK] Cliente: $CLIENT"

# Determinar ruta del APK
if [ -n "$LOCAL_APK_PATH" ]; then
    # APK local cargado por el usuario
    APK_PATH="$LOCAL_APK_PATH"
    echo "[APK] Usando APK local: $APK_PATH"
else
    # APK remoto versionado
    APK_PATH="$WORKSPACE_DIR/../apks/app-$APK_VERSION.apk"
    echo "[APK] Usando APK remoto: $APK_VERSION"
fi

# Verificar que el APK existe
if [ ! -f "$APK_PATH" ]; then
    echo "[APK] ❌ Error: APK no encontrado en $APK_PATH"
    exit 1
fi

# Verificar dispositivo
if [ -n "$ANDROID_SERIAL" ]; then
    DEVICE_ID="$ANDROID_SERIAL"
    echo "[APK] Usando ANDROID_SERIAL: $DEVICE_ID"
fi

# Desinstalar versión anterior si existe
echo "[APK] Desinstalando versión anterior..."
adb -s "$DEVICE_ID" uninstall "com.${CLIENT}.app" 2>/dev/null || true

# Instalar nuevo APK
echo "[APK] Instalando nuevo APK..."
adb -s "$DEVICE_ID" install -r -g "$APK_PATH"
INSTALL_RESULT=$?

if [ $INSTALL_RESULT -ne 0 ]; then
    echo "[APK] ❌ Falló la instalación del APK (código: $INSTALL_RESULT)"
    
    # Intentar instalación sin permisos de granularidad
    echo "[APK] Intentando instalación sin permisos de granularidad..."
    adb -s "$DEVICE_ID" install -r "$APK_PATH"
    INSTALL_RESULT=$?
    
    if [ $INSTALL_RESULT -ne 0 ]; then
        echo "[APK] ❌ Falló la instalación alternativa"
        exit $INSTALL_RESULT
    fi
fi

# Verificar instalación
echo "[APK] Verificando instalación..."
INSTALLED_PACKAGES=$(adb -s "$DEVICE_ID" shell pm list packages | grep "com.${CLIENT}.app")

if [ -z "$INSTALLED_PACKAGES" ]; then
    echo "[APK] ❌ Error: El paquete no fue instalado correctamente"
    exit 1
fi

echo "[APK] ✅ APK instalado correctamente"
echo "[APK] Paquetes instalados: $INSTALLED_PACKAGES"

# Otorgar permisos necesarios
echo "[APK] Otorgando permisos..."
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.INTERNET
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.ACCESS_NETWORK_STATE
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.ACCESS_WIFI_STATE
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.READ_EXTERNAL_STORAGE
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.WRITE_EXTERNAL_STORAGE

# Otorgar permisos peligrosos solo si es necesario
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.CAMERA 2>/dev/null || true
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.RECORD_AUDIO 2>/dev/null || true
adb -s "$DEVICE_ID" shell pm grant "com.${CLIENT}.app" android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true

echo "[APK] ✅ Permisos otorgados"
```

### 2. Integración con Worker
```javascript
// worker.js - Instalación de APK
function finishSetup() {
  const startAppiumScript = path.join(__dirname, 'scripts', 'start-appium.sh');
  runScript(startAppiumScript, [workspaceDir], null, (code, output) => {
    if (code !== 0) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Falló el inicio de Appium. Terminando.`
      });
      return cleanupAndExit(1);
    }
    
    const { APPIUM_PID, APPIUM_PORT } = parseScriptOutput(output);
    environment.appiumPid = APPIUM_PID;
    environment.appiumPort = APPIUM_PORT;
    
    sendToParent({
      type: 'LOG',
      data: `[worker] ✅ Appium iniciado en puerto ${environment.appiumPort}.`
    });
    
    // Instalar APK
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
            data: `[worker] ❌ Falló la instalación del APK. Terminando.`
          });
          return cleanupAndExit(1);
        }
        
        sendToParent({
          type: 'LOG',
          data: `[worker] ✅ APK de cliente ${client} instalado.`
        });
        
        // Notificar que el worker está listo
        sendToParent({ type: 'READY' });
      }
    );
  });
}
```

## 📊 Gestión de Versiones

### 1. Sistema de Versionado
```javascript
// server.js - Gestor de versiones de APKs
class ApkVersionManager {
  constructor() {
    this.versions = new Map();
    this.versionHistory = [];
  }
  
  async loadVersions() {
    try {
      const apkDir = path.join(__dirname, 'apks');
      
      if (!await fs.pathExists(apkDir)) {
        await fs.ensureDir(apkDir);
        return;
      }
      
      const files = await fs.readdir(apkDir);
      const apkFiles = files.filter(file => file.endsWith('.apk'));
      
      for (const file of apkFiles) {
        const version = this.extractVersionFromFilename(file);
        const apkPath = path.join(apkDir, file);
        
        const apkInfo = await this.getApkInfo(apkPath);
        
        this.versions.set(version, {
          version,
          filename: file,
          path: apkPath,
          size: apkInfo.size,
          packageInfo: apkInfo.packageInfo,
          uploadedAt: apkInfo.uploadedAt || (await fs.stat(apkPath)).mtime
        });
      }
      
      console.log(`Loaded ${this.versions.size} APK versions`);
      
    } catch (error) {
      console.error('Error loading APK versions:', error);
    }
  }
  
  extractVersionFromFilename(filename) {
    // Patrones comunes de nombres de APK
    const patterns = [
      /app-(.+)\.apk$/,
      /(.+)-release\.apk$/,
      /(.+)-debug\.apk$/,
      /(.+)\.apk$/
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return filename;
  }
  
  async getApkInfo(apkPath) {
    try {
      const stats = await fs.stat(apkPath);
      
      // Obtener información del paquete usando aapt
      const result = await spawnAsync('aapt', ['dump', 'badging', apkPath]);
      
      if (result.code !== 0) {
        throw new Error('Failed to get APK info');
      }
      
      const packageInfo = this.parseAaptOutput(result.stdout);
      
      return {
        size: stats.size,
        packageInfo,
        uploadedAt: stats.mtime
      };
      
    } catch (error) {
      console.error('Error getting APK info:', error);
      return {
        size: 0,
        packageInfo: null,
        uploadedAt: new Date()
      };
    }
  }
  
  parseAaptOutput(output) {
    const packageInfo = {
      package: '',
      versionCode: '',
      versionName: '',
      platformBuildVersionName: '',
      permissions: [],
      usesPermissions: [],
      features: [],
      launchableActivities: []
    };
    
    // Parsear línea por línea
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('package:')) {
        const match = trimmed.match(/name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
        if (match) {
          packageInfo.package = match[1];
          packageInfo.versionCode = match[2];
          packageInfo.versionName = match[3];
        }
      } else if (trimmed.startsWith('launchable-activity:')) {
        const match = trimmed.match(/name='([^']+)'/);
        if (match) {
          packageInfo.launchableActivities.push(match[1]);
        }
      } else if (trimmed.startsWith('uses-permission:')) {
        const match = trimmed.match(/name='([^']+)'/);
        if (match) {
          packageInfo.usesPermissions.push(match[1]);
        }
      } else if (trimmed.startsWith('uses-feature:')) {
        const match = trimmed.match(/name='([^']+)'/);
        if (match) {
          packageInfo.features.push(match[1]);
        }
      }
    }
    
    return packageInfo;
  }
}
```

### 2. API de Versiones
```javascript
// server.js - Endpoints de versiones
// Obtener información de versión específica
app.get('/api/apk/version/:version', requireAuth, async (req, res) => {
  try {
    const { version } = req.params;
    
    const apkInfo = apkVersionManager.versions.get(version);
    if (!apkInfo) {
      return res.status(404).json({ error: 'Versión de APK no encontrada' });
    }
    
    res.json(apkInfo);
    
  } catch (error) {
    console.error('Error getting APK version info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar versión de APK
app.delete('/api/apk/version/:version', requireAuth, async (req, res) => {
  try {
    const { version } = req.params;
    
    const apkInfo = apkVersionManager.versions.get(version);
    if (!apkInfo) {
      return res.status(404).json({ error: 'Versión de APK no encontrada' });
    }
    
    // Eliminar archivo
    await fs.unlink(apkInfo.path);
    
    // Remover del gestor
    apkVersionManager.versions.delete(version);
    
    console.log(`APK version ${version} deleted by ${req.user.displayName}`);
    
    res.json({
      success: true,
      version,
      deletedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error deleting APK version:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 🛡️ Seguridad y Validaciones

### 1. Validaciones de Seguridad
```javascript
// server.js - Middleware de seguridad para APKs
function validateApkUpload(req, res, next) {
  // Verificar tamaño del archivo
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (req.file && req.file.size > maxSize) {
    return res.status(400).json({ 
      error: 'El APK excede el tamaño máximo de 100MB' 
    });
  }
  
  // Verificar tipo de archivo
  if (req.file && !req.file.originalname.endsWith('.apk')) {
    return res.status(400).json({ 
      error: 'El archivo debe ser un APK' 
    });
  }
  
  // Verificar tipo MIME
  if (req.file && req.file.mimetype !== 'application/vnd.android.package-archive') {
    // Permitir continuar pero advertir
    console.warn(`Suspicious MIME type for APK upload: ${req.file.mimetype}`);
  }
  
  next();
}
```

### 2. Limpieza de Archivos
```javascript
// server.js - Limpieza de APKs temporales
class ApkCleanupManager {
  constructor() {
    this.cleanupInterval = null;
    this.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días
  }
  
  startCleanup() {
    // Limpiar cada 24 horas
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldApks();
    }, 24 * 60 * 60 * 1000);
  }
  
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  async cleanupOldApks() {
    try {
      const apkDir = path.join(__dirname, 'apks');
      
      if (!await fs.pathExists(apkDir)) {
        return;
      }
      
      const files = await fs.readdir(apkDir);
      const now = Date.now();
      
      for (const file of files) {
        if (file.endsWith('.apk') && file.startsWith('uploaded-')) {
          const filePath = path.join(apkDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > this.maxAge) {
            await fs.unlink(filePath);
            console.log(`Cleaned up old APK: ${file}`);
          }
        }
      }
      
    } catch (error) {
      console.error('Error cleaning up APKs:', error);
    }
  }
}
```

## 📖 Documentos Relacionados

- [01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [04-device-management.md](./04-device-management.md) - Gestión de dispositivos
- [06-wiremock-integration.md](./06-wiremock-integration.md) - Integración WireMock
- [02-backend/04-worker-system.md](../02-backend/04-worker-system.md) - Sistema de workers