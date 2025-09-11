// Branch Manager Module
// Handles Git branch operations and repository management

const simpleGit = require('simple-git');

class BranchManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
  }

  /**
   * Get authenticated Git URL with credentials
   */
  getAuthenticatedUrl() {
    const gitConfig = this.configManager.getGitConfig();
    return gitConfig.url;
  }

  /**
   * List all available branches from the remote repository
   */
  async getBranches() {
    try {
      const git = simpleGit();
      const authenticatedUrl = this.getAuthenticatedUrl();
      const remoteInfo = await git.listRemote(['--heads', authenticatedUrl]);

      if (!remoteInfo) {
        throw new Error('No se pudo obtener información del repositorio.');
      }

      const branches = remoteInfo
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.split('/');
          return parts[parts.length - 1];
        });

      return { success: true, branches };
    } catch (error) {
      console.error('Error al listar branches:', error);
      return {
        success: false,
        error:
          'Error interno al listar branches. Revisa la URL del repo y el PAT.',
      };
    }
  }

  /**
   * Get commit status for a specific branch
   */
  async getCommitStatus(branch) {
    const validationErrors = this.validationManager.validateBranchName(branch);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid branch name',
        details: validationErrors,
      };
    }

    try {
      const git = simpleGit();
      const authenticatedUrl = this.getAuthenticatedUrl();

      // Get the latest commit hash for the branch
      const commitInfo = await git.listRemote([
        '--heads',
        authenticatedUrl,
        `refs/heads/${branch}`,
      ]);

      if (!commitInfo) {
        return {
          success: false,
          error: `No se encontró información para la branch '${branch}'`,
        };
      }

      const commitHash = commitInfo.split('\t')[0];

      return {
        success: true,
        commitHash,
        branch,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `Error al obtener commit status para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al obtener el estado del commit.',
      };
    }
  }

  /**
   * Get workspace changes for a specific branch
   */
  async getWorkspaceChanges(branch) {
    const validationErrors = this.validationManager.validateBranchName(branch);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid branch name',
        details: validationErrors,
      };
    }

    if (!this.configManager.isEnabled('persistentWorkspaces')) {
      return {
        success: false,
        error:
          'La funcionalidad de workspaces persistentes no está habilitada.',
      };
    }

    try {
      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = this.getWorkspacePath(sanitizedBranch);

      if (!require('fs').existsSync(workspacePath)) {
        return {
          success: true,
          changes: [],
          hasChanges: false,
        };
      }

      const git = simpleGit(workspacePath);
      const status = await git.status();

      const changes = {
        modified: status.modified,
        added: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        staged: status.staged,
        hasChanges: !status.isClean(),
      };

      return {
        success: true,
        changes,
        hasChanges: changes.hasChanges,
      };
    } catch (error) {
      console.error(
        `Error al obtener cambios para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al obtener los cambios del workspace.',
      };
    }
  }

  /**
   * Get workspace path for a branch
   */
  getWorkspacePath(branch) {
    const sanitizedBranch = this.validationManager.sanitize(branch);
    const persistentRoot = this.configManager.get('PERSISTENT_WORKSPACES_ROOT');

    if (!persistentRoot) {
      throw new Error('Persistent workspaces not enabled');
    }

    return require('path').join(persistentRoot, sanitizedBranch, 'appium');
  }

  /**
   * Create a new workspace for a branch
   */
  async createWorkspace(branch) {
    const validationErrors = this.validationManager.validateBranchName(branch);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Invalid branch name',
        details: validationErrors,
      };
    }

    if (!this.configManager.isEnabled('persistentWorkspaces')) {
      return {
        success: false,
        error:
          'La funcionalidad de workspaces persistentes no está habilitada.',
      };
    }

    try {
      const workspacePath = this.getWorkspacePath(branch);
      const fs = require('fs');

      if (fs.existsSync(workspacePath)) {
        return {
          success: true,
          message: 'Workspace already exists',
          path: workspacePath,
        };
      }

      // Create directory structure
      await fs.promises.mkdir(workspacePath, { recursive: true });

      // Clone the repository
      const git = simpleGit(workspacePath);
      const authenticatedUrl = this.getAuthenticatedUrl();

      await git.clone(authenticatedUrl, workspacePath, [
        '--branch',
        branch,
        '--depth',
        '1',
      ]);

      return {
        success: true,
        message: 'Workspace created successfully',
        path: workspacePath,
      };
    } catch (error) {
      console.error(
        `Error al crear workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al crear el workspace.',
      };
    }
  }

  /**
   * Check if workspace exists for a branch
   */
  workspaceExists(branch) {
    try {
      const workspacePath = this.getWorkspacePath(branch);
      return require('fs').existsSync(workspacePath);
    } catch {
      return false;
    }
  }

  /**
   * Get branch history with reports
   */
  async getBranchHistory() {
    try {
      const reportsDir = require('path').join(
        __dirname,
        '..',
        '..',
        'public',
        'reports',
      );
      const fs = require('fs');

      if (!fs.existsSync(reportsDir)) {
        return {
          success: true,
          branches: [],
        };
      }

      const branches = await fs.promises.readdir(reportsDir);
      const branchData = [];

      for (const branch of branches) {
        const branchPath = require('path').join(reportsDir, branch);
        const stats = await fs.promises.stat(branchPath);

        if (stats.isDirectory()) {
          const reports = await fs.promises.readdir(branchPath);
          branchData.push({
            name: branch,
            reportCount: reports.length,
            lastModified: stats.mtime,
            hasReports: reports.length > 0,
          });
        }
      }

      return {
        success: true,
        branches: branchData.sort((a, b) => b.lastModified - a.lastModified),
      };
    } catch (error) {
      console.error('Error al obtener historial de branches:', error);
      return {
        success: false,
        error: 'Error interno al obtener el historial.',
      };
    }
  }

  /**
   * Get detailed history for a specific branch
   */
  async getBranchDetailedHistory(branchFilter = null) {
    try {
      const reportsDir = require('path').join(
        __dirname,
        '..',
        '..',
        'public',
        'reports',
      );
      const fs = require('fs');

      if (!fs.existsSync(reportsDir)) {
        return {
          success: true,
          history: [],
        };
      }

      const branches = await fs.promises.readdir(reportsDir);
      const history = [];

      for (const branch of branches) {
        if (branchFilter && branch !== branchFilter) {
          continue;
        }

        const branchPath = require('path').join(reportsDir, branch);
        const reports = await fs.promises.readdir(branchPath);

        for (const report of reports) {
          const reportPath = require('path').join(branchPath, report);
          const stats = await fs.promises.stat(reportPath);

          if (stats.isDirectory()) {
            const reportData = {
              branch,
              reportName: report,
              path: reportPath,
              created: stats.birthtime,
              modified: stats.mtime,
            };

            // Try to read report metadata if available
            try {
              const metadataPath = require('path').join(
                reportPath,
                'metadata.json',
              );
              if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(
                  await fs.promises.readFile(metadataPath, 'utf8'),
                );
                reportData.metadata = metadata;
              }
            } catch {
              // Ignore metadata reading errors
            }

            history.push(reportData);
          }
        }
      }

      return {
        success: true,
        history: history.sort((a, b) => b.modified - a.modified),
      };
    } catch (error) {
      console.error('Error al obtener historial detallado:', error);
      return {
        success: false,
        error: 'Error interno al obtener el historial detallado.',
      };
    }
  }
}

module.exports = BranchManager;
