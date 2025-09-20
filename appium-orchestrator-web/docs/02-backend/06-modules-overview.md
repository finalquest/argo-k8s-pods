# Módulos del Backend - Guía Completa

## 📋 Visión General

El backend de Appium Orchestrator Web ha sido refactorizado en una arquitectura modular de **17 componentes especializados**, cada uno con responsabilidades claras y bien definidas.

## 🏗️ Estructura de Módulos

### 📁 `src/modules/security/` - Módulos de Seguridad

#### 1. **authentication.js** - Gestión de Autenticación

**Responsabilidades:**

- Configuración de Google OAuth 2.0 con Passport.js
- Gestión de sesiones de usuario
- Serialización/deserialización de usuarios
- Middleware de autenticación

**Clase Principal:** `AuthenticationManager`

**Dependencias:**

- `ConfigurationManager` para obtener credenciales OAuth
- `ValidationManager` para validar perfiles de usuario

```javascript
const AuthenticationManager = require('./src/modules/security/authentication');
const authManager = new AuthenticationManager(configManager, validationManager);

// Uso en rutas
app.get('/auth/google', authManager.authenticate());
app.get('/auth/google/callback', authManager.authenticateCallback());
```

#### 2. **configuration.js** - Gestión de Configuración

**Responsabilidades:**

- Carga y validación de variables de entorno
- Gestión de configuración segura
- Proveer configuración a otros módulos
- Validación de configuración requerida

**Clase Principal:** `ConfigurationManager`

**Características:**

- Validación de variables requeridas
- Tipos de datos fuertes
- Valores por defecto seguros
- Acceso seguro a credenciales

```javascript
const ConfigurationManager = require('./src/modules/security/configuration');
const configManager = new ConfigurationManager();

// Obtener configuración
const clientId = configManager.get('GOOGLE_CLIENT_ID');
const port = configManager.get('PORT', 3000);
```

#### 3. **validation.js** - Validación de Entradas

**Responsabilidades:**

- Validación de datos de entrada
- Sanitización de strings y rutas
- Validación de perfiles de usuario
- Validación de payloads de API

**Clase Principal:** `ValidationManager`

**Validaciones:**

- Nombres de archivos y rutas
- Datos de usuario y perfiles
- Parámetros de API
- Estructuras de datos

```javascript
const ValidationManager = require('./src/modules/security/validation');
const validationManager = new ValidationManager();

// Validar entrada
const isValid = validationManager.validateFileName(fileName);
const isSafe = validationManager.validatePath(userPath);
```

### 📁 `src/modules/core/` - Módulos de API Central

#### 4. **branch-manager.js** - Operaciones Git

**Responsabilidades:**

- Gestión de branches Git
- Operaciones de commit y push
- Verificación de estado de repositorios
- Gestión de conflictos

**Clase Principal:** `BranchManager`

**Dependencias:**

- `ConfigurationManager`
- `ValidationManager`
- `GitOperationsService`

```javascript
const BranchManager = require('./src/modules/core/branch-manager');
const branchManager = new BranchManager(configManager, validationManager);

// Operaciones Git
const branches = await branchManager.getBranches();
const status = await branchManager.getBranchStatus('develop');
await branchManager.commitChanges('develop', ['file1.js'], 'Commit message');
```

#### 5. **device-manager.js** - Gestión de Dispositivos

**Responsabilidades:**

- Detección y gestión de dispositivos locales
- Conexión con dispositivos Appium
- Verificación de estado de dispositivos
- Gestión de dispositivos USB/emuladores

**Clase Principal:** `DeviceManager`

**Características:**

- Detección automática de dispositivos
- Verificación de compatibilidad Appium
- Monitoreo de estado de dispositivos

```javascript
const DeviceManager = require('./src/modules/core/device-manager');
const deviceManager = new DeviceManager(configManager, validationManager);

// Gestión de dispositivos
const devices = await deviceManager.getLocalDevices();
const isAvailable = await deviceManager.isDeviceAvailable(deviceId);
```

#### 6. **apk-manager.js** - Manejo de APKs

**Responsabilidades:**

- Gestión de archivos APK
- Instalación y desinstalación de APKs
- Verificación de integridad de APKs
- Gestión de versiones

**Clase Principal:** `ApkManager`

**Dependencias:**

