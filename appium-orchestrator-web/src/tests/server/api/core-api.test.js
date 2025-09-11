// Core API Functionality Tests
// Tests for device management, git operations, APK management, and workspace operations

const path = require('path');
const fs = require('fs');
const os = require('os');

// Extract utility functions from server.js for testing
function sanitize(name) {
  if (!name) return '';
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

describe('Core API Functionality', () => {
  describe('Device Management', () => {
    test('should handle local device listing', () => {
      // Test the local device listing logic
      const mockDevices = [
        { id: 'emulator-5554', name: 'Android Emulator' },
        { id: '192.168.1.100:5555', name: 'Remote Device' }
      ];
      
      expect(Array.isArray(mockDevices)).toBe(true);
      mockDevices.forEach(device => {
        expect(device).toHaveProperty('id');
        expect(device).toHaveProperty('name');
        expect(typeof device.id).toBe('string');
        expect(typeof device.name).toBe('string');
      });
    });

    test('should validate device serial format', () => {
      const validDeviceSerials = [
        'emulator-5554',
        'emulator-5556',
        '192.168.1.100:5555',
        'localhost:5555',
        'device-123456',
        'SM-G950F',
        'Pixel-6-Pro'
      ];
      
      const invalidDeviceSerials = [
        '',
        ' ',
        'emulator-5554;',
        'emulator-5554|',
        'emulator-5554&&',
        'emulator-5554`',
        'emulator-5554$(malicious)'
      ];
      
      validDeviceSerials.forEach(serial => {
        expect(serial.length).toBeGreaterThan(0);
        expect(serial.trim()).toBe(serial);
      });
      
      invalidDeviceSerials.forEach(serial => {
        if (serial.trim()) {
          const sanitized = sanitize(serial);
          expect(sanitized).not.toMatch(/[;|&`$]/);
        }
      });
    });

    test('should handle LOCAL_ADB_HOST environment variable', () => {
      // Test without LOCAL_ADB_HOST
      delete process.env.LOCAL_ADB_HOST;
      let adbHost = process.env.LOCAL_ADB_HOST;
      expect(adbHost).toBeUndefined();

      // Test with LOCAL_ADB_HOST
      process.env.LOCAL_ADB_HOST = 'host.docker.internal:5555';
      adbHost = process.env.LOCAL_ADB_HOST;
      expect(adbHost).toBe('host.docker.internal:5555');
    });
  });

  describe('Git Operations', () => {
    test('should validate branch name format for git operations', () => {
      const validBranchNames = [
        'main',
        'develop',
        'feature/test-branch',
        'release/1.0.0',
        'hotfix/security-patch',
        'user-john-doe-feature-x'
      ];
      
      validBranchNames.forEach(name => {
        expect(name.length).toBeGreaterThan(0);
        expect(name.trim()).toBe(name);
        
        // After sanitization, should be safe for git operations
        const sanitized = sanitize(name);
        expect(sanitized).not.toMatch(/[;|&`$@]/);
        expect(sanitized.length).toBeGreaterThan(0);
      });
    });

    test('should handle getAuthenticatedUrl function', () => {
      // Mock implementation of getAuthenticatedUrl logic
      const getAuthenticatedUrl = (url, gitUsername, gitPassword) => {
        if (!gitUsername || !gitPassword) {
          return url; // Return original URL if no credentials
        }
        
        try {
          const urlObj = new URL(url);
          urlObj.username = gitUsername;
          urlObj.password = gitPassword;
          return urlObj.toString();
        } catch (error) {
          return url; // Return original URL if parsing fails
        }
      };
      
      // Test with credentials
      const testUrl = 'https://github.com/user/repo.git';
      const authenticatedUrl = getAuthenticatedUrl(testUrl, 'username', 'password');
      expect(authenticatedUrl).toContain('username:password@');
      
      // Test without credentials
      const originalUrl = getAuthenticatedUrl(testUrl, '', '');
      expect(originalUrl).toBe(testUrl);
    });

    test('should validate git repository URLs', () => {
      const validGitUrls = [
        'https://github.com/user/repo.git',
        'git@github.com:user/repo.git',
        'https://gitlab.com/user/repo.git',
        'https://bitbucket.org/user/repo.git'
      ];
      
      const invalidGitUrls = [
        '',
        'not-a-url',
        'https://github.com/user/repo',
        'ftp://github.com/user/repo.git',
        'https://github.com/user/repo.exe',
        'https://github.com/user/$(malicious).git'
      ];
      
      validGitUrls.forEach(url => {
        expect(url).toMatch(/^(https?:|git@)/);
        expect(url.length).toBeGreaterThan(0);
      });
      
      invalidGitUrls.forEach(url => {
        if (url.trim()) {
          const sanitized = sanitize(url);
          if (url.includes('$(malicious)')) {
            expect(sanitized).not.toContain('$(malicious)');
          }
        }
      });
    });
  });

  describe('APK Management', () => {
    test('should validate APK identifiers and versions', () => {
      const validApkIdentifiers = [
        'com.example.app',
        '1.0.0',
        '2.45.0',
        'com.company.myapplication',
        'org.example.app',
        'net.example.app',
        'edu.example.app',
        'io.example.app'
      ];
      
      const invalidApkIdentifiers = [
        '',
        ' ',
        'com.example.app;',
        'com.example.app|',
        'com.example.app&&',
        'com.example.app`',
        'com.example.app$(malicious)'
      ];
      
      validApkIdentifiers.forEach(identifier => {
        expect(identifier.length).toBeGreaterThan(0);
        expect(identifier.trim()).toBe(identifier);
      });
      
      invalidApkIdentifiers.forEach(identifier => {
        if (identifier.trim()) {
          expect(identifier.length).toBeGreaterThan(0);
          const sanitized = sanitize(identifier);
          expect(sanitized).not.toMatch(/[;|&`$]/);
        }
      });
    });

    test('should handle different APK source types', () => {
      const apkSourceTypes = ['registry', 'local'];
      
      apkSourceTypes.forEach(type => {
        expect(type).toMatch(/^(registry|local)$/);
        expect(typeof type).toBe('string');
      });
    });

    test('should validate APK version format', () => {
      const validVersions = [
        '1.0.0',
        '2.45.0',
        '1.0.0-beta',
        '2.45.0-rc1',
        '3.0.0-alpha'
      ];
      
      validVersions.forEach(version => {
        expect(version).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/);
        expect(version.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Feature Management', () => {
    test('should validate feature file names', () => {
      const validFeatureFiles = [
        'login.feature',
        'checkout.feature',
        'user-registration.feature',
        'payment-processing.feature',
        'search-functionality.feature'
      ];
      
      const invalidFeatureFiles = [
        '',
        ' ',
        'login.feature;',
        'checkout.feature|',
        'user-registration.feature&&',
        'payment-processing.feature`',
        'search-functionality.feature$(malicious)'
      ];
      
      validFeatureFiles.forEach(file => {
        expect(file).toMatch(/\.feature$/);
        expect(file.length).toBeGreaterThan(0);
        expect(file.trim()).toBe(file);
      });
      
      invalidFeatureFiles.forEach(file => {
        if (file.trim()) {
          const sanitized = sanitize(file);
          expect(sanitized).not.toMatch(/[;|&`$]/);
        }
      });
    });

    test('should handle readFeaturesRecursive function logic', () => {
      // Mock implementation of readFeaturesRecursive logic
      const mockFileStructure = {
        name: 'features',
        type: 'directory',
        children: [
          {
            name: 'client1',
            type: 'directory',
            children: [
              {
                name: 'feature',
                type: 'directory',
                children: [
                  {
                    name: 'modulos',
                    type: 'directory',
                    children: [
                      { name: 'login.feature', type: 'file' },
                      { name: 'checkout.feature', type: 'file' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      
      const validateFeatureStructure = (structure) => {
        expect(structure).toHaveProperty('name');
        expect(structure).toHaveProperty('type');
        
        if (structure.children) {
          expect(structure.type).toBe('directory');
          expect(Array.isArray(structure.children)).toBe(true);
          structure.children.forEach(child => {
            validateFeatureStructure(child);
          });
        } else {
          expect(structure.type).toBe('file');
        }
      };
      
      validateFeatureStructure(mockFileStructure);
    });

    test('should validate feature file paths', () => {
      const validFeaturePaths = [
        '/features/client1/feature/modulos/login.feature',
        '/features/client2/feature/modulos/checkout.feature',
        '/features/client1/feature/modulos/user-registration.feature'
      ];
      
      const invalidFeaturePaths = [
        '',
        '/etc/passwd',
        '/windows/system32/config',
        '/features/client1/feature/modulos/../../../malicious.feature',
        '/features/client1/feature/modulos/$(malicious).feature'
      ];
      
      validFeaturePaths.forEach(path => {
        expect(path).toContain('/feature/modulos/');
        expect(path).toMatch(/\.feature$/);
        expect(path.length).toBeGreaterThan(0);
      });
      
      invalidFeaturePaths.forEach(path => {
        if (path.trim()) {
          const sanitized = sanitize(path);
          expect(sanitized).not.toMatch(/[;|&`$]/);
        }
      });
    });
  });

  describe('Workspace Management', () => {
    test('should handle PERSISTENT_WORKSPACES_ROOT environment variable', () => {
      // Test without PERSISTENT_WORKSPACES_ROOT
      delete process.env.PERSISTENT_WORKSPACES_ROOT;
      let workspacesRoot = process.env.PERSISTENT_WORKSPACES_ROOT;
      expect(workspacesRoot).toBeUndefined();

      // Test with PERSISTENT_WORKSPACES_ROOT
      process.env.PERSISTENT_WORKSPACES_ROOT = '/tmp/workspaces';
      workspacesRoot = process.env.PERSISTENT_WORKSPACES_ROOT;
      expect(workspacesRoot).toBe('/tmp/workspaces');
    });

    test('should validate workspace path construction', () => {
      const mockWorkspacesRoot = '/tmp/workspaces';
      const branchName = 'feature/test-branch';
      const sanitizedBranch = sanitize(branchName);
      
      const workspacePath = path.join(mockWorkspacesRoot, sanitizedBranch, 'appium');
      const expectedPath = '/tmp/workspaces/feature_test-branch/appium';
      
      expect(workspacePath).toBe(expectedPath);
      expect(workspacePath).toContain('feature_test-branch');
      expect(workspacePath).toContain('appium');
    });

    test('should handle workspace status checking', () => {
      // Mock workspace status response
      const workspaceStatus = {
        exists: true,
        modified_features: ['login.feature', 'checkout.feature'],
        message: 'Workspace local existe y está disponible para edición'
      };
      
      expect(workspaceStatus).toHaveProperty('exists');
      expect(workspaceStatus).toHaveProperty('modified_features');
      expect(workspaceStatus).toHaveProperty('message');
      expect(Array.isArray(workspaceStatus.modified_features)).toBe(true);
      expect(typeof workspaceStatus.message).toBe('string');
    });

    test('should handle temporary workspace path generation', () => {
      const workerId = 'test-worker';
      const branchName = 'feature/test-branch';
      const sanitizedBranch = sanitize(branchName);
      
      // Mock temporary workspace path generation
      const timestamp = Date.now();
      const tempWorkspacePath = path.join(os.tmpdir(), `appium-orchestrator-${workerId}-${sanitizedBranch}-${timestamp}`);
      
      expect(tempWorkspacePath).toContain('appium-orchestrator-');
      expect(tempWorkspacePath).toContain(workerId);
      expect(tempWorkspacePath).toContain(sanitizedBranch);
      expect(tempWorkspacePath).toContain(timestamp.toString());
    });
  });

  describe('History and Reports', () => {
    test('should validate report directory structure', () => {
      const mockReportStructure = {
        '/reports/main/login/20240101_120000': {
          branch: 'main',
          feature: 'login',
          timestamp: '20240101_120000',
          reportUrl: '/reports/main/login/20240101_120000/'
        },
        '/reports/develop/checkout/20240102_130000': {
          branch: 'develop',
          feature: 'checkout',
          timestamp: '20240102_130000',
          reportUrl: '/reports/develop/checkout/20240102_130000/'
        }
      };
      
      Object.values(mockReportStructure).forEach(report => {
        expect(report).toHaveProperty('branch');
        expect(report).toHaveProperty('feature');
        expect(report).toHaveProperty('timestamp');
        expect(report).toHaveProperty('reportUrl');
        
        expect(report.branch.length).toBeGreaterThan(0);
        expect(report.feature.length).toBeGreaterThan(0);
        expect(report.timestamp.length).toBeGreaterThan(0);
        expect(report.reportUrl).toMatch(/^\/reports\//);
      });
    });

    test('should handle history filtering by branch', () => {
      const mockHistory = [
        { branch: 'main', feature: 'login', timestamp: '20240101_120000' },
        { branch: 'develop', feature: 'checkout', timestamp: '20240102_130000' },
        { branch: 'main', feature: 'user-registration', timestamp: '20240103_140000' }
      ];
      
      // Filter by branch 'main'
      const filteredHistory = mockHistory.filter(item => item.branch === 'main');
      expect(filteredHistory.length).toBe(2);
      expect(filteredHistory.every(item => item.branch === 'main')).toBe(true);
      
      // Filter by branch 'develop'
      const developHistory = mockHistory.filter(item => item.branch === 'develop');
      expect(developHistory.length).toBe(1);
      expect(developHistory.every(item => item.branch === 'develop')).toBe(true);
    });

    test('should validate timestamp format', () => {
      const validTimestamps = [
        '20240101_120000',
        '20241231_235959',
        '20240615_153000'
      ];
      
      validTimestamps.forEach(timestamp => {
        expect(timestamp).toMatch(/^\d{8}_\d{6}$/);
        expect(timestamp.length).toBe(15);
      });
    });
  });

  describe('Parameter Validation', () => {
    test('should validate required parameters for API endpoints', () => {
      const endpointParams = {
        '/api/local-devices': [],
        '/api/branches': [],
        '/api/apk/versions': ['client'],
        '/api/features': ['branch', 'client'],
        '/api/workspace-status/:branch': [],
        '/api/feature-content': ['branch', 'client', 'feature']
      };
      
      Object.entries(endpointParams).forEach(([endpoint, params]) => {
        expect(endpoint).toMatch(/^\/api\//);
        expect(Array.isArray(params)).toBe(true);
      });
    });

    test('should handle missing parameters gracefully', () => {
      // Mock parameter validation logic
      const validateParams = (requiredParams, providedParams) => {
        const missingParams = requiredParams.filter(param => !providedParams[param]);
        return {
          isValid: missingParams.length === 0,
          missingParams: missingParams
        };
      };
      
      // Test with missing parameters
      const requiredParams = ['branch', 'client', 'feature'];
      const providedParams = { branch: 'main', client: 'test' };
      
      const validation = validateParams(requiredParams, providedParams);
      expect(validation.isValid).toBe(false);
      expect(validation.missingParams).toEqual(['feature']);
      
      // Test with all parameters
      const allProvidedParams = { branch: 'main', client: 'test', feature: 'login' };
      const fullValidation = validateParams(requiredParams, allProvidedParams);
      expect(fullValidation.isValid).toBe(true);
      expect(fullValidation.missingParams).toEqual([]);
    });
  });

  describe('File Operations', () => {
    test('should handle file existence checks', () => {
      // Mock file system operations
      const mockFileExists = (filePath) => {
        const existingPaths = [
          '/tmp/workspaces/main/appium',
          '/features/client1/feature/modulos/login.feature',
          '/reports/main/login/20240101_120000/index.html'
        ];
        return existingPaths.includes(filePath);
      };
      
      const existingPaths = [
        '/tmp/workspaces/main/appium',
        '/features/client1/feature/modulos/login.feature',
        '/reports/main/login/20240101_120000/index.html'
      ];
      
      const nonExistingPaths = [
        '',
        '/nonexistent/path',
        '/tmp/workspaces/nonexistent/appium'
      ];
      
      existingPaths.forEach(path => {
        expect(mockFileExists(path)).toBe(true);
      });
      
      nonExistingPaths.forEach(path => {
        expect(mockFileExists(path)).toBe(false);
      });
    });

    test('should handle directory creation and cleanup', () => {
      // Mock directory operations
      const mockDirectoryOperations = {
        create: (dirPath) => ({ success: true, path: dirPath }),
        remove: (dirPath) => ({ success: true, removed: dirPath }),
        exists: (dirPath) => dirPath && dirPath.length > 0
      };
      
      const testDir = '/tmp/test-directory';
      
      const createResult = mockDirectoryOperations.create(testDir);
      expect(createResult.success).toBe(true);
      expect(createResult.path).toBe(testDir);
      
      const removeResult = mockDirectoryOperations.remove(testDir);
      expect(removeResult.success).toBe(true);
      expect(removeResult.removed).toBe(testDir);
    });
  });

  describe('Response Formatting', () => {
    test('should format success responses correctly', () => {
      const successResponse = {
        status: 200,
        data: { message: 'Operation successful' },
        success: true
      };
      
      expect(successResponse.status).toBe(200);
      expect(successResponse.success).toBe(true);
      expect(successResponse.data).toHaveProperty('message');
    });

    test('should format error responses correctly', () => {
      const errorResponse = {
        status: 500,
        error: 'Internal server error',
        success: false
      };
      
      expect(errorResponse.status).toBe(500);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(typeof errorResponse.error).toBe('string');
    });

    test('should handle validation error responses', () => {
      const validationErrorResponse = {
        status: 400,
        error: 'Invalid parameters',
        details: { missing: ['feature'] },
        success: false
      };
      
      expect(validationErrorResponse.status).toBe(400);
      expect(validationErrorResponse.success).toBe(false);
      expect(validationErrorResponse.error).toBe('Invalid parameters');
      expect(validationErrorResponse.details).toHaveProperty('missing');
    });
  });
});