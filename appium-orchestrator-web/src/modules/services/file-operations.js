// File Operations Service Module
// Handles file system operations, directory management, and file processing

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');

class FileOperationsService {
  constructor(configManager) {
    this.configManager = configManager;
  }

  /**
   * Create directory if it doesn't exist
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath, encoding = 'utf8') {
    return await fs.readFile(filePath, encoding);
  }

  /**
   * Write file content
   */
  async writeFile(filePath, content, encoding = 'utf8') {
    await fs.writeFile(filePath, content, encoding);
  }

  /**
   * Delete file
   */
  async deleteFile(filePath) {
    await fs.unlink(filePath);
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath) {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return [];
    }
  }

  /**
   * Get file statistics
   */
  async getFileStats(filePath) {
    return await fs.stat(filePath);
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath, destinationPath) {
    await fs.copyFile(sourcePath, destinationPath);
  }

  /**
   * Move file
   */
  async moveFile(sourcePath, destinationPath) {
    await fs.rename(sourcePath, destinationPath);
  }

  /**
   * Delete directory recursively
   */
  async deleteDirectory(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * Clean old files in directory
   */
  async cleanOldFiles(dirPath, maxAgeMs) {
    try {
      const files = await fs.readdir(dirPath);
      const cutoffTime = Date.now() - maxAgeMs;
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await this.getFileStats(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning old files:', error);
      return 0;
    }
  }

  /**
   * Split and save WireMock mappings
   */
  splitAndSaveMappings(mappings, recordingName) {
    const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
    const mappingsDir = path.join(baseDir, recordingName);

    // Create directory if it doesn't exist
    if (!fsSync.existsSync(mappingsDir)) {
      fsSync.mkdirSync(mappingsDir, { recursive: true });
    }

    const groupedMappings = new Map();

    // Group mappings by URL path
    mappings.forEach((mapping) => {
      const url = mapping.request.url;
      if (!url) return;

      const pathParts = url.split('?')[0].split('/').filter(Boolean);
      if (pathParts.length === 0) return;

      const dirPath = path.join(mappingsDir, ...pathParts.slice(0, -1));
      const fileName = `${pathParts[pathParts.length - 1] || 'index'}.json`;
      const filePath = path.join(dirPath, fileName);

      if (!groupedMappings.has(filePath)) {
        groupedMappings.set(filePath, []);
      }
      groupedMappings.get(filePath).push(mapping);
    });

    // Save grouped mappings
    let filesCreated = 0;
    groupedMappings.forEach((mappings, filePath) => {
      const dirPath = path.dirname(filePath);
      if (!fsSync.existsSync(dirPath)) {
        fsSync.mkdirSync(dirPath, { recursive: true });
      }
      fsSync.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));
      filesCreated++;
    });

    return { totalMappings: mappings.length, filesCreated };
  }

  /**
   * Save mappings as single file
   */
  saveMappingsAsSingleFile(mappings, recordingName) {
    const baseDir = process.env.WIREMOCK_MAPPINGS_DIR || './wiremock/mappings';
    const filePath = path.join(baseDir, `${recordingName}.json`);

    const dirPath = path.dirname(filePath);
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }

    fsSync.writeFileSync(filePath, JSON.stringify({ mappings }, null, 2));
    return { totalMappings: mappings.length, filesCreated: 1 };
  }

  /**
   * Create ZIP archive
   */
  async createZipArchive(sourcePath, outputPath, files) {
    return new Promise((resolve, reject) => {
      const output = fsSync.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve(archive.pointer());
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      if (Array.isArray(files)) {
        // Add specific files
        files.forEach((file) => {
          const fullPath = path.join(sourcePath, file);
          if (fsSync.existsSync(fullPath)) {
            const stats = fsSync.statSync(fullPath);
            if (stats.isFile()) {
              archive.file(fullPath, { name: file });
            }
          }
        });
      } else {
        // Add entire directory
        archive.directory(sourcePath, false);
      }

      archive.finalize();
    });
  }

  /**
   * Calculate file hash
   */
  async calculateFileHash(filePath, algorithm = 'sha256') {
    const hash = crypto.createHash(algorithm);
    const data = await this.readFile(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Get directory size
   */
  async getDirectorySize(dirPath) {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    let size = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        const stats = await this.getFileStats(filePath);
        size += stats.size;
      }
    }

    return size;
  }

  /**
   * Find files by pattern
   */
  async findFiles(dirPath, pattern) {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        const subResults = await this.findFiles(filePath, pattern);
        results.push(...subResults);
      } else if (file.name.match(pattern)) {
        results.push(filePath);
      }
    }

    return results;
  }

  /**
   * Read JSON file
   */
  async readJsonFile(filePath) {
    const content = await this.readFile(filePath);
    return JSON.parse(content);
  }

  /**
   * Write JSON file
   */
  async writeJsonFile(filePath, data, indent = 2) {
    const content = JSON.stringify(data, null, indent);
    await this.writeFile(filePath, content);
  }

  /**
   * Get file extension
   */
  getFileExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Validate file extension against allowed extensions
   */
  isValidFileExtension(filePath, allowedExtensions) {
    const ext = this.getFileExtension(filePath);
    return allowedExtensions.includes(ext);
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Get unique filename
   */
  getUniqueFilename(dirPath, baseName, extension = '') {
    let counter = 1;
    let filename = `${baseName}${extension}`;
    let filePath = path.join(dirPath, filename);

    while (fsSync.existsSync(filePath)) {
      filename = `${baseName}_${counter}${extension}`;
      filePath = path.join(dirPath, filename);
      counter++;
    }

    return filename;
  }
}

module.exports = FileOperationsService;
