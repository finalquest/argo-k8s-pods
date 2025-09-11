// Workspace Manager Module
// Handles workspace operations, persistent workspaces, and workspace lifecycle management

const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { exec } = require('child_process');

class WorkspaceManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.activeWorkspaces = new Map();
  }

  /**
   * Get workspace status for a branch
   */
  async getWorkspaceStatus(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: true,
          status: 'not_found',
          message: 'Workspace no encontrado',
          workspacePath,
        };
      }

      // Check if workspace is properly set up
      const gitPath = path.join(workspacePath, '.git');
      if (!fs.existsSync(gitPath)) {
        return {
          success: true,
          status: 'invalid',
          message: 'Workspace existe pero no es un repositorio Git válido',
          workspacePath,
        };
      }

      // Get git status
      const git = simpleGit(workspacePath);
      const status = await git.status();

      const workspaceInfo = {
        branch: status.current,
        isClean: status.isClean(),
        hasChanges: !status.isClean(),
        modified: status.modified,
        added: status.created,
        deleted: status.deleted,
        staged: status.staged,
        workspacePath,
        lastChecked: new Date().toISOString(),
      };

      return {
        success: true,
        status: 'ready',
        workspace: workspaceInfo,
      };
    } catch (error) {
      console.error(
        `Error al obtener estado del workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al obtener el estado del workspace.',
      };
    }
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

      if (fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: 'Workspace ya existe para esta branch',
          workspacePath,
        };
      }

      // Create workspace directory
      await fs.promises.mkdir(workspacePath, { recursive: true });

      // Clone the repository
      const authenticatedUrl = this.getAuthenticatedUrl();
      const git = simpleGit(workspacePath);

      await git.clone(authenticatedUrl, workspacePath, [
        '--branch',
        branch,
        '--depth',
        '1',
      ]);

      // Verify the workspace was created successfully
      const status = await git.status();

      const workspaceInfo = {
        branch: status.current,
        workspacePath,
        createdAt: new Date().toISOString(),
        status: 'created',
      };

      // Add to active workspaces
      this.activeWorkspaces.set(branch, workspaceInfo);

      return {
        success: true,
        workspace: workspaceInfo,
        message: 'Workspace creado exitosamente',
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
   * Initialize workspace for a branch (create if doesn't exist)
   */
  async initializeWorkspace(branch) {
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

      // Check if workspace already exists
      if (fs.existsSync(workspacePath)) {
        const statusResult = await this.getWorkspaceStatus(branch);
        return statusResult;
      }

      // Create new workspace
      return await this.createWorkspace(branch);
    } catch (error) {
      console.error(
        `Error al inicializar workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al inicializar el workspace.',
      };
    }
  }

  /**
   * Update workspace to latest branch commit
   */
  async updateWorkspace(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: 'Workspace no encontrado',
        };
      }

      const git = simpleGit(workspacePath);

      // Stash any local changes
      const status = await git.status();
      if (!status.isClean()) {
        await git.stash(['save', 'Auto-stash before pull']);
      }

      // Pull latest changes
      await git.pull('origin', branch);

      // Pop stash if we had one
      if (!status.isClean()) {
        try {
          await git.stash(['pop']);
        } catch (stashError) {
          console.warn(
            'Warning: Could not pop stash after pull:',
            stashError.message,
          );
        }
      }

      const newStatus = await git.status();

      return {
        success: true,
        message: 'Workspace actualizado exitosamente',
        workspace: {
          branch: newStatus.current,
          isClean: newStatus.isClean(),
          hasChanges: !newStatus.isClean(),
          workspacePath,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(
        `Error al actualizar workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al actualizar el workspace.',
      };
    }
  }

  /**
   * Clean up workspace (remove untracked files and reset changes)
   */
  async cleanWorkspace(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: 'Workspace no encontrado',
        };
      }

      const git = simpleGit(workspacePath);

      // Reset all changes
      await git.reset(['--hard']);

      // Clean untracked files
      await git.clean(['-f', '-d']);

      const status = await git.status();

      return {
        success: true,
        message: 'Workspace limpiado exitosamente',
        workspace: {
          branch: status.current,
          isClean: status.isClean(),
          hasChanges: !status.isClean(),
          workspacePath,
          cleanedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(
        `Error al limpiar workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al limpiar el workspace.',
      };
    }
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: true,
          message: 'Workspace no existe',
          workspacePath,
        };
      }

      // Remove workspace directory
      await fs.promises.rm(workspacePath, { recursive: true, force: true });

      // Remove from active workspaces
      this.activeWorkspaces.delete(branch);

      return {
        success: true,
        message: 'Workspace eliminado exitosamente',
        workspacePath,
      };
    } catch (error) {
      console.error(
        `Error al eliminar workspace para la branch '${branch}':`,
        error,
      );
      return {
        success: false,
        error: 'Error interno al eliminar el workspace.',
      };
    }
  }

  /**
   * Get all available workspaces
   */
  async getAllWorkspaces() {
    if (!this.configManager.isEnabled('persistentWorkspaces')) {
      return {
        success: true,
        workspaces: [],
        enabled: false,
      };
    }

    try {
      const persistentRoot = this.configManager.get(
        'PERSISTENT_WORKSPACES_ROOT',
      );

      if (!fs.existsSync(persistentRoot)) {
        return {
          success: true,
          workspaces: [],
          enabled: true,
        };
      }

      const workspaceDirs = await fs.promises.readdir(persistentRoot);
      const workspaces = [];

      for (const dir of workspaceDirs) {
        const workspacePath = path.join(persistentRoot, dir, 'appium');

        if (fs.existsSync(workspacePath)) {
          try {
            const git = simpleGit(workspacePath);
            const status = await git.status();

            const stats = await fs.promises.stat(workspacePath);

            workspaces.push({
              branch: dir,
              workspacePath,
              currentBranch: status.current,
              isClean: status.isClean(),
              hasChanges: !status.isClean(),
              createdAt: stats.birthtime,
              modifiedAt: stats.mtime,
              status: 'ready',
            });
          } catch (error) {
            workspaces.push({
              branch: dir,
              workspacePath,
              status: 'error',
              error: error.message,
            });
          }
        }
      }

      return {
        success: true,
        workspaces: workspaces.sort((a, b) => b.modifiedAt - a.modifiedAt),
        enabled: true,
      };
    } catch (error) {
      console.error('Error al obtener lista de workspaces:', error);
      return {
        success: false,
        error: 'Error interno al obtener la lista de workspaces.',
      };
    }
  }

  /**
   * Get workspace disk usage
   */
  async getWorkspaceDiskUsage(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: false,
          error: 'Workspace no encontrado',
        };
      }

      return new Promise((resolve) => {
        exec(`du -sh "${workspacePath}"`, (error, stdout) => {
          if (error) {
            resolve({
              success: false,
              error: 'Error al obtener uso de disco',
            });
          } else {
            const usage = stdout.trim().split('\t')[0];
            resolve({
              success: true,
              usage,
              workspacePath,
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: `Error al obtener uso de disco: ${error.message}`,
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

    return path.join(persistentRoot, sanitizedBranch, 'appium');
  }

  /**
   * Get authenticated Git URL
   */
  getAuthenticatedUrl() {
    const gitConfig = this.configManager.getGitConfig();
    return gitConfig.url;
  }

  /**
   * Check if workspace exists
   */
  workspaceExists(branch) {
    try {
      const workspacePath = this.getWorkspacePath(branch);
      return fs.existsSync(workspacePath);
    } catch {
      return false;
    }
  }

  /**
   * Get workspace health status
   */
  async getWorkspaceHealth(branch) {
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

      if (!fs.existsSync(workspacePath)) {
        return {
          success: true,
          health: 'not_found',
          checks: {
            exists: false,
            gitRepo: false,
            readable: false,
            writable: false,
          },
        };
      }

      const checks = {
        exists: true,
        gitRepo: false,
        readable: false,
        writable: false,
        diskSpace: false,
      };

      // Check if it's a git repository
      const gitPath = path.join(workspacePath, '.git');
      checks.gitRepo = fs.existsSync(gitPath);

      // Check readability
      try {
        await fs.promises.access(workspacePath, fs.constants.R_OK);
        checks.readable = true;
      } catch {
        checks.readable = false;
      }

      // Check writability
      try {
        await fs.promises.access(workspacePath, fs.constants.W_OK);
        checks.writable = true;
      } catch {
        checks.writable = false;
      }

      // Check disk space (simplified check)
      try {
        const stats = await fs.promises.statfs(workspacePath);
        checks.diskSpace = stats.bavail > 1024 * 1024 * 100; // At least 100MB free
      } catch {
        checks.diskSpace = false;
      }

      const health = Object.values(checks).every((check) => check === true)
        ? 'healthy'
        : 'unhealthy';

      return {
        success: true,
        health,
        checks,
        workspacePath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al verificar salud del workspace: ${error.message}`,
      };
    }
  }
}

module.exports = WorkspaceManager;
