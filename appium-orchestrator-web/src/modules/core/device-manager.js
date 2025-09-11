// Device Manager Module
// Handles local and remote device management, ADB operations, and device discovery

const { exec, spawn } = require('child_process');
const path = require('path');

class DeviceManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.devices = new Map();
    this.monitoredDevices = new Set();
  }

  /**
   * Get all available local devices
   */
  async getLocalDevices() {
    if (this.configManager.get('DEVICE_SOURCE') !== 'local') {
      return { 
        success: true, 
        devices: [],
        source: 'none'
      };
    }

    return new Promise((resolve) => {
      exec('adb devices', (error, stdout) => {
        if (error) {
          console.error(`Error al ejecutar "adb devices": ${error.message}`);
          return resolve({
            success: false,
            error: 'No se pudo ejecutar el comando ADB. Asegúrate de que esté instalado y en el PATH.',
            devices: []
          });
        }

        const devices = stdout
          .split('\n')
          .slice(1)
          .map((line) => line.split('\t'))
          .filter((parts) => parts.length === 2 && parts[1] === 'device')
          .map((parts) => parts[0]);

        // Update internal device cache
        this.updateDeviceCache(devices);

        resolve({
          success: true,
          devices,
          source: 'local'
        });
      });
    });
  }

  /**
   * Get detailed information about a specific device
   */
  async getDeviceInfo(deviceId) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: 'Invalid device ID',
        details: validationErrors 
      };
    }

    try {
      const deviceInfo = await this.executeAdbCommand(deviceId, 'shell getprop');
      const properties = this.parseDeviceProperties(deviceInfo);

      return {
        success: true,
        deviceId,
        properties,
        isOnline: true
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to get device information',
        deviceId
      };
    }
  }

  /**
   * Check if a device is connected and available
   */
  async isDeviceAvailable(deviceId) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return false;
    }

    try {
      const result = await this.executeAdbCommand(deviceId, 'shell echo "test"');
      return result.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get device screen resolution
   */
  async getDeviceResolution(deviceId) {
    try {
      const result = await this.executeAdbCommand(deviceId, 'shell wm size');
      if (result.success) {
        const match = result.output.match(/Physical size: (\d+x\d+)/);
        if (match) {
          return { success: true, resolution: match[1] };
        }
      }
      return { success: false, error: 'Could not get device resolution' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get device battery level
   */
  async getDeviceBattery(deviceId) {
    try {
      const result = await this.executeAdbCommand(deviceId, 'shell dumpsys battery');
      if (result.success) {
        const levelMatch = result.output.match(/level: (\d+)/);
        if (levelMatch) {
          return { success: true, level: parseInt(levelMatch[1]) };
        }
      }
      return { success: false, error: 'Could not get battery level' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Start device monitoring
   */
  startDeviceMonitoring() {
    if (this.configManager.get('DEVICE_SOURCE') !== 'local') {
      return;
    }

    // Monitor device connections/disconnections
    setInterval(async () => {
      const result = await this.getLocalDevices();
      if (result.success) {
        const currentDevices = new Set(result.devices);
        
        // Detect new devices
        currentDevices.forEach(deviceId => {
          if (!this.monitoredDevices.has(deviceId)) {
            this.onDeviceConnected(deviceId);
            this.monitoredDevices.add(deviceId);
          }
        });

        // Detect disconnected devices
        this.monitoredDevices.forEach(deviceId => {
          if (!currentDevices.has(deviceId)) {
            this.onDeviceDisconnected(deviceId);
            this.monitoredDevices.delete(deviceId);
          }
        });
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop device monitoring
   */
  stopDeviceMonitoring() {
    this.monitoredDevices.clear();
  }

  /**
   * Execute an ADB command on a specific device
   */
  async executeAdbCommand(deviceId, command) {
    return new Promise((resolve) => {
      exec(`adb -s ${deviceId} ${command}`, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: error.message,
            stderr
          });
        } else {
          resolve({
            success: true,
            output: stdout,
            stderr
          });
        }
      });
    });
  }

  /**
   * Install APK on device
   */
  async installApk(deviceId, apkPath) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: 'Invalid device ID',
        details: validationErrors 
      };
    }

    if (!require('fs').existsSync(apkPath)) {
      return { success: false, error: 'APK file not found' };
    }

    try {
      const result = await this.executeAdbCommand(deviceId, `install "${apkPath}"`);
      if (result.success) {
        return { success: true, message: 'APK installed successfully' };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Uninstall app from device
   */
  async uninstallApp(deviceId, packageName) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: 'Invalid device ID',
        details: validationErrors 
      };
    }

    try {
      const result = await this.executeAdbCommand(deviceId, `uninstall ${packageName}`);
      if (result.success) {
        return { success: true, message: 'App uninstalled successfully' };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Take screenshot from device
   */
  async takeScreenshot(deviceId, outputPath) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: 'Invalid device ID',
        details: validationErrors 
      };
    }

    try {
      // Take screenshot on device
      const screenshotResult = await this.executeAdbCommand(deviceId, 'shell screencap -p /sdcard/screenshot.png');
      if (!screenshotResult.success) {
        return { success: false, error: 'Failed to capture screenshot' };
      }

      // Pull screenshot to local machine
      const pullResult = await this.executeAdbCommand(deviceId, `pull /sdcard/screenshot.png "${outputPath}"`);
      if (!pullResult.success) {
        return { success: false, error: 'Failed to pull screenshot' };
      }

      // Clean up device screenshot
      await this.executeAdbCommand(deviceId, 'shell rm /sdcard/screenshot.png');

      return { success: true, path: outputPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get device logs
   */
  async getDeviceLogs(deviceId, options = {}) {
    const validationErrors = this.validationManager.validateDeviceSerial(deviceId);
    if (validationErrors.length > 0) {
      return { 
        success: false, 
        error: 'Invalid device ID',
        details: validationErrors 
      };
    }

    try {
      const { tag = '*', level = 'V', lines = 100 } = options;
      const command = `shell logcat -d -s ${tag}:${level} -t ${lines}`;
      const result = await this.executeAdbCommand(deviceId, command);
      
      if (result.success) {
        return { success: true, logs: result.output };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse device properties from getprop output
   */
  parseDeviceProperties(output) {
    const properties = {};
    const lines = output.split('\n');
    
    lines.forEach(line => {
      const match = line.match(/\[([^\]]+)\]:\s*\[([^\]]*)\]/);
      if (match) {
        properties[match[1]] = match[2];
      }
    });

    return properties;
  }

  /**
   * Update internal device cache
   */
  updateDeviceCache(devices) {
    const now = Date.now();
    
    // Add new devices
    devices.forEach(deviceId => {
      if (!this.devices.has(deviceId)) {
        this.devices.set(deviceId, {
          id: deviceId,
          firstSeen: now,
          lastSeen: now,
          status: 'connected'
        });
      } else {
        const device = this.devices.get(deviceId);
        device.lastSeen = now;
        device.status = 'connected';
      }
    });

    // Mark disconnected devices
    this.devices.forEach((device, deviceId) => {
      if (!devices.includes(deviceId)) {
        device.status = 'disconnected';
      }
    });
  }

  /**
   * Handle device connection event
   */
  onDeviceConnected(deviceId) {
    console.log(`Device connected: ${deviceId}`);
    // Could emit socket event here if needed
  }

  /**
   * Handle device disconnection event
   */
  onDeviceDisconnected(deviceId) {
    console.log(`Device disconnected: ${deviceId}`);
    // Could emit socket event here if needed
  }

  /**
   * Get all cached devices with their status
   */
  getCachedDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get device connection status
   */
  getDeviceStatus(deviceId) {
    const device = this.devices.get(deviceId);
    return device ? device.status : 'unknown';
  }
}

module.exports = DeviceManager;