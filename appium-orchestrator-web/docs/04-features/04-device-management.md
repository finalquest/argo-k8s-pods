# Features - Gestión de Dispositivos

## 📋 Visión General

La gestión de dispositivos permite a Appium Orchestrator Web manejar tanto emuladores remotos como dispositivos locales para la ejecución de tests. Esta feature es crucial para la ejecución paralela de tests y la gestión eficiente de recursos.

## 🏗️ Arquitectura de Dispositivos

### 1. Tipos de Dispositivos

```javascript
// Tipos de fuentes de dispositivos
const DEVICE_SOURCES = {
  REMOTE: 'remote', // Emuladores en servidor remoto
  LOCAL: 'local', // Dispositivos físicos conectados localmente
};

// Estados de dispositivos
const DEVICE_STATES = {
  AVAILABLE: 'available',
  BUSY: 'busy',
  OFFLINE: 'offline',
  ERROR: 'error',
  LOCKED: 'locked',
};
```

### 2. Flujo de Gestión

```javascript
// Arquitectura de gestión de dispositivos
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Device Pool   │    │   Allocation   │    │   Device        │
│   Manager       │────│   System        │────│   Discovery     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Worker        │
                    │   Assignment    │
                    └─────────────────┘
```

## 🔍 Descubrimiento de Dispositivos

### 1. Detección de Dispositivos Locales

```javascript
// scripts/device-manager.sh - Script de descubrimiento
#!/bin/bash

# Función para listar dispositivos locales
list_local_devices() {
    echo "[DEVICE] Buscando dispositivos locales..."

    # Verificar si ADB está disponible
    if ! command -v adb &> /dev/null; then
        echo "[DEVICE] Error: ADB no encontrado en PATH"
        return 1
    fi

    # Listar dispositivos conectados
    local devices=$(adb devices | grep -v "List of devices" | awk '{print $1}')

    if [ -z "$devices" ]; then
        echo "[DEVICE] No se encontraron dispositivos locales"
        return 0
    fi

    # Recopilar información de cada dispositivo
    while IFS= read -r device_id; do
        if [ -n "$device_id" ]; then
            echo "[DEVICE] Encontrado dispositivo: $device_id"

            # Obtener información del dispositivo
            local manufacturer=$(adb -s "$device_id" shell getprop ro.product.manufacturer 2>/dev/null || echo "Unknown")
            local model=$(adb -s "$device_id" shell getprop ro.product.model 2>/dev/null || echo "Unknown")
            local android_version=$(adb -s "$device_id" shell getprop ro.build.version.release 2>/dev/null || echo "Unknown")

            # Verificar si el dispositivo está listo
            local device_state=$(adb -s "$device_id" get-state 2>/dev/null || echo "unknown")

            echo "DEVICE_INFO:$device_id:$manufacturer:$model:$android_version:$device_state"
        fi
    done <<< "$devices"
}

# Función para verificar dispositivo específico
check_device() {
    local device_id=$1

    if [ -z "$device_id" ]; then
        echo "[DEVICE] Error: No se proporcionó ID de dispositivo"
        return 1
    fi

    # Verificar si el dispositivo existe
    if ! adb devices | grep -q "$device_id"; then
        echo "[DEVICE] Error: Dispositivo $device_id no encontrado"
        return 1
    fi

    # Verificar estado del dispositivo
    local state=$(adb -s "$device_id" get-state 2>/dev/null)
    if [ "$state" != "device" ]; then
        echo "[DEVICE] Error: Dispositivo $device_id no está listo (estado: $state)"
        return 1
    fi

    echo "[DEVICE] Dispositivo $device_id está listo"
    return 0
}
```

### 2. Backend - Descubrimiento de Dispositivos

