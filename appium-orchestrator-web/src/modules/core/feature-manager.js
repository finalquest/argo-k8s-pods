// Feature Manager Module
// Handles feature file operations, content management, and recursive feature reading

const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const os = require('os');
const crypto = require('crypto');

class FeatureManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
  }

  /**
   * Get features for a specific branch and client
   */
  async getFeatures(branch, client) {
    const validationErrors = this.validationManager.validateMultiple({
      branch: { type: 'branch', value: branch },
      client: { type: 'client', value: client }
    });

    if (!validationErrors.isValid) {
      return {
        success: false,
        error: 'Invalid parameters',
        details: validationErrors.errors
      };
    }

    let featuresPath = null;
    let foundInPersistent = false;
    let tempDir = null;

    try {
      // Try to read from persistent workspace first
      if (this.configManager.isEnabled('persistentWorkspaces')) {
        const workspaceResult = await this.getFeaturesFromPersistentWorkspace(branch, client);
        if (workspaceResult.success) {
          featuresPath = workspaceResult.featuresPath;
          foundInPersistent = true;
          console.log(`[API Features] Leyendo features desde el workspace local para la branch: ${branch}`);
        }
      }

      // If not found in persistent workspace, clone from remote
      if (!foundInPersistent) {
        console.log(`[API Features] No se encontró workspace local para la branch ${branch}. Consultando repositorio remoto.`);
        const cloneResult = await this.cloneFeaturesFromRemote(branch, client);
        if (!cloneResult.success) {
          return cloneResult;
        }
        featuresPath = cloneResult.featuresPath;
        tempDir = cloneResult.tempDir;
      }

      // Read features from the determined path
      const features = await this.readFeaturesFromPath(featuresPath, featuresPath);
      
      return {
        success: true,
        features,
        source: foundInPersistent ? 'persistent' : 'remote',
        featuresPath
      };
    } catch (error) {
      console.error(`Error al obtener features para branch '${branch}' y client '${client}':`, error);
      return {
        success: false,
        error: 'Error interno al listar features.'
      };
    } finally {
      // Clean up temporary directory if used
      if (tempDir && fs.existsSync(tempDir)) {
        await this.cleanupTempDir(tempDir);
      }
    }
  }

  /**
   * Get features from persistent workspace
   */
  async getFeaturesFromPersistentWorkspace(branch, client) {
    try {
      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = path.join(
        this.configManager.get('PERSISTENT_WORKSPACES_ROOT'),
        sanitizedBranch,
        'appium'
      );
      
      const potentialFeaturesPath = path.join(
        workspacePath,
        'test',
        'features',
        client,
        'feature',
        'modulos'
      );

      if (fs.existsSync(potentialFeaturesPath)) {
        return {
          success: true,
          featuresPath: potentialFeaturesPath,
          workspacePath
        };
      }

      return {
        success: false,
        error: 'Persistent workspace not found'
      };
    } catch (error) {
      return {
        success: false,
        error: `Error accessing persistent workspace: ${error.message}`
      };
    }
  }

  /**
   * Clone features from remote repository
   */
  async cloneFeaturesFromRemote(branch, client) {
    try {
      const tempDir = path.join(
        os.tmpdir(),
        `appium-features-${crypto.randomBytes(16).toString('hex')}`
      );
      
      const authenticatedUrl = this.getAuthenticatedUrl();
      
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const git = simpleGit(tempDir);
      await git.clone(authenticatedUrl, tempDir, [
        '--branch',
        branch,
        '--depth',
        '1',
        '--no-checkout'
      ]);

      const featureDirForCheckout = path.join(
        'test',
        'features',
        client,
        'feature',
        'modulos'
      );

      await git.checkout(branch, ['--', featureDirForCheckout]);
      const featuresPath = path.join(tempDir, featureDirForCheckout);

      return {
        success: true,
        featuresPath,
        tempDir
      };
    } catch (error) {
      console.error(`Error al clonar o hacer checkout para la branch '${branch}':`, error);
      return {
        success: false,
        error: 'Error interno al listar features.'
      };
    }
  }

  /**
   * Read features recursively from a directory
   */
  async readFeaturesRecursive(basePath, currentDirectory) {
    const entries = await fs.promises.readdir(currentDirectory, {
      withFileTypes: true,
    });
    
    const nodes = [];
    
    for (const dirent of entries) {
      const fullPath = path.join(currentDirectory, dirent.name);
      
      if (dirent.isDirectory()) {
        nodes.push({
          type: 'folder',
          name: dirent.name,
          path: path.relative(basePath, fullPath),
          children: await this.readFeaturesRecursive(basePath, fullPath)
        });
      } else if (dirent.isFile() && dirent.name.endsWith('.feature')) {
        // Calculate the relative path from the basePath to the feature file
        const relativePath = path.relative(basePath, fullPath);
        nodes.push({
          type: 'file',
          name: dirent.name, // Keep original file name for display
          featureName: relativePath.replace(/\.feature$/, ''), // This is the full relative path without extension
          path: relativePath
        });
      }
    }
    
    // Sort so folders appear before files
    return nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'folder' ? -1 : 1;
    });
  }

  /**
   * Read features from a path and return structured data
   */
  async readFeaturesFromPath(featuresPath, basePath) {
    if (!fs.existsSync(featuresPath)) {
      return [];
    }

    try {
      const features = await this.readFeaturesRecursive(basePath, featuresPath);
      return features;
    } catch (error) {
      console.error('Error reading features:', error);
      throw error;
    }
  }

  /**
   * Get feature content by path
   */
  async getFeatureContent(branch, client, feature) {
    const validationErrors = this.validationManager.validateMultiple({
      branch: { type: 'branch', value: branch },
      client: { type: 'client', value: client },
      feature: { type: 'featureFile', value: feature }
    });

    if (!validationErrors.isValid) {
      return {
        success: false,
        error: 'Invalid parameters',
        details: validationErrors.errors
      };
    }

    let featurePath = null;
    let foundInPersistent = false;
    let tempDir = null;

    try {
      // Try persistent workspace first
      if (this.configManager.isEnabled('persistentWorkspaces')) {
        const persistentResult = await this.getFeatureFromPersistentWorkspace(branch, client, feature);
        if (persistentResult.success) {
          featurePath = persistentResult.featurePath;
          foundInPersistent = true;
        }
      }

      // If not found in persistent workspace, clone from remote
      if (!foundInPersistent) {
        const cloneResult = await this.cloneFeatureFromRemote(branch, client, feature);
        if (!cloneResult.success) {
          return cloneResult;
        }
        featurePath = cloneResult.featurePath;
        tempDir = cloneResult.tempDir;
      }

      // Read feature content
      const content = await fs.promises.readFile(featurePath, 'utf8');
      
      return {
        success: true,
        content,
        path: feature,
        source: foundInPersistent ? 'persistent' : 'remote'
      };
    } catch (error) {
      console.error(`Error al obtener contenido del feature '${feature}':`, error);
      return {
        success: false,
        error: 'Error interno al obtener el contenido del feature.'
      };
    } finally {
      // Clean up temporary directory if used
      if (tempDir && fs.existsSync(tempDir)) {
        await this.cleanupTempDir(tempDir);
      }
    }
  }

  /**
   * Get feature from persistent workspace
   */
  async getFeatureFromPersistentWorkspace(branch, client, feature) {
    try {
      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = path.join(
        this.configManager.get('PERSISTENT_WORKSPACES_ROOT'),
        sanitizedBranch,
        'appium'
      );

      const featurePath = path.join(
        workspacePath,
        'test',
        'features',
        client,
        'feature',
        'modulos',
        feature
      );

      if (fs.existsSync(featurePath)) {
        return {
          success: true,
          featurePath,
          workspacePath
        };
      }

      return {
        success: false,
        error: 'Feature not found in persistent workspace'
      };
    } catch (error) {
      return {
        success: false,
        error: `Error accessing persistent workspace: ${error.message}`
      };
    }
  }

  /**
   * Clone specific feature from remote repository
   */
  async cloneFeatureFromRemote(branch, client, feature) {
    try {
      const tempDir = path.join(
        os.tmpdir(),
        `appium-feature-${crypto.randomBytes(16).toString('hex')}`
      );
      
      const authenticatedUrl = this.getAuthenticatedUrl();
      
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      const git = simpleGit(tempDir);
      await git.clone(authenticatedUrl, tempDir, [
        '--branch',
        branch,
        '--depth',
        '1',
        '--no-checkout'
      ]);

      const featurePathInRepo = path.join(
        'test',
        'features',
        client,
        'feature',
        'modulos',
        feature
      );

      await git.checkout(branch, ['--', featurePathInRepo]);
      const featurePath = path.join(tempDir, featurePathInRepo);

      return {
        success: true,
        featurePath,
        tempDir
      };
    } catch (error) {
      console.error(`Error al clonar feature '${feature}' para la branch '${branch}':`, error);
      return {
        success: false,
        error: 'Error interno al obtener el contenido del feature.'
      };
    }
  }

  /**
   * Save feature content
   */
  async saveFeatureContent(branch, client, feature, content) {
    const validationErrors = this.validationManager.validateMultiple({
      branch: { type: 'branch', value: branch },
      client: { type: 'client', value: client },
      feature: { type: 'featureFile', value: feature }
    });

    if (!validationErrors.isValid) {
      return {
        success: false,
        error: 'Invalid parameters',
        details: validationErrors.errors
      };
    }

    if (!this.configManager.isEnabled('persistentWorkspaces')) {
      return {
        success: false,
        error: 'La funcionalidad de workspaces persistentes no está habilitada.'
      };
    }

    try {
      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = path.join(
        this.configManager.get('PERSISTENT_WORKSPACES_ROOT'),
        sanitizedBranch,
        'appium'
      );

      const featurePath = path.join(
        workspacePath,
        'test',
        'features',
        client,
        'feature',
        'modulos',
        feature
      );

      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(featurePath), { recursive: true });

      // Write content
      await fs.promises.writeFile(featurePath, content, 'utf8');

      return {
        success: true,
        message: 'Feature guardado exitosamente',
        path: featurePath
      };
    } catch (error) {
      console.error(`Error al guardar feature '${feature}':`, error);
      return {
        success: false,
        error: 'Error interno al guardar el feature.'
      };
    }
  }

  /**
   * Get authenticated Git URL
   */
  getAuthenticatedUrl() {
    const gitConfig = this.configManager.getGitConfig();
    return gitConfig.url;
  }

  /**
   * Clean up temporary directory
   */
  async cleanupTempDir(tempDir) {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Warning: Could not clean up temp directory ${tempDir}:`, error);
    }
  }

  /**
   * Validate feature file name
   */
  validateFeatureFileName(fileName) {
    const errors = [];

    if (!fileName || typeof fileName !== 'string') {
      errors.push('Feature file name is required');
      return errors;
    }

    if (!fileName.endsWith('.feature')) {
      errors.push('Feature file must have .feature extension');
    }

    if (fileName.trim() !== fileName) {
      errors.push('Feature file name cannot have leading/trailing whitespace');
    }

    // Check for path traversal patterns
    if (fileName.includes('../') || fileName.includes('..\\')) {
      errors.push('Feature file name cannot contain path traversal patterns');
    }

    // Check for dangerous characters
    const dangerousChars = /[;|&`$'"<>]/;
    if (dangerousChars.test(fileName)) {
      errors.push('Feature file name contains dangerous characters');
    }

    return errors;
  }

  /**
   * Get feature statistics
   */
  async getFeatureStatistics(branch, client) {
    try {
      const featuresResult = await this.getFeatures(branch, client);
      if (!featuresResult.success) {
        return featuresResult;
      }

      const features = featuresResult.features;
      const stats = {
        totalFeatures: 0,
        totalFolders: 0,
        totalFiles: 0,
        featureSizes: {},
        lastModified: {}
      };

      // Count features and calculate sizes
      const countFeatures = (nodes) => {
        nodes.forEach(node => {
          if (node.type === 'folder') {
            stats.totalFolders++;
            if (node.children) {
              countFeatures(node.children);
            }
          } else if (node.type === 'file') {
            stats.totalFiles++;
            stats.totalFeatures++;
          }
        });
      };

      countFeatures(features);

      return {
        success: true,
        statistics: stats,
        features
      };
    } catch (error) {
      return {
        success: false,
        error: `Error getting feature statistics: ${error.message}`
      };
    }
  }
}

module.exports = FeatureManager;