- `ConfigurationManager`
- `ValidationManager`
- `FileOperationsService`

```javascript
const ApkManager = require('./src/modules/core/apk-manager');
const apkManager = new ApkManager(configManager, validationManager);

// Operaciones con APKs
await apkManager.installApk(deviceId, apkPath);
const version = await apkManager.getApkVersion(apkPath);
```

#### 7. **feature-manager.js** - Gestión de Features

**Responsabilidades:**

- Gestión de archivos de features
- Lectura y escritura de features
- Validación de sintaxis de features
- Gestión de estructuras de directorios

**Clase Principal:** `FeatureManager`

**Características:**

- Soporte para múltiples formatos
- Validación de sintaxis
- Gestión de dependencias

```javascript
const FeatureManager = require('./src/modules/core/feature-manager');
const featureManager = new FeatureManager(configManager, validationManager);

// Operaciones con features
const features = await featureManager.getFeatures(branch, client);
const content = await featureManager.getFeatureContent(branch, client, feature);
await featureManager.saveFeatureContent(branch, client, feature, content);
```

#### 8. **workspace-manager.js** - Operaciones con Workspaces

**Responsabilidades:**

- Gestión de workspaces por branch
- Preparación y limpieza de workspaces
- Verificación de estado de workspaces
- Gestión de archivos temporales

**Clase Principal:** `WorkspaceManager`

**Dependencias:**

- `ConfigurationManager`
- `ValidationManager`
- `FileOperationsService`
- `GitOperationsService`

```javascript
const WorkspaceManager = require('./src/modules/core/workspace-manager');
const workspaceManager = new WorkspaceManager(configManager, validationManager);

// Operaciones con workspaces
const status = await workspaceManager.getWorkspaceStatus('develop');
await workspaceManager.prepareWorkspace('develop');
await workspaceManager.cleanupWorkspace('develop');
```

### 📁 `src/modules/worker-management/` - Módulos de Workers

#### 9. **worker-pool-manager.js** - Gestión del Pool de Workers

**Responsabilidades:**

- Gestión del pool de workers
- Creación y destrucción de workers
- Asignación de trabajos a workers
- Monitoreo de recursos

**Clase Principal:** `WorkerPoolManager`

**Características:**

- Escalado automático
- Monitoreo de recursos
- Manejo de errores
- Balanceo de carga

```javascript
const WorkerPoolManager = require('./src/modules/worker-management/worker-pool-manager');
const workerPoolManager = new WorkerPoolManager(
  configManager,
  validationManager,
  processManager,
  jobQueueManager,
);

// Gestión del pool
const status = await workerPoolManager.getPoolStatus();
const success = await workerPoolManager.assignJob(job);
```

#### 10. **job-queue-manager.js** - Cola de Trabajos

**Responsabilidades:**

- Gestión de la cola de trabajos
- Priorización de trabajos
- Gestión de estados de trabajos
- Manejo de trabajos fallidos

**Clase Principal:** `JobQueueManager`

**Características:**

- Priorización de trabajos
- Reintentos automáticos
- Estados de trabajos
- Métricas de cola

```javascript
const JobQueueManager = require('./src/modules/worker-management/job-queue-manager');
const jobQueueManager = new JobQueueManager(configManager, validationManager);

// Gestión de cola
await jobQueueManager.addToQueue(job, 'high');
const queueStatus = await jobQueueManager.getQueueStatus();
```

#### 11. **process-manager.js** - Gestión de Procesos

**Responsabilidades:**

- Gestión de procesos child
- Monitoreo de procesos
- Manejo de señales
- Limpieza de procesos zombies

**Clase Principal:** `ProcessManager`

**Características:**

- Manejo de ciclos de vida
- Monitoreo de recursos
- Señales y eventos
- Limpieza automática

```javascript
const ProcessManager = require('./src/modules/worker-management/process-manager');
const processManager = new ProcessManager(configManager, validationManager);

// Gestión de procesos
const process = await processManager.createProcess(workerPath, args);
await processManager.monitorProcess(process);
```

#### 12. **resource-manager.js** - Gestión de Recursos

**Responsabilidades:**

- Gestión de recursos del sistema
- Monitoreo de memoria y CPU
- Limpieza de recursos
- Optimización de rendimiento

**Clase Principal:** `ResourceManager`