```javascript
// server.js - Gestor de dispositivos
class DeviceManager {
  constructor() {
    this.devices = new Map();
    this.deviceAllocation = new Map();
    this.localDevices = new Set();
    this.remoteDevices = new Set();
  }

  async discoverDevices() {
    console.log('Iniciando descubrimiento de dispositivos...');

    // Descubrir dispositivos locales
    await this.discoverLocalDevices();

    // Descubrir dispositivos remotos
    if (process.env.DEVICE_SOURCE === 'remote') {
      await this.discoverRemoteDevices();
    }

    console.log(
      `Descubrimiento completado. Locales: ${this.localDevices.size}, Remotos: ${this.remoteDevices.size}`,
    );
  }

  async discoverLocalDevices() {
    try {
      const result = await this.executeScript('./scripts/device-manager.sh', [
        'list',
      ]);
      const lines = result.split('\n');

      for (const line of lines) {
        if (line.startsWith('DEVICE_INFO:')) {
          const [, deviceId, manufacturer, model, androidVersion, state] =
            line.split(':');

          const device = {
            id: deviceId,
            type: 'local',
            manufacturer,
            model,
            androidVersion,
            state: state === 'device' ? 'available' : 'error',
            lastSeen: Date.now(),
          };

          this.devices.set(deviceId, device);
          this.localDevices.add(deviceId);

          console.log(
            `Dispositivo local descubierto: ${deviceId} (${manufacturer} ${model})`,
          );
        }
      }
    } catch (error) {
      console.error('Error descubriendo dispositivos locales:', error);
    }
  }

  async discoverRemoteDevices() {
    try {
      // Consultar API de emuladores remotos
      const response = await fetch(`${process.env.EMULATOR_API_URL}/devices`);
      const devices = await response.json();

      for (const device of devices) {
        const deviceInfo = {
          id: device.id,
          type: 'remote',
          name: device.name,
          platform: device.platform,
          status: device.status === 'ready' ? 'available' : 'busy',
          adbHost: device.adb_host,
          adbPort: device.adb_port,
          lastSeen: Date.now(),
        };

        this.devices.set(device.id, deviceInfo);
        this.remoteDevices.add(device.id);

        console.log(
          `Dispositivo remoto descubierto: ${device.id} (${device.name})`,
        );
      }
    } catch (error) {
      console.error('Error descubriendo dispositivos remotos:', error);
    }
  }
}
```

## 🔒 Bloqueo y Asignación de Dispositivos

### 1. Sistema de Bloqueo

```javascript
// scripts/find-and-lock-emulator.sh - Bloqueo de emuladores
#!/bin/bash

# Función para buscar y bloquear emulador disponible
find_and_lock_emulator() {
    echo "[EMULATOR] Buscando emulador disponible..."

    # Obtener lista de emuladores
    local emulators=$(list_available_emulators)

    if [ -z "$emulators" ]; then
        echo "[EMULATOR] No hay emuladores disponibles"
        return 1
    fi

    # Intentar bloquear cada emulador
    while IFS= read -r emulator_id; do
        if [ -n "$emulator_id" ]; then
            echo "[EMULATOR] Intentando bloquear emulador: $emulator_id"

            if lock_emulator "$emulator_id"; then
                echo "[EMULATOR] ✅ Emulador $emulator_id bloqueado"
                echo "EMULATOR_LOCKED:$emulator_id:$ADB_HOST"
                return 0
            fi
        fi
    done <<< "$emulators"

    echo "[EMULATOR] ❌ No se pudo bloquear ningún emulador"
    return 1
}

# Función para bloquear emulador específico
lock_emulator() {
    local emulator_id=$1

    # Verificar si el emulador está disponible
    if ! is_emulator_available "$emulator_id"; then
        echo "[EMULATOR] Emulador $emulator_id no está disponible"
        return 1
    fi

    # Crear archivo de lock
    local lock_file="/tmp/emulator-$emulator_id.lock"
    if [ -f "$lock_file" ]; then
        echo "[EMULATOR] Emulador $emulator_id ya está bloqueado"
        return 1
    fi

    # Crear lock con información del worker
    echo "LOCKED_BY:$$" > "$lock_file"
    echo "LOCKED_AT:$(date +%s)" >> "$lock_file"
    echo "WORKSPACE:${WORKSPACE_DIR}" >> "$lock_file"

    # Configurar variables de entorno ADB
    export ADB_HOST=$(get_emulator_adb_host "$emulator_id")
    export EMULATOR_ID="$emulator_id"

    return 0
}

# Función para liberar emulador
release_emulator() {
    local emulator_id=$1
    local adb_host=$2

    echo "[EMULATOR] Liberando emulador: $emulator_id"

    # Remover archivo de lock
    local lock_file="/tmp/emulator-$emulator_id.lock"
    if [ -f "$lock_file" ]; then
        rm -f "$lock_file"
        echo "[EMULATOR] ✅ Lock removido"
    fi

    # Limpiar variables de entorno
    unset ADB_HOST
    unset EMULATOR_ID

    return 0
}
```

