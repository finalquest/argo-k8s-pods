// Step Scanner Manager Module
// Handles scanning of step definitions from local workspace repositories

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class StepScannerManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
  }

  /**
   * Main entry point for scanning step definitions
   */
  async scanSteps(branch) {
    try {
      // 1. Validate persistent workspaces configuration
      if (!this.configManager.isEnabled('persistentWorkspaces')) {
        return {
          success: false,
          error: 'Persistent workspaces no está habilitado en el servidor',
          code: 'PERSISTENT_WORKSPACES_DISABLED',
        };
      }

      // 2. Validate branch parameter
      const branchErrors = this.validationManager.validateBranchName(branch);

      if (branchErrors.length > 0) {
        return {
          success: false,
          error: 'Branch inválida',
          details: branchErrors.join(', '),
          code: 'INVALID_BRANCH',
        };
      }

      // 3. Check if workspace exists
      const workspacePath = this.getWorkspacePath(branch);
      if (!fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: `Workspace no existe para la branch '${branch}'. Por favor, ejecute 'preparar workspace' primero.`,
          code: 'WORKSPACE_NOT_EXISTS',
          suggestion: 'Ejecute "preparar workspace" para esta branch',
        };
      }

      // 4. Check if this is a git repository
      const gitDir = path.join(workspacePath, '.git');
      if (!fs.existsSync(gitDir)) {
        return {
          success: false,
          error: `El directorio ${workspacePath} no es un repositorio git válido`,
          code: 'INVALID_GIT_REPO',
        };
      }

      // 5. Perform actual scan
      const scanResult = await this.performScan(workspacePath, branch);

      return {
        success: true,
        data: scanResult,
        cached: false,
        message: 'Escaneo completado exitosamente',
      };
    } catch (error) {
      console.error('Error en StepScannerManager.scanSteps:', error);
      return {
        success: false,
        error: error.message,
        code: 'SCAN_ERROR',
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
   * Perform the actual step definition scan
   */
  async performScan(workspacePath, branch) {
    return new Promise((resolve, reject) => {
      const scanScript = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'scripts',
        'scan-steps.sh',
      );

      if (!fs.existsSync(scanScript)) {
        reject(new Error('Script de escaneo no encontrado: ' + scanScript));
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
                'Error al parsear resultado del script: ' + parseError.message,
              ),
            );
          }
        } else {
          reject(new Error(`Script falló con código ${code}: ${stderr}`));
        }
      });

      scriptProcess.on('error', (err) => {
        reject(new Error('Error al ejecutar script: ' + err.message));
      });
    });
  }

  /**
   * Clear cache for a specific branch or all branches
   */
  clearCache(branch = null) {
    try {
      if (branch) {
        const cacheFile = path.join(this.cacheDir, `${branch}.json`);
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
        }
      } else {
        // Clear all cache
        if (fs.existsSync(this.cacheDir)) {
          const files = fs.readdirSync(this.cacheDir);
          files.forEach((file) => {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(this.cacheDir, file));
            }
          });
        }
      }
      return { success: true, message: 'Cache limpiado exitosamente' };
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

module.exports = StepScannerManager;