**Características:**

- Monitoreo en tiempo real
- Límites de recursos
- Limpieza automática
- Métricas de rendimiento

```javascript
const ResourceManager = require('./src/modules/worker-management/resource-manager');
const resourceManager = new ResourceManager(configManager, validationManager);

// Gestión de recursos
const usage = await resourceManager.getResourceUsage();
const canCreate = await resourceManager.canCreateWorker();
```

### 📁 `src/modules/socketio/` - Módulos de Comunicación

#### 13. **socketio-manager.js** - Comunicación en Tiempo Real

**Responsabilidades:**

- Gestión de conexiones Socket.IO
- Manejo de eventos en tiempo real
- Emisión de eventos a clientes
- Gestión de salas y namespaces

**Clase Principal:** `SocketIOManager`

**Características:**

- Eventos personalizados
- Gestión de salas
- Manejo de desconexiones
- Emisión en tiempo real

```javascript
const SocketIOManager = require('./src/modules/socketio/socketio-manager');
const socketIOManager = new SocketIOManager(configManager, validationManager);

// Gestión de Socket.IO
socketIOManager.handleConnection(socket);
socketIOManager.emitToUser(userId, 'event', data);
socketIOManager.broadcastToRoom(room, 'event', data);
```

### 📁 `src/modules/services/` - Módulos de Servicios

#### 14. **git-operations.js** - Servicios Git Avanzados

**Responsabilidades:**

- Operaciones Git complejas
- Gestión de repositorios
- Manejo de conflictos
- Operaciones de merge y rebase

**Clase Principal:** `GitOperationsService`

**Características:**

- Operaciones asíncronas
- Manejo de errores
- Estados de repositorios
- Historial de cambios

```javascript
const GitOperationsService = require('./src/modules/services/git-operations');
const gitService = new GitOperationsService(configManager, validationManager);

// Operaciones Git avanzadas
const history = await gitService.getCommitHistory(branch);
const conflicts = await gitService.checkConflicts(branch);
await gitService.mergeBranch(source, target);
```

#### 15. **file-operations.js** - Operaciones de Archivos

**Responsabilidades:**

- Operaciones de sistema de archivos
- Gestión de directorios
- Manejo de permisos
- Operaciones asíncronas de archivos

**Clase Principal:** `FileOperationsService`

**Características:**

- Operaciones seguras
- Manejo de permisos
- Operaciones asíncronas
- Validación de rutas

```javascript
const FileOperationsService = require('./src/modules/services/file-operations');
const fileService = new FileOperationsService(configManager, validationManager);

// Operaciones de archivos
await fileService.ensureDirectoryExists(path);
const content = await fileService.readFile(filePath);
await fileService.writeFile(filePath, content);
```

### 📁 `src/modules/utils/` - Módulos de Utilidades

#### 16. **path-utilities.js** - Utilidades de Rutas

**Responsabilidades:**

- Utilidades de manipulación de rutas
- Normalización de rutas
- Validación de rutas seguras
- Resolución de rutas relativas

**Clase Principal:** `PathUtilities`

**Características:**

- Rutas seguras
- Normalización
- Resolución
- Validación

```javascript
const PathUtilities = require('./src/modules/utils/path-utilities');
const pathUtils = new PathUtilities();

// Utilidades de rutas
const safePath = pathUtils.getSafePath(userInput);
const normalized = pathUtils.normalizePath(path);
const resolved = pathUtils.resolvePath(relativePath);
```

#### 17. **string-utilities.js** - Utilidades de Strings

**Responsabilidades:**

- Utilidades de manipulación de strings
- Sanitización de strings
- Validación de formatos
- Utilidades de codificación

**Clase Principal:** `StringUtilities`

**Características:**

- Sanitización
- Validación
- Formateo
- Codificación

```javascript
const StringUtilities = require('./src/modules/utils/string-utilities');
const stringUtils = new StringUtilities();

// Utilidades de strings
const sanitized = stringUtils.sanitizeInput(userInput);
const isValid = stringUtils.validateEmail(email);
const formatted = stringUtils.formatFileSize(bytes);
```

#### 18. **logging-utilities.js** - Sistema de Logging

**Responsabilidades:**

- Sistema de logging estructurado
- Múltiples niveles de log
- Rotación de archivos
- Formatos de salida