### 2. Backend - Gestor de Asignación

```javascript
// server.js - Sistema de asignación de dispositivos
class DeviceAllocator {
  constructor() {
    this.allocations = new Map();
    this.queues = new Map();
  }

  async allocateDevice(jobRequirements) {
    const { deviceSerial, deviceSource, preferredType } = jobRequirements;

    // Si se especificó un dispositivo específico
    if (deviceSerial) {
      return await this.allocateSpecificDevice(deviceSerial, deviceSource);
    }

    // Asignar dispositivo según preferencias
    return await this.allocateBestDevice(preferredType);
  }

  async allocateSpecificDevice(deviceId, source) {
    const device = deviceManager.devices.get(deviceId);

    if (!device) {
      throw new Error(`Dispositivo ${deviceId} no encontrado`);
    }

    if (device.type !== source) {
      throw new Error(`Dispositivo ${deviceId} no es de tipo ${source}`);
    }

    if (this.allocations.has(deviceId)) {
      throw new Error(`Dispositivo ${deviceId} ya está asignado`);
    }

    // Verificar disponibilidad
    if (!(await this.checkDeviceAvailability(deviceId))) {
      throw new Error(`Dispositivo ${deviceId} no está disponible`);
    }

    // Asignar dispositivo
    this.allocations.set(deviceId, {
      jobId: jobRequirements.jobId,
      allocatedAt: Date.now(),
      expectedDuration: jobRequirements.estimatedDuration || 300000,
    });

    console.log(
      `Dispositivo ${deviceId} asignado al job ${jobRequirements.jobId}`,
    );

    return {
      deviceId,
      type: device.type,
      adbHost: device.adbHost || deviceId,
      allocationId: this.generateAllocationId(),
    };
  }

  async allocateBestDevice(preferredType) {
    const availableDevices = Array.from(deviceManager.devices.values())
      .filter((device) => !this.allocations.has(device.id))
      .filter((device) => this.checkDeviceAvailability(device.id));

    if (availableDevices.length === 0) {
      throw new Error('No hay dispositivos disponibles');
    }

    // Priorizar dispositivos según tipo
    let candidateDevices = availableDevices;
    if (preferredType) {
      candidateDevices = availableDevices.filter(
        (device) => device.type === preferredType,
      );
    }

    if (candidateDevices.length === 0) {
      candidateDevices = availableDevices;
    }

    // Seleccionar dispositivo menos utilizado recientemente
    const selectedDevice = candidateDevices.reduce((best, current) => {
      return !best.lastUsed || current.lastUsed < best.lastUsed
        ? current
        : best;
    });

    return await this.allocateSpecificDevice(
      selectedDevice.id,
      selectedDevice.type,
    );
  }

  async releaseDevice(deviceId) {
    const allocation = this.allocations.get(deviceId);
    if (!allocation) {
      return;
    }

    // Liberar bloqueo físico si es remoto
    const device = deviceManager.devices.get(deviceId);
    if (device && device.type === 'remote') {
      await this.releaseRemoteDevice(deviceId);
    }

    // Remover asignación
    this.allocations.delete(deviceId);

    console.log(`Dispositivo ${deviceId} liberado`);
  }

  async checkDeviceAvailability(deviceId) {
    const device = deviceManager.devices.get(deviceId);
    if (!device) {
      return false;
    }

    if (device.type === 'local') {
      return await this.checkLocalDeviceAvailability(deviceId);
    } else {
      return await this.checkRemoteDeviceAvailability(deviceId);
    }
  }
}
```

## 🎛️ Interface de Usuario

### 1. Selector de Dispositivos

