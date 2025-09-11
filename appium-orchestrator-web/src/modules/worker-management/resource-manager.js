// Resource Manager Module
// Handles system resource monitoring, cleanup, and resource allocation

const fs = require('fs');
const path = require('path');
const os = require('os');

class ResourceManager {
  constructor(configManager, validationManager) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.resourceUsage = {
      memory: [],
      cpu: [],
      disk: [],
      workers: [],
    };
    this.monitoringInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Initialize resource monitoring
   */
  initialize() {
    this.startMonitoring();
    this.startCleanupTasks();
  }

  /**
   * Start resource monitoring
   */
  startMonitoring() {
    const interval = this.configManager.get('RESOURCE_MONITORING_INTERVAL') || 30000; // 30 seconds
    
    this.monitoringInterval = setInterval(() => {
      this.collectResourceMetrics();
    }, interval);

    console.log(`Resource monitoring started with ${interval}ms interval`);
  }

  /**
   * Start cleanup tasks
   */
  startCleanupTasks() {
    const interval = this.configManager.get('CLEANUP_INTERVAL') || 3600000; // 1 hour
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanupTasks();
    }, interval);

    console.log(`Cleanup tasks started with ${interval}ms interval`);
  }

  /**
   * Collect resource metrics
   */
  collectResourceMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const diskUsage = this.getDiskUsage();

    const metrics = {
      timestamp: Date.now(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers || 0,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      disk: diskUsage,
      system: {
        uptime: process.uptime(),
        loadAverage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
      },
    };

    // Store metrics (keep last 1000 entries)
    Object.keys(this.resourceUsage).forEach((key) => {
      if (metrics[key]) {
        this.resourceUsage[key].push({
          timestamp: metrics.timestamp,
          data: metrics[key],
        });
        
        // Keep only last 1000 entries
        if (this.resourceUsage[key].length > 1000) {
          this.resourceUsage[key] = this.resourceUsage[key].slice(-1000);
        }
      }
    });

    // Check for resource warnings
    this.checkResourceWarnings(metrics);
  }

  /**
   * Get disk usage information
   */
  getDiskUsage() {
    try {
      const tempDir = os.tmpdir();
      const stats = fs.statfsSync(tempDir);
      
      return {
        total: stats.blocks * stats.bsize,
        free: stats.bfree * stats.bsize,
        available: stats.bavail * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize,
        usedPercentage: ((stats.blocks - stats.bfree) / stats.blocks) * 100,
      };
    } catch (error) {
      console.warn('Could not get disk usage:', error.message);
      return {
        total: 0,
        free: 0,
        available: 0,
        used: 0,
        usedPercentage: 0,
      };
    }
  }

  /**
   * Check for resource warnings
   */
  checkResourceWarnings(metrics) {
    const warnings = [];

    // Memory warnings
    const memoryUsagePercentage = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
    if (memoryUsagePercentage > 80) {
      warnings.push({
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${memoryUsagePercentage.toFixed(1)}%`,
        value: memoryUsagePercentage,
        threshold: 80,
      });
    }

    if (memoryUsagePercentage > 90) {
      warnings.push({
        type: 'memory',
        level: 'critical',
        message: `Critical memory usage: ${memoryUsagePercentage.toFixed(1)}%`,
        value: memoryUsagePercentage,
        threshold: 90,
      });
    }

    // Disk warnings
    if (metrics.disk.usedPercentage > 80) {
      warnings.push({
        type: 'disk',
        level: 'warning',
        message: `High disk usage: ${metrics.disk.usedPercentage.toFixed(1)}%`,
        value: metrics.disk.usedPercentage,
        threshold: 80,
      });
    }

    if (metrics.disk.usedPercentage > 90) {
      warnings.push({
        type: 'disk',
        level: 'critical',
        message: `Critical disk usage: ${metrics.disk.usedPercentage.toFixed(1)}%`,
        value: metrics.disk.usedPercentage,
        threshold: 90,
      });
    }

    // System load warnings
    if (metrics.system.loadAverage[0] > metrics.system.cpus) {
      warnings.push({
        type: 'cpu',
        level: 'warning',
        message: `High system load: ${metrics.system.loadAverage[0].toFixed(2)} (CPUs: ${metrics.system.cpus})`,
        value: metrics.system.loadAverage[0],
        threshold: metrics.system.cpus,
      });
    }

    if (warnings.length > 0) {
      console.warn('Resource warnings:', warnings);
      // You could emit these via socket.io to the frontend
    }

    return warnings;
  }

  /**
   * Perform cleanup tasks
   */
  async performCleanupTasks() {
    console.log('Starting cleanup tasks...');
    
    try {
      // Clean up temporary directories
      await this.cleanupTempDirectories();
      
      // Clean up old reports
      await this.cleanupOldReports();
      
      // Clean up old logs
      await this.cleanupOldLogs();
      
      // Clean up worker workspaces
      await this.cleanupWorkerWorkspaces();
      
      console.log('Cleanup tasks completed');
    } catch (error) {
      console.error('Error during cleanup tasks:', error);
    }
  }

  /**
   * Clean up temporary directories
   */
  async cleanupTempDirectories() {
    const tempDir = os.tmpdir();
    const maxAge = this.configManager.get('TEMP_FILE_MAX_AGE_HOURS') || 24;
    const cutoffTime = Date.now() - (maxAge * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(tempDir);
      let cleanedCount = 0;

      files.forEach((file) => {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);

        // Clean up appium-orchestrator temporary directories
        if (file.startsWith('appium-orchestrator-') && stats.isDirectory()) {
          if (stats.mtime.getTime() < cutoffTime) {
            fs.rmSync(filePath, { recursive: true, force: true });
            cleanedCount++;
          }
        }
      });

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} temporary directories`);
      }
    } catch (error) {
      console.error('Error cleaning temporary directories:', error);
    }
  }

  /**
   * Clean up old reports
   */
  async cleanupOldReports() {
    const reportsDir = path.join(__dirname, '..', '..', 'reports');
    const maxAge = this.configManager.get('REPORT_MAX_AGE_DAYS') || 30;
    const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);

    try {
      if (!fs.existsSync(reportsDir)) return;

      const files = fs.readdirSync(reportsDir);
      let cleanedCount = 0;

      files.forEach((file) => {
        const filePath = path.join(reportsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old reports`);
      }
    } catch (error) {
      console.error('Error cleaning old reports:', error);
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs() {
    const logsDir = path.join(__dirname, '..', '..', 'logs');
    const maxAge = this.configManager.get('LOG_MAX_AGE_DAYS') || 7;
    const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);

    try {
      if (!fs.existsSync(logsDir)) return;

      const files = fs.readdirSync(logsDir);
      let cleanedCount = 0;

      files.forEach((file) => {
        if (file.endsWith('.log')) {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      });

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old log files`);
      }
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }

  /**
   * Clean up worker workspaces
   */
  async cleanupWorkerWorkspaces() {
    const tempDir = os.tmpdir();
    const maxAge = this.configManager.get('WORKSPACE_MAX_AGE_HOURS') || 6;
    const cutoffTime = Date.now() - (maxAge * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(tempDir);
      let cleanedCount = 0;

      files.forEach((file) => {
        if (file.startsWith('appium-orchestrator-') && fs.statSync(path.join(tempDir, file)).isDirectory()) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtime.getTime() < cutoffTime) {
            fs.rmSync(filePath, { recursive: true, force: true });
            cleanedCount++;
          }
        }
      });

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} worker workspaces`);
      }
    } catch (error) {
      console.error('Error cleaning worker workspaces:', error);
    }
  }

  /**
   * Get resource usage statistics
   */
  getResourceStatistics() {
    const latestMemory = this.resourceUsage.memory[this.resourceUsage.memory.length - 1];
    const latestCpu = this.resourceUsage.cpu[this.resourceUsage.cpu.length - 1];
    const latestDisk = this.resourceUsage.disk[this.resourceUsage.disk.length - 1];

    return {
      memory: latestMemory ? latestMemory.data : null,
      cpu: latestCpu ? latestCpu.data : null,
      disk: latestDisk ? latestDisk.data : null,
      monitoring: {
        memoryPoints: this.resourceUsage.memory.length,
        cpuPoints: this.resourceUsage.cpu.length,
        diskPoints: this.resourceUsage.disk.length,
        workerPoints: this.resourceUsage.workers.length,
        startTime: this.resourceUsage.memory[0]?.timestamp || Date.now(),
      },
    };
  }

  /**
   * Get resource usage history
   */
  getResourceHistory(type, limit = 100) {
    const history = this.resourceUsage[type] || [];
    return history.slice(-limit);
  }

  /**
   * Check if system has enough resources for a new worker
   */
  canCreateWorker() {
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    const diskUsage = this.getDiskUsage();
    
    // Check memory usage (should be below 85%)
    if (memoryUsagePercentage > 85) {
      return {
        canCreate: false,
        reason: `Memory usage too high: ${memoryUsagePercentage.toFixed(1)}%`,
      };
    }

    // Check disk space (should have at least 1GB free)
    if (diskUsage.available < 1024 * 1024 * 1024) {
      return {
        canCreate: false,
        reason: `Insufficient disk space: ${(diskUsage.available / 1024 / 1024 / 1024).toFixed(1)}GB free`,
      };
    }

    return { canCreate: true };
  }

  /**
   * Get system health status
   */
  getSystemHealth() {
    const stats = this.getResourceStatistics();
    const warnings = this.checkResourceWarnings({
      memory: stats.memory,
      cpu: stats.cpu,
      disk: stats.disk,
      system: {
        uptime: process.uptime(),
        loadAverage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
      },
    });

    return {
      status: warnings.length === 0 ? 'healthy' : 'warning',
      warnings,
      statistics: stats,
      timestamp: Date.now(),
    };
  }

  /**
   * Stop resource monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log('Resource monitoring stopped');
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    this.stopMonitoring();
    await this.performCleanupTasks();
    
    // Clear resource history
    Object.keys(this.resourceUsage).forEach((key) => {
      this.resourceUsage[key] = [];
    });
  }
}

module.exports = ResourceManager;