**Clase Principal:** `LoggingUtilities`

**Características:**

- Logging estructurado
- Múltiples niveles
- Rotación automática
- Formatos JSON/texto

```javascript
const LoggingUtilities = require('./src/modules/utils/logging-utilities');
const loggingUtilities = new LoggingUtilities(configManager);

// Logging estructurado
loggingUtilities.log('Mensaje de info', 'info', { userId: '123' });
loggingUtilities.log('Mensaje de error', 'error', { error: err });
loggingUtilities.log('Mensaje de debug', 'debug', { data: complexObject });
```

## 🔄 Flujo de Inicialización de Módulos

```javascript
// server.js - Inicialización de todos los módulos
const configManager = new ConfigurationManager();
const validationManager = new ValidationManager();
const authManager = new AuthenticationManager(configManager, validationManager);

// Módulos Core
const branchManager = new BranchManager(configManager, validationManager);
const deviceManager = new DeviceManager(configManager, validationManager);
const apkManager = new ApkManager(configManager, validationManager);
const featureManager = new FeatureManager(configManager, validationManager);
const workspaceManager = new WorkspaceManager(configManager, validationManager);

// Módulos de Servicios
const gitService = new GitOperationsService(configManager, validationManager);
const fileService = new FileOperationsService(configManager, validationManager);

// Módulos de Utils
const pathUtils = new PathUtilities();
const stringUtils = new StringUtilities();
const loggingUtilities = new LoggingUtilities(configManager);

// Módulos de Worker Management
const jobQueueManager = new JobQueueManager(configManager, validationManager);
const processManager = new ProcessManager(configManager, validationManager);
const resourceManager = new ResourceManager(configManager, validationManager);
const workerPoolManager = new WorkerPoolManager(
  configManager,
  validationManager,
  processManager,
  jobQueueManager,
);

// Módulo Socket.IO
const socketIOManager = new SocketIOManager(configManager, validationManager);
```

## 🧪 Pruebas de Módulos

Cada módulo incluye su propia suite de pruebas:

```javascript
// Ejemplo de estructura de pruebas para un módulo
describe('AuthenticationManager', () => {
  let authManager;
  let configManager;
  let validationManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
    validationManager = new ValidationManager();
    authManager = new AuthenticationManager(configManager, validationManager);
  });

  test('should initialize Google strategy correctly', () => {
    expect(authManager).toBeDefined();
  });

  test('should validate user profiles', () => {
    const validProfile = { id: '123', email: 'test@example.com' };
    expect(validationManager.validateUserProfile(validProfile)).toBe(true);
  });
});
```

## 📊 Métricas de la Arquitectura Modular

- **Total de módulos**: 17
- **Líneas de código originales**: 2,232
- **Líneas de código modularizadas**: Distribuidas en 17 archivos
- **Tests totales**: 259 (100% pasando)
- **Cobertura de código**: 90%+
- **Tiempo de ejecución de tests**: <3 segundos
- **Compatibilidad**: 100% mantenida

## 🚀 Beneficios de la Arquitectura Modular

1. **Mantenibilidad**: Código más fácil de mantener y depurar
2. **Reutilización**: Módulos pueden ser reutilizados en otros proyectos
3. **Testing**: Pruebas más sencillas y específicas
4. **Colaboración**: Varios desarrolladores pueden trabajar en diferentes módulos
5. **Escalabilidad**: Fácil añadir nueva funcionalidad
6. **Documentación**: Cada módulo tiene su propia documentación

## 📖 Documentación Relacionada

- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Documentación general de arquitectura
- [01-arquitectura-general.md](../01-arquitectura-general.md) - Arquitectura general del sistema
- [02-backend/01-server-architecture.md](./01-server-architecture.md) - Arquitectura del servidor
- `InspectorManager` recibe el `WorkerPoolManager` para consultar y registrar sesiones activas (incluyendo identificadores virtuales para workers persistentes).
- Las capacidades usadas al adjuntarse a un worker establecen `newCommandTimeout = 0`, evitando que Appium cierre la sesión durante inspecciones manuales prolongadas.
- Cada inspección solicita hasta 200 nodos del árbol para cubrir overlays y popups; el límite puede ajustarse vía `INSPECT_MAX_ELEMENTS`.