```javascript
// public/js/ui.js - Componente de selección de dispositivos
export function createDeviceSelector(devices) {
  const container = document.createElement('div');
  container.className = 'device-selector';

  const label = document.createElement('label');
  label.textContent = 'Dispositivo:';
  label.htmlFor = 'device-select';

  const select = document.createElement('select');
  select.id = 'device-select';
  select.className = 'device-select';

  // Opción por defecto
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Seleccionar dispositivo...';
  select.appendChild(defaultOption);

  // Agrupar dispositivos por tipo
  const localDevices = devices.filter((d) => d.type === 'local');
  const remoteDevices = devices.filter((d) => d.type === 'remote');

  // Dispositivos locales
  if (localDevices.length > 0) {
    const localGroup = document.createElement('optgroup');
    localGroup.label = 'Dispositivos Locales';

    localDevices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.manufacturer} ${device.model} (${device.id})`;
      option.dataset.type = 'local';
      localGroup.appendChild(option);
    });

    select.appendChild(localGroup);
  }

  // Dispositivos remotos
  if (remoteDevices.length > 0) {
    const remoteGroup = document.createElement('optgroup');
    remoteGroup.label = 'Emuladores Remotos';

    remoteDevices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name} (${device.platform})`;
      option.dataset.type = 'remote';
      remoteGroup.appendChild(option);
    });

    select.appendChild(remoteGroup);
  }

  container.appendChild(label);
  container.appendChild(select);

  return container;
}
```

### 2. Monitoreo de Estado

```javascript
// public/js/device-monitor.js - Monitoreo de dispositivos
class DeviceMonitor {
  constructor() {
    this.devices = new Map();
    this.statusInterval = null;
  }

  async startMonitoring() {
    // Actualizar estado cada 30 segundos
    this.statusInterval = setInterval(async () => {
      await this.updateDeviceStatus();
    }, 30000);

    // Actualización inicial
    await this.updateDeviceStatus();
  }

  stopMonitoring() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  async updateDeviceStatus() {
    try {
      const response = await fetch('/api/devices/status');
      const devices = await response.json();

      // Actualizar estado local
      devices.forEach((device) => {
        this.devices.set(device.id, device);
      });

      // Actualizar UI
      this.updateDeviceUI();
    } catch (error) {
      console.error('Error actualizando estado de dispositivos:', error);
    }
  }

  updateDeviceUI() {
    const deviceSelect = document.getElementById('device-select');
    if (!deviceSelect) return;

    const currentValue = deviceSelect.value;

    // Actualizar opciones según disponibilidad
    Array.from(deviceSelect.options).forEach((option) => {
      if (option.value) {
        const device = this.devices.get(option.value);
        if (device) {
          option.disabled = device.state !== 'available';
          option.textContent = this.formatDeviceOption(device);
        }
      }
    });

    // Restaurar selección si es posible
    if (currentValue) {
      const selectedOption = deviceSelect.querySelector(
        `option[value="${currentValue}"]`,
      );
      if (selectedOption && !selectedOption.disabled) {
        deviceSelect.value = currentValue;
      }
    }
  }

  formatDeviceOption(device) {
    const status = device.state === 'available' ? '✓' : '✗';
    const busyIndicator = device.state === 'busy' ? ' (Ocupado)' : '';

    if (device.type === 'local') {
      return `${status} ${device.manufacturer} ${device.model} (${device.id})${busyIndicator}`;
    } else {
      return `${status} ${device.name} (${device.platform})${busyIndicator}`;
    }
  }
}
```

## 📊 Integración con Workers

### 1. Asignación en Workers

```javascript
// worker.js - Integración con dispositivos
function setupDeviceAndAppium() {
  const deviceSource = process.env.DEVICE_SOURCE;

  if (deviceSource === 'local') {
    // Configurar dispositivo local
    if (!deviceSerialForLocalWorker) {
      sendToParent({
        type: 'LOG',
        data: `[worker] ❌ Error: DEVICE_SOURCE=local pero no se proveyó deviceSerial`,
      });
      return process.exit(1);
    }

    environment.adbHost = deviceSerialForLocalWorker;
    sendToParent({
      type: 'LOG',
      data: `[worker] ✅ Dispositivo local asignado: ${environment.adbHost}`,
    });

    finishSetup();
  } else {
    // Modo remoto: buscar y bloquear emulador
    const findEmulatorScript = path.join(
      __dirname,
      'scripts',
      'find-and-lock-emulator.sh',
    );
    runScript(findEmulatorScript, [], null, (code, output) => {
      if (code !== 0) {
        sendToParent({
          type: 'LOG',
          data: `[worker] ❌ No se pudo bloquear un emulador. Terminando.`,
        });
        return process.exit(1);
      }

      const { EMULATOR_ID, ADB_HOST } = parseScriptOutput(output);
      environment.emulatorId = EMULATOR_ID;
      environment.adbHost = ADB_HOST;

      sendToParent({
        type: 'LOG',
        data: `[worker] ✅ Emulador ${environment.emulatorId} bloqueado. ADB_HOST: ${environment.adbHost}`,
      });

      finishSetup();
    });
  }
}
```

