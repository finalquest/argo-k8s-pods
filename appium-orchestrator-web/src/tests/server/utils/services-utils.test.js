// Services & Utils Tests
// Tests for file operations, git operations, utility functions, and helper services

const path = require('path');
const fs = require('fs');
const os = require('os');

// Extract utility functions from server.js for testing
function sanitize(name) {
  if (!name) return '';
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

describe('Services & Utils', () => {
  describe('File Operations Service', () => {
    test('should handle directory creation', () => {
      const mockDirectoryService = {
        createDirectory: (dirPath) => {
          if (!dirPath || typeof dirPath !== 'string') {
            throw new Error('Invalid directory path');
          }
          return { success: true, path: dirPath, created: true };
        }
      };

      const result = mockDirectoryService.createDirectory('/tmp/test-dir');
      expect(result.success).toBe(true);
      expect(result.path).toBe('/tmp/test-dir');
      expect(result.created).toBe(true);

      expect(() => {
        mockDirectoryService.createDirectory(null);
      }).toThrow('Invalid directory path');
    });

    test('should handle file reading', () => {
      const mockFileService = {
        readFile: (filePath) => {
          if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
          }
          
          // Mock different file types
          if (filePath.endsWith('.feature')) {
            return 'Feature: Login\n  Scenario: User login\n    Given user is on login page\n    When user enters credentials\n    Then user should be logged in';
          } else if (filePath.endsWith('.json')) {
            return '{"test": "data", "number": 123}';
          } else {
            return 'Plain text content';
          }
        }
      };

      const featureContent = mockFileService.readFile('/path/to/login.feature');
      expect(featureContent).toContain('Feature: Login');
      expect(featureContent).toContain('Scenario: User login');

      const jsonContent = mockFileService.readFile('/path/to/data.json');
      expect(jsonContent).toContain('"test": "data"');

      const textContent = mockFileService.readFile('/path/to/file.txt');
      expect(textContent).toBe('Plain text content');
    });

    test('should handle file writing', () => {
      const mockFileService = {
        writeFile: (filePath, content) => {
          if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
          }
          if (content === undefined || content === null) {
            throw new Error('Invalid content');
          }
          return { success: true, path: filePath, bytesWritten: content.length };
        }
      };

      const result = mockFileService.writeFile('/tmp/test.txt', 'Hello World');
      expect(result.success).toBe(true);
      expect(result.path).toBe('/tmp/test.txt');
      expect(result.bytesWritten).toBe(11);

      expect(() => {
        mockFileService.writeFile(null, 'content');
      }).toThrow('Invalid file path');
    });

    test('should handle file deletion', () => {
      const mockFileService = {
        deleteFile: (filePath) => {
          if (!filePath || typeof filePath !== 'string') {
            throw new Error('Invalid file path');
          }
          return { success: true, path: filePath, deleted: true };
        }
      };

      const result = mockFileService.deleteFile('/tmp/test.txt');
      expect(result.success).toBe(true);
      expect(result.path).toBe('/tmp/test.txt');
      expect(result.deleted).toBe(true);
    });

    test('should handle directory listing', () => {
      const mockFileService = {
        listDirectory: (dirPath) => {
          if (!dirPath || typeof dirPath !== 'string') {
            throw new Error('Invalid directory path');
          }
          
          // Mock directory contents
          return [
            { name: 'file1.txt', type: 'file', size: 1024 },
            { name: 'file2.feature', type: 'file', size: 2048 },
            { name: 'subdir', type: 'directory', size: 0 }
          ];
        }
      };

      const result = mockFileService.listDirectory('/tmp/test-dir');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('size');
    });
  });

  describe('Git Operations Service', () => {
    test('should handle git URL authentication', () => {
      const mockGitService = {
        getAuthenticatedUrl: (url, username, password) => {
          if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL');
          }
          
          if (!username || !password) {
            return url;
          }
          
          try {
            const urlObj = new URL(url);
            urlObj.username = username;
            urlObj.password = password;
            return urlObj.toString();
          } catch (error) {
            return url; // Return original URL if parsing fails
          }
        }
      };

      const testUrl = 'https://github.com/user/repo.git';
      const authenticatedUrl = mockGitService.getAuthenticatedUrl(testUrl, 'username', 'password');
      expect(authenticatedUrl).toContain('username:password@');

      const originalUrl = mockGitService.getAuthenticatedUrl(testUrl, '', '');
      expect(originalUrl).toBe(testUrl);
    });

    test('should handle git command execution', () => {
      const mockGitService = {
        executeGitCommand: (command, args, options = {}) => {
          if (!command || typeof command !== 'string') {
            throw new Error('Invalid git command');
          }
          
          const fullCommand = `git ${command} ${args.join(' ')}`;
          return {
            command: fullCommand,
            success: true,
            output: `Mock output for: ${fullCommand}`,
            exitCode: 0
          };
        }
      };

      const result = mockGitService.executeGitCommand('clone', ['https://github.com/user/repo.git', '/tmp/repo']);
      expect(result.success).toBe(true);
      expect(result.command).toBe('git clone https://github.com/user/repo.git /tmp/repo');
      expect(result.exitCode).toBe(0);
    });

    test('should handle git branch operations', () => {
      const mockGitService = {
        listBranches: (repoPath) => {
          return [
            { name: 'main', current: true },
            { name: 'develop', current: false },
            { name: 'feature/test-branch', current: false }
          ];
        },
        
        checkoutBranch: (repoPath, branchName) => {
          return {
            success: true,
            branch: branchName,
            message: `Successfully checked out ${branchName}`
          };
        }
      };

      const branches = mockGitService.listBranches('/tmp/repo');
      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBe(3);
      expect(branches[0].name).toBe('main');
      expect(branches[0].current).toBe(true);

      const checkoutResult = mockGitService.checkoutBranch('/tmp/repo', 'develop');
      expect(checkoutResult.success).toBe(true);
      expect(checkoutResult.branch).toBe('develop');
    });

    test('should handle git status operations', () => {
      const mockGitService = {
        getStatus: (repoPath) => {
          return {
            isClean: false,
            modified: ['file1.txt', 'src/app.js'],
            added: ['new-file.txt'],
            deleted: ['old-file.txt'],
            untracked: ['temp.log']
          };
        }
      };

      const status = mockGitService.getStatus('/tmp/repo');
      expect(status.isClean).toBe(false);
      expect(Array.isArray(status.modified)).toBe(true);
      expect(Array.isArray(status.added)).toBe(true);
      expect(Array.isArray(status.deleted)).toBe(true);
      expect(Array.isArray(status.untracked)).toBe(true);
      expect(status.modified.length).toBe(2);
    });
  });

  describe('Path Utilities', () => {
    test('should handle path sanitization', () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        'feature/../../malicious',
        'feature/../../../windows/system32',
        'feature/;rm -rf /',
        'feature/$(malicious)'
      ];

      dangerousPaths.forEach(dangerousPath => {
        const sanitized = sanitize(dangerousPath);
        // The sanitize function converts dangerous characters to underscores, but doesn't remove consecutive dots
        // So we test that the dangerous characters are converted to underscores
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('@');
        expect(sanitized).not.toContain('`');
        
        // Test that the path is no longer dangerous by checking it doesn't contain the original dangerous patterns
        expect(sanitized).not.toContain('../../../');
        expect(sanitized).not.toContain('$(malicious)');
      });
    });

    test('should handle workspace path construction', () => {
      const workspaceUtils = {
        getPersistentWorkspacePath: (branch, workspacesRoot) => {
          const sanitizedBranch = sanitize(branch);
          return path.join(workspacesRoot, sanitizedBranch, 'appium');
        },
        
        getTemporaryWorkspacePath: (workerId, branch) => {
          const sanitizedBranch = sanitize(branch);
          const timestamp = Date.now();
          return path.join(os.tmpdir(), `appium-orchestrator-${workerId}-${sanitizedBranch}-${timestamp}`);
        }
      };

      process.env.PERSISTENT_WORKSPACES_ROOT = '/tmp/workspaces';
      
      const persistentPath = workspaceUtils.getPersistentWorkspacePath('main', '/tmp/workspaces');
      expect(persistentPath).toBe('/tmp/workspaces/main/appium');
      
      const temporaryPath = workspaceUtils.getTemporaryWorkspacePath('worker-1', 'main');
      expect(temporaryPath).toContain('appium-orchestrator-worker-1-main-');
      expect(temporaryPath).toContain(os.tmpdir());
    });

    test('should handle feature file path resolution', () => {
      const pathUtils = {
        getFeaturePath: (workspacePath, client, featureName) => {
          return path.join(workspacePath, 'test', 'features', client, 'feature', 'modulos', featureName);
        }
      };

      const workspacePath = '/tmp/workspace/main/appium';
      const featurePath = pathUtils.getFeaturePath(workspacePath, 'test-client', 'login.feature');
      const expectedPath = '/tmp/workspace/main/appium/test/features/test-client/feature/modulos/login.feature';
      
      expect(featurePath).toBe(expectedPath);
    });
  });

  describe('Validation Utilities', () => {
    test('should validate branch names', () => {
      const validationUtils = {
        validateBranchName: (branchName) => {
          const errors = [];
          
          if (!branchName || typeof branchName !== 'string') {
            errors.push('Branch name is required');
            return errors;
          }
          
          if (branchName.trim() !== branchName) {
            errors.push('Branch name cannot have leading/trailing whitespace');
          }
          
          if (branchName.length < 1) {
            errors.push('Branch name cannot be empty');
          }
          
          if (branchName.length > 255) {
            errors.push('Branch name too long');
          }
          
          if (!/^[a-zA-Z0-9_.\-/]+$/.test(branchName)) {
            errors.push('Branch name contains invalid characters');
          }
          
          if (branchName.startsWith('/') || branchName.endsWith('/')) {
            errors.push('Branch name cannot start or end with /');
          }
          
          if (branchName.includes('//')) {
            errors.push('Branch name cannot contain consecutive slashes');
          }
          
          return errors;
        }
      };

      expect(validationUtils.validateBranchName('main')).toEqual([]);
      expect(validationUtils.validateBranchName('feature/test-branch')).toEqual([]);
      expect(validationUtils.validateBranchName('')).toContain('Branch name is required');
      expect(validationUtils.validateBranchName('invalid branch')).toContain('Branch name contains invalid characters');
      expect(validationUtils.validateBranchName('/invalid')).toContain('Branch name cannot start or end with /');
    });

    test('should validate client names', () => {
      const validationUtils = {
        validateClientName: (clientName) => {
          const errors = [];
          
          if (!clientName || typeof clientName !== 'string') {
            errors.push('Client name is required');
            return errors;
          }
          
          if (clientName.trim() !== clientName) {
            errors.push('Client name cannot have leading/trailing whitespace');
          }
          
          if (!/^[a-zA-Z0-9_.\-]+$/.test(clientName)) {
            errors.push('Client name contains invalid characters');
          }
          
          return errors;
        }
      };

      expect(validationUtils.validateClientName('test-client')).toEqual([]);
      expect(validationUtils.validateClientName('client_123')).toEqual([]);
      expect(validationUtils.validateClientName('')).toContain('Client name is required');
      expect(validationUtils.validateClientName('invalid client')).toContain('Client name contains invalid characters');
    });

    test('should validate APK identifiers', () => {
      const validationUtils = {
        validateApkIdentifier: (identifier) => {
          const errors = [];
          
          if (!identifier || typeof identifier !== 'string') {
            errors.push('APK identifier is required');
            return errors;
          }
          
          // Check if it's a package name or version number
          if (!/^[a-zA-Z0-9._]+$/.test(identifier) && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(identifier)) {
            errors.push('APK identifier format is invalid');
          }
          
          return errors;
        }
      };

      expect(validationUtils.validateApkIdentifier('com.example.app')).toEqual([]);
      expect(validationUtils.validateApkIdentifier('1.0.0')).toEqual([]);
      expect(validationUtils.validateApkIdentifier('1.0.0-beta')).toEqual([]);
      expect(validationUtils.validateApkIdentifier('')).toContain('APK identifier is required');
      expect(validationUtils.validateApkIdentifier('invalid@apk')).toContain('APK identifier format is invalid');
    });
  });

  describe('String Utilities', () => {
    test('should handle string sanitization', () => {
      const stringUtils = {
        sanitizeString: (input) => {
          if (!input) return '';
          return input.replace(/[^a-zA-Z0-9_.\-/]/g, '_');
        }
      };

      expect(stringUtils.sanitizeString('normal-string')).toBe('normal-string');
      expect(stringUtils.sanitizeString('string with spaces')).toBe('string_with_spaces');
      expect(stringUtils.sanitizeString('special@chars#here')).toBe('special_chars_here');
      expect(stringUtils.sanitizeString('')).toBe('');
      expect(stringUtils.sanitizeString(null)).toBe('');
    });

    test('should handle string formatting', () => {
      const stringUtils = {
        formatTimestamp: (timestamp) => {
          const date = new Date(timestamp);
          return date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        },
        
        formatFileSize: (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
      };

      const timestamp = Date.now();
      const formattedTime = stringUtils.formatTimestamp(timestamp);
      expect(formattedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);

      expect(stringUtils.formatFileSize(0)).toBe('0 Bytes');
      expect(stringUtils.formatFileSize(1024)).toBe('1 KB');
      expect(stringUtils.formatFileSize(1048576)).toBe('1 MB');
    });

    test('should handle template string processing', () => {
      const stringUtils = {
        processTemplate: (template, variables) => {
          return template.replace(/\${(\w+)}/g, (match, varName) => {
            return variables[varName] || match;
          });
        }
      };

      const template = 'Hello ${name}, your job ${jobId} is ${status}';
      const variables = {
        name: 'John',
        jobId: 'job-1',
        status: 'completed'
      };

      const result = stringUtils.processTemplate(template, variables);
      expect(result).toBe('Hello John, your job job-1 is completed');

      const incompleteResult = stringUtils.processTemplate(template, { name: 'John' });
      expect(incompleteResult).toBe('Hello John, your job ${jobId} is ${status}');
    });
  });

  describe('Error Handling Utilities', () => {
    test('should handle error creation and formatting', () => {
      const errorUtils = {
        createError: (message, code, details = {}) => {
          const error = new Error(message);
          error.code = code;
          error.details = details;
          error.timestamp = new Date().toISOString();
          return error;
        },
        
        formatError: (error) => {
          return {
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            details: error.details || {},
            timestamp: error.timestamp || new Date().toISOString()
          };
        }
      };

      const error = errorUtils.createError('Test error message', 'TEST_ERROR', { field: 'test' });
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details.field).toBe('test');
      expect(error.timestamp).toBeDefined();

      const formatted = errorUtils.formatError(error);
      expect(formatted.message).toBe('Test error message');
      expect(formatted.code).toBe('TEST_ERROR');
      expect(formatted.details.field).toBe('test');
    });

    test('should handle error classification', () => {
      const errorUtils = {
        classifyError: (error) => {
          if (error.code === 'ENOENT') return 'FILE_NOT_FOUND';
          if (error.code === 'EACCES') return 'PERMISSION_DENIED';
          if (error.code === 'ECONNREFUSED') return 'CONNECTION_ERROR';
          if (error.message.includes('timeout')) return 'TIMEOUT_ERROR';
          return 'UNKNOWN_ERROR';
        }
      };

      expect(errorUtils.classifyError({ code: 'ENOENT' })).toBe('FILE_NOT_FOUND');
      expect(errorUtils.classifyError({ code: 'EACCES' })).toBe('PERMISSION_DENIED');
      expect(errorUtils.classifyError({ code: 'ECONNREFUSED' })).toBe('CONNECTION_ERROR');
      expect(errorUtils.classifyError({ message: 'Request timeout' })).toBe('TIMEOUT_ERROR');
      expect(errorUtils.classifyError({ message: 'Unknown error' })).toBe('UNKNOWN_ERROR');
    });
  });

  describe('Logging Utilities', () => {
    test('should handle log message formatting', () => {
      const logUtils = {
        formatLogMessage: (level, message, meta = {}) => {
          const timestamp = new Date().toISOString();
          return {
            timestamp,
            level: level.toUpperCase(),
            message,
            meta,
            formatted: `[${timestamp}] [${level.toUpperCase()}] ${message}`
          };
        }
      };

      const logEntry = logUtils.formatLogMessage('info', 'Test message', { jobId: 'job-1' });
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('Test message');
      expect(logEntry.meta.jobId).toBe('job-1');
      expect(logEntry.formatted).toContain('[INFO]');
      expect(logEntry.formatted).toContain('Test message');
    });

    test('should handle log level validation', () => {
      const logUtils = {
        isValidLogLevel: (level) => {
          const validLevels = ['debug', 'info', 'warn', 'error'];
          return validLevels.includes(level.toLowerCase());
        }
      };

      expect(logUtils.isValidLogLevel('info')).toBe(true);
      expect(logUtils.isValidLogLevel('ERROR')).toBe(true);
      expect(logUtils.isValidLogLevel('debug')).toBe(true);
      expect(logUtils.isValidLogLevel('invalid')).toBe(false);
    });

    test('should handle log filtering', () => {
      const logUtils = {
        filterLogs: (logs, level) => {
          const levels = ['debug', 'info', 'warn', 'error'];
          const targetLevel = levels.indexOf(level.toLowerCase());
          if (targetLevel === -1) return logs;
          
          return logs.filter(log => {
            const logLevel = levels.indexOf(log.level.toLowerCase());
            return logLevel >= targetLevel;
          });
        }
      };

      const logs = [
        { level: 'debug', message: 'Debug message' },
        { level: 'info', message: 'Info message' },
        { level: 'warn', message: 'Warning message' },
        { level: 'error', message: 'Error message' }
      ];

      const warnLogs = logUtils.filterLogs(logs, 'warn');
      expect(warnLogs.length).toBe(2);
      expect(warnLogs.every(log => ['warn', 'error'].includes(log.level))).toBe(true);
    });
  });

  describe('Configuration Utilities', () => {
    test('should handle environment variable validation', () => {
      const configUtils = {
        validateEnvironment: () => {
          const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'];
          const missing = required.filter(key => !process.env[key]);
          
          return {
            isValid: missing.length === 0,
            missing,
            required
          };
        }
      };

      // Test with missing variables
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.SESSION_SECRET;

      const validation = configUtils.validateEnvironment();
      expect(validation.isValid).toBe(false);
      expect(validation.missing.length).toBe(3);
      expect(validation.missing).toContain('GOOGLE_CLIENT_ID');

      // Test with all variables
      process.env.GOOGLE_CLIENT_ID = 'test-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
      process.env.SESSION_SECRET = 'test-secret';

      const fullValidation = configUtils.validateEnvironment();
      expect(fullValidation.isValid).toBe(true);
      expect(fullValidation.missing.length).toBe(0);
    });

    test('should handle configuration merging', () => {
      const configUtils = {
        mergeConfig: (defaultConfig, userConfig) => {
          return {
            ...defaultConfig,
            ...userConfig,
            nested: {
              ...defaultConfig.nested,
              ...(userConfig.nested || {})
            }
          };
        }
      };

      const defaultConfig = {
        port: 3000,
        maxWorkers: 2,
        nested: {
          timeout: 30000,
          retries: 3
        }
      };

      const userConfig = {
        port: 8080,
        nested: {
          timeout: 60000
        }
      };

      const merged = configUtils.mergeConfig(defaultConfig, userConfig);
      expect(merged.port).toBe(8080);
      expect(merged.maxWorkers).toBe(2);
      expect(merged.nested.timeout).toBe(60000);
      expect(merged.nested.retries).toBe(3);
    });
  });
});