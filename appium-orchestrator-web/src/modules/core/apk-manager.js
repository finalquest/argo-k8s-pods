// APK Manager Module
// Handles APK registry operations, local APK management, and version control

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const https = require('https');

class ApkManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.apkCache = new Map();
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  /**
   * Get available APK versions from both local directory and registry
   */
  async getApkVersions(client = null) {
    const results = {
      success: true,
      versions: [],
      source: 'mixed',
      local: [],
      registry: []
    };

    try {
      // Try local APK directory first
      if (process.env.LOCAL_APK_DIRECTORY) {
        const localResult = await this.getLocalApkVersions();
        if (localResult.success) {
          results.local = localResult.versions;
          results.versions.push(...localResult.versions);
        }
      }

      // Try registry if no client specified or if we need more versions
      if (!client && process.env.APK_REGISTRY_URL) {
        const registryResult = await this.getRegistryApkVersions();
        if (registryResult.success) {
          results.registry = registryResult.versions;
          results.versions.push(...registryResult.versions);
        }
      }

      // If client is specified, try to get client-specific versions
      if (client && process.env.APK_REGISTRY_URL) {
        const clientResult = await this.getClientApkVersions(client);
        if (clientResult.success) {
          results.versions.push(...clientResult.versions);
        }
      }

      // Remove duplicates
      results.versions = this.removeDuplicateVersions(results.versions);

      return results;
    } catch (error) {
      console.error('Error al obtener versiones de APK:', error);
      return {
        success: false,
        error: 'Error interno al obtener versiones de APK.',
        versions: []
      };
    }
  }

  /**
   * Get APK versions from local directory
   */
  async getLocalApkVersions() {
    const apkDir = process.env.LOCAL_APK_DIRECTORY;
    
    if (!fs.existsSync(apkDir)) {
      console.error(`El directorio de APKs locales especificado no existe: ${apkDir}`);
      return {
        success: false,
        error: 'El directorio de APKs locales no existe.',
        versions: []
      };
    }

    try {
      const files = fs.readdirSync(apkDir);
      const apkFiles = files.filter(
        (file) => path.extname(file).toLowerCase() === '.apk'
      );

      const versions = apkFiles.map(file => ({
        name: file,
        path: path.join(apkDir, file),
        source: 'local',
        size: this.getFileSize(path.join(apkDir, file)),
        modified: fs.statSync(path.join(apkDir, file)).mtime
      }));

      return {
        success: true,
        versions,
        source: 'local'
      };
    } catch (error) {
      console.error(`Error al leer el directorio de APKs locales: ${error.message}`);
      return {
        success: false,
        error: 'Error al leer el directorio de APKs locales.',
        versions: []
      };
    }
  }

  /**
   * Get APK versions from registry
   */
  async getRegistryApkVersions() {
    try {
      const response = await fetch(
        `${process.env.APK_REGISTRY_URL}/v2/${process.env.APK_REGISTRY_REPO}/tags/list`,
        { agent: this.httpsAgent }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const versions = data.tags.map(tag => ({
        name: tag,
        source: 'registry',
        repository: process.env.APK_REGISTRY_REPO,
        registryUrl: process.env.APK_REGISTRY_URL
      }));

      return {
        success: true,
        versions,
        source: 'registry'
      };
    } catch (error) {
      console.error('Error al obtener versiones del registro:', error);
      return {
        success: false,
        error: 'Error al obtener versiones del registro.',
        versions: []
      };
    }
  }

  /**
   * Get client-specific APK versions from registry
   */
  async getClientApkVersions(client) {
    const validationErrors = this.validationManager.validateClientName(client);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid client name',
        details: validationErrors,
        versions: []
      };
    }

    try {
      const clientRepo = `${process.env.APK_REGISTRY_REPO}-${client}`;
      const response = await fetch(
        `${process.env.APK_REGISTRY_URL}/v2/${clientRepo}/tags/list`,
        { agent: this.httpsAgent }
      );

      if (!response.ok) {
        return {
          success: true,
          versions: [],
          source: 'registry'
        };
      }

      const data = await response.json();
      const versions = data.tags.map(tag => ({
        name: tag,
        source: 'registry',
        client: client,
        repository: clientRepo,
        registryUrl: process.env.APK_REGISTRY_URL
      }));

      return {
        success: true,
        versions,
        source: 'registry'
      };
    } catch (error) {
      console.error(`Error al obtener versiones del registro para cliente ${client}:`, error);
      return {
        success: false,
        error: `Error al obtener versiones del registro para cliente ${client}.`,
        versions: []
      };
    }
  }

  /**
   * Download APK from registry
   */
  async downloadApkFromRegistry(version, outputPath, client = null) {
    const validationErrors = this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors
      };
    }

    try {
      const repo = client ? `${process.env.APK_REGISTRY_REPO}-${client}` : process.env.APK_REGISTRY_REPO;
      const downloadUrl = `${process.env.APK_REGISTRY_URL}/v2/${repo}/manifests/${version}`;

      const response = await fetch(downloadUrl, { agent: this.httpsAgent });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // For registry downloads, we need to handle the manifest and layers
      const manifest = await response.json();
      
      // Find the APK layer (usually the largest one)
      const apkLayer = manifest.layers.reduce((largest, layer) => 
        layer.size > largest.size ? layer : largest
      );

      // Download the layer (this is a simplified version)
      const layerResponse = await fetch(`${process.env.APK_REGISTRY_URL}/v2/${repo}/blobs/${apkLayer.digest}`, { 
        agent: this.httpsAgent 
      });

      if (!layerResponse.ok) {
        throw new Error(`Failed to download APK layer: ${layerResponse.statusText}`);
      }

      // Save the APK to the output path
      const apkBuffer = await layerResponse.buffer();
      await fs.promises.writeFile(outputPath, apkBuffer);

      return {
        success: true,
        path: outputPath,
        size: apkBuffer.length,
        version
      };
    } catch (error) {
      console.error(`Error al descargar APK ${version}:`, error);
      return {
        success: false,
        error: `Error al descargar APK ${version}: ${error.message}`
      };
    }
  }

  /**
   * Copy APK from local directory
   */
  async copyLocalApk(version, outputPath) {
    const validationErrors = this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors
      };
    }

    const apkDir = process.env.LOCAL_APK_DIRECTORY;
    const sourcePath = path.join(apkDir, version);

    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        error: `APK file not found: ${version}`
      };
    }

    try {
      await fs.promises.copyFile(sourcePath, outputPath);
      
      return {
        success: true,
        path: outputPath,
        size: this.getFileSize(sourcePath),
        version
      };
    } catch (error) {
      console.error(`Error al copiar APK ${version}:`, error);
      return {
        success: false,
        error: `Error al copiar APK ${version}: ${error.message}`
      };
    }
  }

  /**
   * Get APK metadata from file
   */
  async getApkMetadata(apkPath) {
    if (!fs.existsSync(apkPath)) {
      return {
        success: false,
        error: 'APK file not found'
      };
    }

    try {
      // Use aapt to get APK info (if available)
      const { exec } = require('child_process');
      
      return new Promise((resolve) => {
        exec(`aapt dump badging "${apkPath}"`, (error, stdout) => {
          if (error) {
            // If aapt is not available, return basic info
            const stats = fs.statSync(apkPath);
            resolve({
              success: true,
              metadata: {
                fileName: path.basename(apkPath),
                fileSize: stats.size,
                modified: stats.mtime,
                path: apkPath
              }
            });
            return;
          }

          const metadata = this.parseAaptOutput(stdout);
          metadata.fileName = path.basename(apkPath);
          metadata.path = apkPath;

          resolve({
            success: true,
            metadata
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: `Error al obtener metadata del APK: ${error.message}`
      };
    }
  }

  /**
   * Validate APK file
   */
  async validateApkFile(apkPath) {
    if (!fs.existsSync(apkPath)) {
      return {
        success: false,
        error: 'APK file not found',
        isValid: false
      };
    }

    try {
      // Basic validation - check if it's a valid ZIP file
      const stats = fs.statSync(apkPath);
      
      if (stats.size === 0) {
        return {
          success: true,
          isValid: false,
          error: 'APK file is empty'
        };
      }

      // Check file extension
      if (path.extname(apkPath).toLowerCase() !== '.apk') {
        return {
          success: true,
          isValid: false,
          error: 'File is not an APK (invalid extension)'
        };
      }

      // Try to read the file as a ZIP
      const JSZip = require('jszip');
      const data = await fs.promises.readFile(apkPath);
      const zip = await JSZip.loadAsync(data);

      // Check for AndroidManifest.xml
      if (!zip.file('AndroidManifest.xml')) {
        return {
          success: true,
          isValid: false,
          error: 'AndroidManifest.xml not found in APK'
        };
      }

      return {
        success: true,
        isValid: true,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al validar APK: ${error.message}`,
        isValid: false
      };
    }
  }

  /**
   * Parse aapt output to extract metadata
   */
  parseAaptOutput(output) {
    const metadata = {};
    
    const packageMatch = output.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
    if (packageMatch) {
      metadata.packageName = packageMatch[1];
      metadata.versionCode = packageMatch[2];
      metadata.versionName = packageMatch[3];
    }

    const launchableMatch = output.match(/launchable-activity: name='([^']+)'/);
    if (launchableMatch) {
      metadata.launchableActivity = launchableMatch[1];
    }

    const sdkMatch = output.match(/sdkVersion:'([^']+)'/);
    if (sdkMatch) {
      metadata.sdkVersion = sdkMatch[1];
    }

    const targetSdkMatch = output.match(/targetSdkVersion:'([^']+)'/);
    if (targetSdkMatch) {
      metadata.targetSdkVersion = targetSdkMatch[1];
    }

    const usesPermissionMatches = output.match(/uses-permission: name='([^']+)'/g);
    if (usesPermissionMatches) {
      metadata.permissions = usesPermissionMatches.map(match => {
        const permMatch = match.match(/uses-permission: name='([^']+)'/);
        return permMatch ? permMatch[1] : null;
      }).filter(Boolean);
    }

    return metadata;
  }

  /**
   * Remove duplicate versions
   */
  removeDuplicateVersions(versions) {
    const seen = new Set();
    return versions.filter(version => {
      const key = `${version.name}-${version.source}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Get file size
   */
  getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get APK by version
   */
  async getApkByVersion(version, client = null) {
    const validationErrors = this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors
      };
    }

    try {
      // Check cache first
      const cacheKey = `${version}-${client || 'default'}`;
      if (this.apkCache.has(cacheKey)) {
        return {
          success: true,
          apk: this.apkCache.get(cacheKey),
          cached: true
        };
      }

      // Try local directory first
      if (process.env.LOCAL_APK_DIRECTORY) {
        const localApkPath = path.join(process.env.LOCAL_APK_DIRECTORY, version);
        if (fs.existsSync(localApkPath)) {
          const apkInfo = {
            name: version,
            path: localApkPath,
            source: 'local',
            size: this.getFileSize(localApkPath)
          };
          
          // Cache the result
          this.apkCache.set(cacheKey, apkInfo);
          
          return {
            success: true,
            apk: apkInfo,
            cached: false
          };
        }
      }

      // If not found locally, return registry info
      const registryInfo = {
        name: version,
        source: 'registry',
        client: client,
        repository: client ? `${process.env.APK_REGISTRY_REPO}-${client}` : process.env.APK_REGISTRY_REPO,
        registryUrl: process.env.APK_REGISTRY_URL
      };

      return {
        success: true,
        apk: registryInfo,
        cached: false
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al obtener APK ${version}: ${error.message}`
      };
    }
  }

  /**
   * Clear APK cache
   */
  clearCache() {
    this.apkCache.clear();
  }
}

module.exports = ApkManager;