### 2. Liberación de Recursos

```javascript
// worker.js - Limpieza de dispositivos
function cleanupAndExit(code) {
  sendToParent({
    type: 'LOG',
    data: `[worker] Iniciando limpieza...`,
  });

  // Detener Appium
  if (environment.appiumPid) {
    const stopAppiumScript = path.join(__dirname, 'scripts', 'stop-appium.sh');
    try {
      execSync(`bash ${stopAppiumScript} ${environment.appiumPid}`);
    } catch {
      /* Ignorar errores */
    }
  }

  // Liberar emulador si es remoto
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

  // Limpiar workspace si no es persistente
  if (!isWorkspacePersistent && workspaceDir && fs.existsSync(workspaceDir)) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    sendToParent({
      type: 'LOG',
      data: `[worker] Workspace temporal ${workspaceDir} eliminado`,
    });
  }

  sendToParent({
    type: 'LOG',
    data: `[worker] Limpieza completa. Saliendo con código ${code}`,
  });

  process.exit(code);
}
```

## 🔧 API de Dispositivos

### 1. Endpoints de Dispositivos

```javascript
// server.js - API de dispositivos
// Obtener estado de dispositivos
app.get('/api/devices/status', requireAuth, async (req, res) => {
  try {
    const devices = await deviceManager.getAllDevicesStatus();

    res.json({
      devices,
      total: devices.length,
      available: devices.filter((d) => d.state === 'available').length,
      busy: devices.filter((d) => d.state === 'busy').length,
      local: devices.filter((d) => d.type === 'local').length,
      remote: devices.filter((d) => d.type === 'remote').length,
    });
  } catch (error) {
    console.error('Error getting device status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar estado de dispositivo
app.post('/api/devices/:deviceId/status', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { state, error } = req.body;

    await deviceManager.updateDeviceStatus(deviceId, state, error);

    res.json({
      success: true,
      deviceId,
      state,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error updating device status:', error);
    res.status(500).json({ error: error.message });
  }
});
```

## 🛡️ Manejo de Errores y Recuperación

### 1. Detección de Dispositivos Caídos

```javascript
// server.js - Monitoreo de salud de dispositivos
class DeviceHealthMonitor {
  constructor() {
    this.healthChecks = new Map();
    this.failedDevices = new Set();
  }

  async checkDeviceHealth(deviceId) {
    const device = deviceManager.devices.get(deviceId);
    if (!device) return false;

    try {
      if (device.type === 'local') {
        return await this.checkLocalDeviceHealth(deviceId);
      } else {
        return await this.checkRemoteDeviceHealth(deviceId);
      }
    } catch (error) {
      console.error(`Error checking health for device ${deviceId}:`, error);
      return false;
    }
  }

  async checkLocalDeviceHealth(deviceId) {
    // Verificar si el dispositivo responde a ADB
    const result = await this.executeCommand(`adb -s ${deviceId} get-state`);
    return result.trim() === 'device';
  }

  async checkRemoteDeviceHealth(deviceId) {
    // Verificar API del emulador
    const device = deviceManager.devices.get(deviceId);
    const response = await fetch(`${device.adbHost}/health`);
    return response.ok;
  }

  handleDeviceFailure(deviceId, error) {
    console.error(`Device ${deviceId} failed:`, error);

    // Marcar dispositivo como no disponible
    this.failedDevices.add(deviceId);

    // Liberar asignaciones activas
    const allocation = deviceAllocator.allocations.get(deviceId);
    if (allocation) {
      deviceAllocator.releaseDevice(deviceId);

      // Notificar error del job
      const io = app.get('io');
      io.emit('device_error', {
        deviceId,
        jobId: allocation.jobId,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }
}
```

## 📖 Documentos Relacionados

- [01-test-execution.md](./01-test-execution.md) - Ejecución de tests
- [02-workspace-management.md](./02-workspace-management.md) - Gestión de workspaces
- [03-git-integration.md](./03-git-integration.md) - Integración Git
- [05-apk-management.md](./05-apk-management.md) - Gestión de APKs
- [02-backend/04-worker-system.md](../02-backend/04-worker-system.md) - Sistema de workers
