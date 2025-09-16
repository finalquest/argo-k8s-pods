// Process Manager Module
// Handles process operations, recording sequences, and report management

const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

class ProcessManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.io = null; // Will be set by server
  }

  /**
   * Initialize the process manager with socket.io
   */
  initialize(io) {
    this.io = io;
  }

  /**
   * Start recording sequence for a job
   */
  async startRecordingSequence(job, worker) {
    const { id, feature } = job;
    const { id: slotId } = worker;

    try {
      await fetch(`http://localhost:${this.configManager.get('PORT')}/api/wiremock/load-base-mappings`, {
        method: 'POST',
      });

      this.io.emit('log_update', {
        slotId,
        logLine: `   -> Iniciando grabación...
`,
      });

      await fetch(`http://localhost:${this.configManager.get('PORT')}/api/wiremock/recordings/start`, {
        method: 'POST',
      });

      this.io.emit('log_update', {
        slotId,
        logLine: `--- ▶️ Grabación iniciada. Ejecutando test... ---
`,
      });
    } catch (error) {
      console.error(
        `Error durante la secuencia de grabación para el job ${id}:`,
        error,
      );
      this.io.emit('log_update', {
        slotId,
        logLine: `--- ❌ Error al iniciar la grabación para ${feature}: ${error.message} ---
`,
      });
      throw error;
    }
  }

  /**
   * Stop recording sequence for a job
   */
  async stopRecordingSequence(job, worker) {
    const { id, feature } = job;
    const { id: slotId } = worker;

    try {
      this.io.emit('log_update', {
        slotId,
        logLine: `--- ⏹ Deteniendo grabación para ${feature}... ---
`,
      });

      const featureName = path.basename(feature, '.feature');
      const response = await fetch(
        `http://localhost:${this.configManager.get('PORT')}/api/wiremock/recordings/stop`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordingName: featureName,
            saveAsSingleFile: true,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to stop recording: ${response.status}`);
      }

      const result = await response.json();
      this.io.emit('log_update', {
        slotId,
        logLine: `--- 💾 Mappings guardados en ${result.summary.filesCreated > 1 ? 'directorio' : 'archivo'} ${featureName}.json (${result.summary.totalMappings} mappings) ---
`,
      });

      return result;
    } catch (error) {
      console.error(
        `Error al detener la grabación para el job ${id}:`,
        error,
      );
      this.io.emit('log_update', {
        slotId,
        logLine: `--- ❌ Error al guardar los mappings para ${feature}: ${error.message} ---
`,
      });
      throw error;
    }
  }

  /**
   * Handle report generation and URL creation
   */
  handleReport(job, reportPath) {
    try {
      const branch = this.validationManager.sanitize(job.branch);
      const feature = this.validationManager.sanitize(job.feature);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const destDir = path.join(
        __dirname,
        '..',
        '..',
        'public',
        'reports',
        branch,
        feature,
        timestamp,
      );

      fs.mkdirSync(destDir, { recursive: true });
      fs.cpSync(reportPath, destDir, { recursive: true });

      console.log(`Reporte copiado a ${destDir}`);

      const featureReportDir = path.join(
        __dirname,
        '..',
        '..',
        'public',
        'reports',
        branch,
        feature,
      );
      this.cleanupOldReports(featureReportDir);

      return `/reports/${branch}/${feature}/${timestamp}/`;
    } catch (error) {
      console.error('Error al manejar el reporte de Allure:', error);
      return null;
    }
  }

  /**
   * Clean up old reports for a feature
   */
  cleanupOldReports(featureReportDir) {
    const maxReports = parseInt(process.env.MAX_REPORTS_PER_FEATURE, 10) || 5;
    if (!fs.existsSync(featureReportDir)) return;

    const reports = fs
      .readdirSync(featureReportDir)
      .map((name) => ({ name, path: path.join(featureReportDir, name) }))
      .filter((item) => fs.statSync(item.path).isDirectory())
      .map((item) => ({
        ...item,
        time: fs.statSync(item.path).mtime.getTime(),
      }))
      .sort((a, b) => a.time - b.time); // Sort oldest first

    if (reports.length > maxReports) {
      const reportsToDelete = reports.slice(0, reports.length - maxReports);
      reportsToDelete.forEach((report) => {
        fs.rm(report.path, { recursive: true, force: true }, (err) => {
          if (err) {
            console.error(
              `Error eliminando reporte antiguo ${report.path}:`,
              err,
            );
          } else {
            console.log(`Reporte antiguo eliminado: ${report.name}`);
          }
        });
      });
    }
  }

  /**
   * Get process information
   */
  getProcessInfo(processId) {
    // This could be expanded to return detailed process information
    return {
      id: processId,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  /**
   * Get system resource information
   */
  getSystemResources() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        external: Math.round(usage.external / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  /**
   * Health check for the process manager
   */
  async healthCheck() {
    try {
      // Check if we can access the reports directory
      const reportsDir = path.join(__dirname, '..', '..', 'reports');
      const reportsAccessible =
        fs.existsSync(reportsDir) ||
        fs.mkdirSync(reportsDir, { recursive: true });

      // Check if we can access WireMock API
      let wiremockAccessible = false;
      try {
        const response = await fetch(
          `http://localhost:${this.configManager.get('PORT')}/api/wiremock/health`,
        );
        wiremockAccessible = response.ok;
      } catch (error) {
        console.warn('WireMock health check failed:', error.message);
      }

      return {
        status: 'healthy',
        reportsAccessible,
        wiremockAccessible,
        timestamp: new Date().toISOString(),
        systemResources: this.getSystemResources(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Archive old reports
   */
  archiveOldReports() {
    const reportsDir = path.join(__dirname, '..', '..', 'reports');
    const archiveDir = path.join(reportsDir, 'archive');

    if (!fs.existsSync(reportsDir)) return;

    // Create archive directory if it doesn't exist
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const maxAge = this.configManager.get('REPORT_ARCHIVE_AGE_DAYS') || 30;
    const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

    const reports = fs
      .readdirSync(reportsDir)
      .map((name) => ({ name, path: path.join(reportsDir, name) }))
      .filter((item) => {
        const stats = fs.statSync(item.path);
        return stats.isFile() && stats.mtime < cutoffDate;
      });

    reports.forEach((report) => {
      const archivePath = path.join(archiveDir, report.name);
      fs.renameSync(report.path, archivePath);
      console.log(`Report archived: ${report.name}`);
    });

    return reports.length;
  }

  /**
   * Get report statistics
   */
  getReportStatistics() {
    const reportsDir = path.join(__dirname, '..', '..', 'reports');
    const archiveDir = path.join(reportsDir, 'archive');

    const stats = {
      totalReports: 0,
      totalSize: 0,
      recentReports: 0,
      archivedReports: 0,
      oldestReport: null,
      newestReport: null,
    };

    // Count active reports
    if (fs.existsSync(reportsDir)) {
      const reports = fs
        .readdirSync(reportsDir)
        .map((name) => {
          const reportPath = path.join(reportsDir, name);
          const stats = fs.statSync(reportPath);
          return { name, path: reportPath, stats };
        })
        .filter((item) => item.stats.isFile());

      stats.totalReports += reports.length;
      stats.totalSize += reports.reduce(
        (sum, item) => sum + item.stats.size,
        0,
      );

      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      stats.recentReports = reports.filter(
        (item) => item.stats.mtime >= weekAgo,
      ).length;

      if (reports.length > 0) {
        stats.oldestReport = reports.reduce((oldest, current) =>
          current.stats.mtime < oldest.stats.mtime ? current : oldest,
        );
        stats.newestReport = reports.reduce((newest, current) =>
          current.stats.mtime > newest.stats.mtime ? current : newest,
        );
      }
    }

    // Count archived reports
    if (fs.existsSync(archiveDir)) {
      const archived = fs.readdirSync(archiveDir).length;
      stats.archivedReports = archived;
      stats.totalReports += archived;
    }

    return stats;
  }
}

module.exports = ProcessManager;
