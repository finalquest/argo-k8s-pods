// APK Manager Module
// Handles APK registry operations using ORAS commands, local APK management, and version control

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class ApkManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.apkCache = new Map();
  }

  /**
   * Get available APK versions from both local directory and registry
   */
  async getApkVersions(client = null) {
    console.log('--- DEBUG: getApkVersions called ---');
    console.log('Client parameter:', client);
    console.log('LOCAL_APK_DIRECTORY:', process.env.LOCAL_APK_DIRECTORY);
    console.log('APK_REGISTRY:', process.env.APK_REGISTRY);

    const results = {
      success: true,
      versions: [],
      source: 'registry',
      local: [],
      registry: [],
    };

    try {
      // Try local APK directory first
      if (process.env.LOCAL_APK_DIRECTORY) {
        console.log('--- DEBUG: Trying local APK directory ---');
        const localResult = await this.getLocalApkVersions();
        console.log('Local result:', localResult);
        if (localResult.success) {
          results.local = localResult.versions;
          results.versions.push(...localResult.versions);
        }
      }

      // Only try client-specific registry if client is specified
      if (client && process.env.APK_REGISTRY) {
        console.log('--- DEBUG: Trying client-specific registry ---');
        const clientResult = await this.getClientApkVersions(client);
        console.log('Client result:', clientResult);
        if (clientResult.success) {
          results.registry = clientResult.versions;
          results.versions.push(...clientResult.versions);
        }
      } else {
        console.log(
          '--- DEBUG: Skipping registry - no client or APK_REGISTRY not set ---',
        );
        console.log('Client exists:', !!client);
        console.log('APK_REGISTRY exists:', !!process.env.APK_REGISTRY);
      }

      // Remove duplicates
      results.versions = this.removeDuplicateVersions(results.versions);

      // Determine source based on what was actually found
      if (results.local.length > 0 && results.registry.length > 0) {
        results.source = 'mixed';
      } else if (results.local.length > 0) {
        results.source = 'local';
      } else if (results.registry.length > 0) {
        results.source = 'registry';
      } else {
        results.source = 'none';
      }

      console.log('--- DEBUG: Final results ---');
      console.log('Total versions:', results.versions.length);
      console.log('Local versions:', results.local.length);
      console.log('Registry versions:', results.registry.length);
      console.log('Final source:', results.source);
      console.log('Final versions:', results.versions);

      return results;
    } catch (error) {
      console.error('Error al obtener versiones de APK:', error);
      return {
        success: false,
        error: 'Error interno al obtener versiones de APK.',
        versions: [],
      };
    }
  }

  /**
   * Get APK versions from local directory
   */
  async getLocalApkVersions() {
    const apkDir = process.env.LOCAL_APK_DIRECTORY;

    if (!fs.existsSync(apkDir)) {
      console.error(
        `El directorio de APKs locales especificado no existe: ${apkDir}`,
      );
      return {
        success: false,
        error: 'El directorio de APKs locales no existe.',
        versions: [],
      };
    }

    try {
      const files = fs.readdirSync(apkDir);
      const apkFiles = files.filter(
        (file) => path.extname(file).toLowerCase() === '.apk',
      );

      const versions = apkFiles.map((file) => ({
        name: file,
        path: path.join(apkDir, file),
        source: 'local',
        size: this.getFileSize(path.join(apkDir, file)),
        modified: fs.statSync(path.join(apkDir, file)).mtime,
      }));

      return {
        success: true,
        versions,
        source: 'local',
      };
    } catch (error) {
      console.error(
        `Error al leer el directorio de APKs locales: ${error.message}`,
      );
      return {
        success: false,
        error: 'Error al leer el directorio de APKs locales.',
        versions: [],
      };
    }
  }

  /**
   * Get APK versions from registry using ORAS (legacy method for repo parameter)
   */
  async getRegistryApkVersions(repo = null) {
    return new Promise((resolve) => {
      if (!repo) {
        return resolve({
          success: false,
          error: "Se requiere el parámetro 'repo'.",
          versions: [],
        });
      }

      // Validate repo parameter
      const sanitizedRepo = repo.replace(/[^a-zA-Z0-9_\-/.]/g, '');
      if (sanitizedRepo !== repo) {
        return resolve({
          success: false,
          error: "Parámetro 'repo' contiene caracteres inválidos.",
          versions: [],
        });
      }

      const command = `oras repo tags ${process.env.APK_REGISTRY}/${sanitizedRepo} --plain-http`;

      console.log('--- DEBUG: ORAS command (legacy) ---');
      console.log('Repository:', sanitizedRepo);
      console.log('Full command:', command);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error al ejecutar ORAS: ${error}`);
          return resolve({
            success: false,
            error: 'Error al obtener versiones del registro.',
            versions: [],
          });
        }

        if (stderr) {
          console.error(`ORAS stderr: ${stderr}`);
          return resolve({
            success: false,
            error: 'Error al obtener versiones del registro.',
            versions: [],
          });
        }

        const versions = stdout.trim().split('\n').filter(Boolean);

        console.log('--- DEBUG: ORAS results (legacy) ---');
        console.log('Versions count:', versions.length);
        console.log('Versions:', versions);

        resolve({
          success: true,
          versions: versions.map((tag) => ({
            name: tag,
            source: 'registry',
            repository: sanitizedRepo,
            registryUrl: process.env.APK_REGISTRY,
          })),
          source: 'registry',
        });
      });
    });
  }

  /**
   * Get client-specific APK versions from registry using ORAS
   */
  async getClientApkVersions(client) {
    console.log('--- DEBUG: getClientApkVersions called ---');
    console.log('Client:', client);
    console.log('APK_REGISTRY env var:', process.env.APK_REGISTRY);

    const validationErrors = this.validationManager.validateClientName(client);
    if (validationErrors.length > 0) {
      console.log('Validation errors:', validationErrors);
      return {
        success: false,
        error: 'Invalid client name',
        details: validationErrors,
        versions: [],
      };
    }

    return new Promise((resolve) => {
      // Build repository path as apks/{client}/int
      const repo = `apks/${client}/int`;
      const command = `oras repo tags ${process.env.APK_REGISTRY}/${repo} --plain-http`;

      console.log('--- DEBUG: ORAS command ---');
      console.log('Repository:', repo);
      console.log('Full command:', command);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error al ejecutar ORAS: ${error}`);
          return resolve({
            success: false,
            error: 'Error al obtener versiones del registro.',
            versions: [],
          });
        }

        if (stderr) {
          console.error(`ORAS stderr: ${stderr}`);
          return resolve({
            success: false,
            error: 'Error al obtener versiones del registro.',
            versions: [],
          });
        }

        const versions = stdout.trim().split('\n').filter(Boolean).map((tag) => ({
          name: tag,
          source: 'registry',
          client: client,
          repository: repo,
          registryUrl: process.env.APK_REGISTRY,
        }));

        console.log('--- DEBUG: ORAS results ---');
        console.log('Versions count:', versions.length);
        console.log('Versions:', versions);

        resolve({
          success: true,
          versions,
          source: 'registry',
        });
      });
    });
  }

  /**
   * Download APK from registry using ORAS
   */
  async downloadApkFromRegistry(version, outputPath, client = null) {
    const validationErrors =
      this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors,
      };
    }

    return new Promise((resolve) => {
      // Build repository path as apks/{client}/int
      const repo = `apks/${client}/int`;
      const command = `oras pull ${process.env.APK_REGISTRY}/${repo}:${version} --plain-http -o ${outputPath}`;

      console.log('--- DEBUG: ORAS download command ---');
      console.log('Repository:', repo);
      console.log('Version:', version);
      console.log('Output path:', outputPath);
      console.log('Full command:', command);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error al descargar APK con ORAS: ${error}`);
          return resolve({
            success: false,
            error: `Error al descargar APK ${version}: ${error.message}`,
          });
        }

        if (stderr) {
          console.error(`ORAS stderr: ${stderr}`);
          return resolve({
            success: false,
            error: `Error al descargar APK ${version}: ${stderr}`,
          });
        }

        console.log('--- DEBUG: ORAS download successful ---');
        console.log('Output:', stdout);

        // Check if the file was created
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          resolve({
            success: true,
            path: outputPath,
            size: stats.size,
            version,
          });
        } else {
          resolve({
            success: false,
            error: `APK file not found after download: ${outputPath}`,
          });
        }
      });
    });
  }

  /**
   * Copy APK from local directory
   */
  async copyLocalApk(version, outputPath) {
    const validationErrors =
      this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors,
      };
    }

    const apkDir = process.env.LOCAL_APK_DIRECTORY;
    const sourcePath = path.join(apkDir, version);

    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        error: `APK file not found: ${version}`,
      };
    }

    try {
      await fs.promises.copyFile(sourcePath, outputPath);

      return {
        success: true,
        path: outputPath,
        size: this.getFileSize(sourcePath),
        version,
      };
    } catch (error) {
      console.error(`Error al copiar APK ${version}:`, error);
      return {
        success: false,
        error: `Error al copiar APK ${version}: ${error.message}`,
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
        error: 'APK file not found',
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
                path: apkPath,
              },
            });
            return;
          }

          const metadata = this.parseAaptOutput(stdout);
          metadata.fileName = path.basename(apkPath);
          metadata.path = apkPath;

          resolve({
            success: true,
            metadata,
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: `Error al obtener metadata del APK: ${error.message}`,
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
        isValid: false,
      };
    }

    try {
      // Basic validation - check if it's a valid ZIP file
      const stats = fs.statSync(apkPath);

      if (stats.size === 0) {
        return {
          success: true,
          isValid: false,
          error: 'APK file is empty',
        };
      }

      // Check file extension
      if (path.extname(apkPath).toLowerCase() !== '.apk') {
        return {
          success: true,
          isValid: false,
          error: 'File is not an APK (invalid extension)',
        };
      }

      // Try to read the file as a ZIP
      try {
        const JSZip = require('jszip');
        const data = await fs.promises.readFile(apkPath);
        const zip = await JSZip.loadAsync(data);

        // Check for AndroidManifest.xml
        if (!zip.file('AndroidManifest.xml')) {
          return {
            success: true,
            isValid: false,
            error: 'AndroidManifest.xml not found in APK',
          };
        }
      } catch (zipError) {
        // If JSZip is not available or fails, do basic validation
        console.log('JSZip validation failed, doing basic validation');
      }

      return {
        success: true,
        isValid: true,
        size: stats.size,
        modified: stats.mtime,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al validar APK: ${error.message}`,
        isValid: false,
      };
    }
  }

  /**
   * Parse aapt output to extract metadata
   */
  parseAaptOutput(output) {
    const metadata = {};

    const packageMatch = output.match(
      /package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/,
    );
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

    const usesPermissionMatches = output.match(
      /uses-permission: name='([^']+)'/g,
    );
    if (usesPermissionMatches) {
      metadata.permissions = usesPermissionMatches
        .map((match) => {
          const permMatch = match.match(/uses-permission: name='([^']+)'/);
          return permMatch ? permMatch[1] : null;
        })
        .filter(Boolean);
    }

    return metadata;
  }

  /**
   * Remove duplicate versions
   */
  removeDuplicateVersions(versions) {
    const seen = new Set();
    return versions.filter((version) => {
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
    } catch {
      return 0;
    }
  }

  /**
   * Get APK by version
   */
  async getApkByVersion(version, client = null) {
    const validationErrors =
      this.validationManager.validateApkIdentifier(version);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid APK version',
        details: validationErrors,
      };
    }

    try {
      // Check cache first
      const cacheKey = `${version}-${client || 'default'}`;
      if (this.apkCache.has(cacheKey)) {
        return {
          success: true,
          apk: this.apkCache.get(cacheKey),
          cached: true,
        };
      }

      // Try local directory first
      if (process.env.LOCAL_APK_DIRECTORY) {
        const localApkPath = path.join(
          process.env.LOCAL_APK_DIRECTORY,
          version,
        );
        if (fs.existsSync(localApkPath)) {
          const apkInfo = {
            name: version,
            path: localApkPath,
            source: 'local',
            size: this.getFileSize(localApkPath),
          };

          // Cache the result
          this.apkCache.set(cacheKey, apkInfo);

          return {
            success: true,
            apk: apkInfo,
            cached: false,
          };
        }
      }

      // If not found locally, return registry info
      // Build repository path as apks/{client}/int
      const repo = `apks/${client}/int`;
      const registryInfo = {
        name: version,
        source: 'registry',
        client: client,
        repository: repo,
        registryUrl: `http://${process.env.APK_REGISTRY}`,
      };

      return {
        success: true,
        apk: registryInfo,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al obtener APK ${version}: ${error.message}`,
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
