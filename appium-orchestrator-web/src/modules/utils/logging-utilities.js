// Logging Utilities Module
// Handles logging operations, log formatting, and log management

const fs = require('fs');
const path = require('path');

class LoggingUtilities {
  constructor(configManager, pathUtilities) {
    this.configManager = configManager;
    this.pathUtilities = pathUtilities;
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
    this.currentLevel = this.configManager.get('LOG_LEVEL') || 'info';
    this.logToConsole = this.configManager.get('LOG_TO_CONSOLE') !== false;
    this.logToFile = this.configManager.get('LOG_TO_FILE') === true;
    this.logFormat = this.configManager.get('LOG_FORMAT') || 'text';
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    const logsDir = this.pathUtilities.getLogsPath();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  /**
   * Check if log level should be displayed
   */
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.currentLevel];
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta
    };

    if (this.logFormat === 'json') {
      return JSON.stringify(logEntry);
    }

    let formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      formattedMessage += ` ${JSON.stringify(meta)}`;
    }

    return formattedMessage;
  }

  /**
   * Write log message to file
   */
  writeToFile(formattedMessage) {
    if (!this.logToFile) return;

    const logFile = this.pathUtilities.getLogsPath() + '/app.log';
    fs.appendFileSync(logFile, formattedMessage + '\n');
  }

  /**
   * Write to console
   */
  writeToConsole(level, formattedMessage) {
    if (!this.logToConsole) return;

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'debug':
      case 'trace':
        console.log(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Log error message
   */
  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  /**
   * Log warning message
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  /**
   * Log info message
   */
  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  /**
   * Log debug message
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  /**
   * Log trace message
   */
  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  /**
   * Generic log method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    this.writeToConsole(level, formattedMessage);
    this.writeToFile(formattedMessage);
  }

  /**
   * Log HTTP request
   */
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };

    if (res.statusCode >= 400) {
      this.warn('HTTP Request', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  /**
   * Log worker operations
   */
  logWorkerOperation(workerId, operation, details = {}) {
    this.info(`Worker ${workerId} ${operation}`, {
      workerId,
      operation,
      ...details
    });
  }

  /**
   * Log job operations
   */
  logJobOperation(jobId, operation, details = {}) {
    this.info(`Job ${jobId} ${operation}`, {
      jobId,
      operation,
      ...details
    });
  }

  /**
   * Log git operations
   */
  logGitOperation(operation, details = {}) {
    this.info(`Git ${operation}`, {
      operation,
      ...details
    });
  }

  /**
   * log file operations
   */
  logFileOperation(operation, filePath, details = {}) {
    this.info(`File ${operation}`, {
      operation,
      filePath,
      ...details
    });
  }

  /**
   * log socket.io operations
   */
  logSocketOperation(operation, details = {}) {
    this.debug(`Socket ${operation}`, {
      operation,
      ...details
    });
  }

  /**
   * Log database operations
   */
  logDatabaseOperation(operation, details = {}) {
    this.debug(`Database ${operation}`, {
      operation,
      ...details
    });
  }

  /**
   * Log authentication operations
   */
  logAuthOperation(operation, details = {}) {
    this.info(`Auth ${operation}`, {
      operation,
      ...details
    });
  }

  /**
   * Log error with stack trace
   */
  logError(error, context = {}) {
    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context
    };

    this.error('Application Error', errorData);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, details = {}) {
    this.info(`Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...details
    });
  }

  /**
   * Create request logger middleware
   */
  createRequestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const responseTime = Date.now() - start;
        this.logRequest(req, res, responseTime);
      });

      next();
    };
  }

  /**
   * Create error logger middleware
   */
  createErrorLogger() {
    return (error, req, res, next) => {
      this.logError(error, {
        url: req.url,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      });
      next(error);
    };
  }

  /**
   * Log system information
   */
  logSystemInfo() {
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    };

    this.info('System Information', systemInfo);
  }

  /**
   * Log application startup
   */
  logStartup(port) {
    this.info('Application Starting', {
      port,
      environment: process.env.NODE_ENV,
      logLevel: this.currentLevel,
      logFormat: this.logFormat
    });
  }

  /**
   * Log application shutdown
   */
  logShutdown() {
    this.info('Application Shutting Down', {
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Rotate log files when they get too large
   */
  rotateLogFiles() {
    if (!this.logToFile) return;

    const logFile = this.pathUtilities.getLogsPath() + '/app.log';
    const maxSize = this.configManager.get('LOG_MAX_SIZE') || 10 * 1024 * 1024; // 10MB default

    try {
      const stats = fs.statSync(logFile);
      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = this.pathUtilities.getLogsPath() + `/app-${timestamp}.log`;
        fs.renameSync(logFile, backupFile);
        this.info('Log file rotated', { originalSize: stats.size, backupFile });
      }
    } catch (error) {
      // If file doesn't exist, no need to rotate
      if (error.code !== 'ENOENT') {
        this.logError(error, { context: 'log rotation' });
      }
    }
  }

  /**
   * Clean old log files
   */
  cleanOldLogs(maxAgeDays = 30) {
    if (!this.logToFile) return;

    const logsDir = this.pathUtilities.getLogsPath();
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(logsDir);
      let cleanedCount = 0;

      files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime && file !== 'app.log') {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        this.info('Cleaned old log files', { cleanedCount, maxAgeDays });
      }
    } catch (error) {
      this.logError(error, { context: 'log cleanup' });
    }
  }

  /**
   * Get log file contents
   */
  getLogContents(lines = 100) {
    const logFile = this.pathUtilities.getLogsPath() + '/app.log';
    
    try {
      if (!fs.existsSync(logFile)) {
        return { success: false, error: 'Log file not found' };
      }

      const content = fs.readFileSync(logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);

      return {
        success: true,
        lines: recentLines,
        totalLines: allLines.length
      };
    } catch (error) {
      this.logError(error, { context: 'get log contents' });
      return { success: false, error: error.message };
    }
  }

  /**
   * Stream log file contents
   */
  streamLogFiles(req, res) {
    const logFile = this.pathUtilities.getLogsPath() + '/app.log';
    
    try {
      if (!fs.existsSync(logFile)) {
        return res.status(404).json({ error: 'Log file not found' });
      }

      const stream = fs.createReadStream(logFile);
      res.setHeader('Content-Type', 'text/plain');
      stream.pipe(res);
    } catch (error) {
      this.logError(error, { context: 'stream log file' });
      res.status(500).json({ error: 'Failed to stream log file' });
    }
  }

  /**
   * Create structured logger for specific module
   */
  createModuleLogger(moduleName) {
    return {
      error: (message, meta = {}) => this.error(message, { module: moduleName, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { module: moduleName, ...meta }),
      info: (message, meta = {}) => this.info(message, { module: moduleName, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { module: moduleName, ...meta }),
      trace: (message, meta = {}) => this.trace(message, { module: moduleName, ...meta })
    };
  }

  /**
   * Log audit trail for security operations
   */
  logAudit(action, user, details = {}) {
    this.info('Audit Log', {
      action,
      user,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Log health check results
   */
  logHealthCheck(results) {
    this.info('Health Check', {
      timestamp: new Date().toISOString(),
      status: results.status,
      checks: results.checks,
      uptime: process.uptime()
    });
  }
}

module.exports = LoggingUtilities;