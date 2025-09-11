// Path Utilities Module
// Handles path operations, directory management, and workspace-related path utilities

const path = require('path');

class PathUtilities {
  constructor(configManager) {
    this.configManager = configManager;
  }

  /**
   * Get workspace path for a specific client and branch
   */
  getWorkspacePath(client, branch) {
    return path.join(
      process.env.WORKSPACE_BASE_DIR || './workspaces',
      this.configManager.getValidationManager().sanitize(client),
      this.configManager.getValidationManager().sanitize(branch)
    );
  }

  /**
   * Get WireMock mappings base directory
   */
  getMappingsBasePath() {
    return process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
  }

  /**
   * Get mappings directory for a specific recording
   */
  getMappingsPath(recordingName) {
    const baseDir = this.getMappingsBasePath();
    return path.join(baseDir, recordingName);
  }

  /**
   * Get full path for a mapping file within a recording
   */
  getMappingFilePath(recordingName, relativePath) {
    const mappingsDir = this.getMappingsPath(recordingName);
    return path.join(mappingsDir, relativePath);
  }

  /**
   * Get recordings directory path
   */
  getRecordingsPath() {
    return path.join(__dirname, 'wiremock', 'mappings');
  }

  /**
   * Get full path for a recording file
   */
  getRecordingFilePath(recordingName) {
    const recordingsDir = this.getRecordingsPath();
    return path.join(recordingsDir, recordingName);
  }

  /**
   * Get APK files directory path
   */
  getApkDirectoryPath() {
    return process.env.APK_DIRECTORY || './apks';
  }

  /**
   * Get full path for an APK file
   */
  getApkFilePath(apkIdentifier) {
    const apkDir = this.getApkDirectoryPath();
    const sanitizedIdentifier = this.configManager.getValidationManager().sanitize(apkIdentifier);
    return path.join(apkDir, `${sanitizedIdentifier}.apk`);
  }

  /**
   * Get test features directory path within workspace
   */
  getTestFeaturesPath(workspacePath) {
    return path.join(workspacePath, 'test', 'features');
  }

  /**
   * Get Git repository path within workspace
   */
  getGitRepositoryPath(workspacePath) {
    return path.join(workspacePath, 'repository');
  }

  /**
   * Get temporary directory path
   */
  getTempPath() {
    return process.env.TEMP_DIR || './temp';
  }

  /**
   * Get logs directory path
   */
  getLogsPath() {
    return process.env.LOGS_DIR || './logs';
  }

  /**
   * Get worker log file path
   */
  getWorkerLogPath(workerId) {
    const logsDir = this.getLogsPath();
    return path.join(logsDir, `worker-${workerId}.log`);
  }

  /**
   * Get job log file path
   */
  getJobLogPath(jobId) {
    const logsDir = this.getLogsPath();
    return path.join(logsDir, `job-${jobId}.log`);
  }

  /**
   * Ensure directory exists for a given path
   */
  ensureDirectoryExists(dirPath) {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get relative path from base directory
   */
  getRelativePath(fromPath, toPath) {
    return path.relative(fromPath, toPath);
  }

  /**
   * Normalize path for cross-platform compatibility
   */
  normalizePath(filePath) {
    return path.normalize(filePath);
  }

  /**
   * Check if path is absolute
   */
  isAbsolutePath(filePath) {
    return path.isAbsolute(filePath);
  }

  /**
   * Convert to absolute path (relative to current working directory)
   */
  toAbsolutePath(relativePath) {
    return path.resolve(relativePath);
  }

  /**
   * Get file extension from path
   */
  getFileExtension(filePath) {
    return path.extname(filePath);
  }

  /**
   * Get file name without extension
   */
  getFileNameWithoutExtension(filePath) {
    const ext = path.extname(filePath);
    const name = path.basename(filePath);
    return ext ? name.slice(0, -ext.length) : name;
  }

  /**
   * Get directory name from path
   */
  getDirectoryName(filePath) {
    return path.dirname(filePath);
  }

  /**
   * Join multiple path segments
   */
  joinPaths(...segments) {
    return path.join(...segments);
  }

  /**
   * Resolve path segments to absolute path
   */
  resolvePaths(...segments) {
    return path.resolve(...segments);
  }

  /**
   * Split path into directory and file components
   */
  splitPath(filePath) {
    return {
      directory: path.dirname(filePath),
      fileName: path.basename(filePath)
    };
  }

  /**
   * Get application public directory path
   */
  getPublicPath() {
    return path.join(__dirname, 'public');
  }

  /**
   * Get application static resource path
   */
  getStaticPath(resource) {
    const publicPath = this.getPublicPath();
    return path.join(publicPath, resource);
  }

  /**
   * Get current working directory
   */
  getCurrentWorkingDirectory() {
    return process.cwd();
  }

  /**
   * Get application root directory
   */
  getApplicationRoot() {
    return __dirname;
  }

  /**
   * Create path for test output files
   */
  getTestOutputPath(testName) {
    const baseOutputDir = process.env.TEST_OUTPUT_DIR || './test-output';
    const sanitizedTestName = this.configManager.getValidationManager().sanitize(testName);
    return path.join(baseOutputDir, sanitizedTestName);
  }

  /**
   * Get configuration file path
   */
  getConfigurationPath() {
    return process.env.CONFIG_FILE || './config.json';
  }

  /**
   * Get environment-specific configuration path
   */
  getEnvironmentConfigPath(environment) {
    const configDir = process.env.CONFIG_DIR || './config';
    return path.join(configDir, `${environment}.json`);
  }

  /**
   * Validate path exists and is accessible
   */
  validatePath(filePath) {
    const fs = require('fs');
    try {
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Clean path by removing redundant separators and references
   */
  cleanPath(filePath) {
    return path.normalize(filePath).replace(/\/+/g, '/');
  }

  /**
   * Get backup path for a file
   */
  getBackupPath(filePath, timestamp = Date.now()) {
    const dir = path.dirname(filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    return path.join(dir, `${name}_backup_${timestamp}${ext}`);
  }
}

module.exports = PathUtilities;