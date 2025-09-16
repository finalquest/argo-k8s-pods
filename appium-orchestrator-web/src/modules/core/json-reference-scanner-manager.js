// JSON Reference Scanner Manager Module
// Handles scanning of JSON reference files from local workspace repositories

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class JsonReferenceScannerManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.cache = new Map();
    this.cacheExpiryTime = 5 * 60 * 1000; // 5 minutos
    this.cacheDir = path.join(process.cwd(), 'cache', 'json-references');
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      console.warn('No se pudo crear directorio de caché:', error.message);
    }
  }

  getCacheKey(branch) {
    return `${branch}_json_refs`;
  }

  getCacheFilePath(branch) {
    return path.join(this.cacheDir, `${branch}.json`);
  }

  isCacheValid(cacheData) {
    return cacheData && cacheData.timestamp &&
           (Date.now() - cacheData.timestamp) < this.cacheExpiryTime;
  }

  getFromCache(branch) {
    // Primero intentar caché en memoria
    const memoryCache = this.cache.get(this.getCacheKey(branch));
    if (memoryCache && this.isCacheValid(memoryCache)) {
      return { ...memoryCache.data, cached: true, source: 'memory' };
    }

    // Luego intentar caché en disco
    const cacheFile = this.getCacheFilePath(branch);
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (this.isCacheValid(cacheData)) {
          // Guardar en caché de memoria para futuras solicitudes
          this.cache.set(this.getCacheKey(branch), cacheData);
          return { ...cacheData.data, cached: true, source: 'disk' };
        }
      } catch (error) {
        console.warn('Error al leer caché de disco:', error.message);
      }
    }

    return null;
  }

  saveToCache(branch, data) {
    const cacheData = {
      timestamp: Date.now(),
      data: data
    };

    // Guardar en caché de memoria
    this.cache.set(this.getCacheKey(branch), cacheData);

    // Guardar en caché de disco
    const cacheFile = this.getCacheFilePath(branch);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('Error al guardar caché en disco:', error.message);
    }
  }

  /**
   * Main entry point for scanning JSON reference files
   */
  async scanJsonReferences(branch, forceRefresh = false) {
    try {
      // 1. Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = this.getFromCache(branch);
        if (cachedData) {
          console.log(`[JSON-SCANNER] Using cached data for branch ${branch} (${cachedData.source})`);
          return {
            success: true,
            data: cachedData,
            cached: true,
            message: 'Datos de referencias JSON cargados desde caché',
          };
        }
      }

      // 2. Validate persistent workspaces configuration
      if (!this.configManager.isEnabled('persistentWorkspaces')) {
        return {
          success: false,
          error: 'Persistent workspaces no está habilitado en el servidor',
          code: 'PERSISTENT_WORKSPACES_DISABLED',
        };
      }

      // 3. Validate branch parameter
      const branchErrors = this.validationManager.validateBranchName(branch);

      if (branchErrors.length > 0) {
        return {
          success: false,
          error: 'Branch inválida',
          details: branchErrors.join(', '),
          code: 'INVALID_BRANCH',
        };
      }

      // 4. Check if workspace exists
      const workspacePath = this.getWorkspacePath(branch);
      if (!fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: `Workspace no existe para la branch '${branch}'. Por favor, ejecute 'preparar workspace' primero.`,
          code: 'WORKSPACE_NOT_EXISTS',
          suggestion: 'Ejecute "preparar workspace" para esta branch',
        };
      }

      // 5. Check if this is a git repository
      const gitDir = path.join(workspacePath, '.git');
      if (!fs.existsSync(gitDir)) {
        return {
          success: false,
          error: `El directorio ${workspacePath} no es un repositorio git válido`,
          code: 'INVALID_GIT_REPO',
        };
      }

      // 6. Perform actual scan with performance tracking
      console.log(`[JSON-SCANNER] Starting scan for branch ${branch}`);
      const startTime = Date.now();
      const scanResult = await this.performScan(workspacePath, branch);
      const endTime = Date.now();

      console.log(`[JSON-SCANNER] Scan completed in ${endTime - startTime}ms`);

      // 7. Save to cache
      this.saveToCache(branch, scanResult);

      return {
        success: true,
        data: scanResult,
        cached: false,
        scanTime: endTime - startTime,
        message: 'Escaneo de referencias JSON completado exitosamente',
      };
    } catch (error) {
      console.error(
        'Error en JsonReferenceScannerManager.scanJsonReferences:',
        error,
      );
      return {
        success: false,
        error: error.message,
        code: 'JSON_SCAN_ERROR',
      };
    }
  }

  /**
   * Get workspace path for a specific branch
   */
  getWorkspacePath(branch) {
    const persistentRoot = this.configManager.get('PERSISTENT_WORKSPACES_ROOT');
    const sanitizedBranch = this.validationManager.sanitize(branch);
    const workspacePath = path.join(persistentRoot, sanitizedBranch, 'appium');
    return workspacePath;
  }

  /**
   * Perform the actual JSON reference scan
   */
  async performScan(workspacePath, branch) {
    return new Promise((resolve, reject) => {
      const scanScript = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'scripts',
        'scan-json-refs.sh',
      );

      if (!fs.existsSync(scanScript)) {
        reject(
          new Error('Script de escaneo JSON no encontrado: ' + scanScript),
        );
        return;
      }

      const scriptProcess = spawn('bash', [scanScript, workspacePath, branch]);
      let stdout = '';
      let stderr = '';

      scriptProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
      });

      scriptProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
      });

      scriptProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            reject(
              new Error(
                'Error al parsear resultado del script JSON: ' +
                  parseError.message,
              ),
            );
          }
        } else {
          reject(new Error(`Script JSON falló con código ${code}: ${stderr}`));
        }
      });

      scriptProcess.on('error', (err) => {
        reject(new Error('Error al ejecutar script JSON: ' + err.message));
      });
    });
  }

  /**
   * Clear cache for a specific branch or all branches
   */
  clearCache(branch = null) {
    try {
      if (branch) {
        // Clear from memory cache
        this.cache.delete(this.getCacheKey(branch));

        // Clear from disk cache
        const cacheFile = this.getCacheFilePath(branch);
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
        }
      } else {
        // Clear all memory cache
        this.cache.clear();

        // Clear all disk cache
        if (fs.existsSync(this.cacheDir)) {
          const files = fs.readdirSync(this.cacheDir);
          files.forEach((file) => {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(this.cacheDir, file));
            }
          });
        }
      }
      return { success: true, message: 'Cache JSON limpiado exitosamente' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get scan status for a branch
   */
  async getStatus(branch) {
    try {
      const workspacePath = this.getWorkspacePath(branch);

      const workspaceExists = fs.existsSync(workspacePath);
      const persistentWorkspacesEnabled = this.configManager.isEnabled(
        'persistentWorkspaces',
      );

      return {
        success: true,
        data: {
          branch: branch,
          workspaceExists: workspaceExists,
          persistentWorkspacesEnabled: persistentWorkspacesEnabled,
          workspacePath: workspacePath,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = JsonReferenceScannerManager;
