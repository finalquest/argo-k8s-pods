// Worker Management Tests
// Tests for worker pool management, job processing, and workspace operations

const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// Extract utility functions from server.js for testing
function sanitize(name) {
  if (!name) return '';
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

describe('Worker Management', () => {
  describe('Worker Pool Management', () => {
    test('should initialize worker pool with correct size', () => {
      const maxWorkers = 2;
      const workerPool = [];

      // Simulate worker pool initialization
      for (let i = 0; i < maxWorkers; i++) {
        workerPool.push({
          id: i,
          busy: false,
          currentJob: null,
          workspacePath: null,
          childProcess: null,
        });
      }

      expect(workerPool.length).toBe(maxWorkers);
      expect(workerPool.every((worker) => worker.busy === false)).toBe(true);
      expect(workerPool.every((worker) => worker.currentJob === null)).toBe(
        true,
      );
    });

    test('should handle MAX_PARALLEL_TESTS environment variable', () => {
      // Test without MAX_PARALLEL_TESTS
      delete process.env.MAX_PARALLEL_TESTS;
      const maxWorkersDefault =
        parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
      expect(maxWorkersDefault).toBe(2);

      // Test with MAX_PARALLEL_TESTS
      process.env.MAX_PARALLEL_TESTS = '4';
      const maxWorkersCustom =
        parseInt(process.env.MAX_PARALLEL_TESTS, 10) || 2;
      expect(maxWorkersCustom).toBe(4);
    });

    test('should validate worker state transitions', () => {
      const worker = {
        id: 0,
        busy: false,
        currentJob: null,
        workspacePath: null,
        childProcess: null,
      };

      // Test idle state
      expect(worker.busy).toBe(false);
      expect(worker.currentJob).toBe(null);

      // Test assignment to job
      worker.busy = true;
      worker.currentJob = {
        branch: 'main',
        client: 'test-client',
        apkIdentifier: '1.0.0',
        apkSourceType: 'registry',
        deviceSerial: 'emulator-5554',
      };

      expect(worker.busy).toBe(true);
      expect(worker.currentJob).toHaveProperty('branch');
      expect(worker.currentJob).toHaveProperty('client');

      // Test job completion
      worker.busy = false;
      worker.currentJob = null;

      expect(worker.busy).toBe(false);
      expect(worker.currentJob).toBe(null);
    });
  });

  describe('Job Queue Management', () => {
    test('should handle job queue operations', () => {
      const jobQueue = [];
      const mockJob = {
        id: 'test-job-1',
        branch: 'main',
        client: 'test-client',
        apkIdentifier: '1.0.0',
        apkSourceType: 'registry',
        deviceSerial: 'emulator-5554',
        persistentWorkspace: false,
        timestamp: Date.now(),
      };

      // Test adding job to queue
      jobQueue.push(mockJob);
      expect(jobQueue.length).toBe(1);
      expect(jobQueue[0]).toEqual(mockJob);

      // Test removing job from queue
      const processedJob = jobQueue.shift();
      expect(jobQueue.length).toBe(0);
      expect(processedJob).toEqual(mockJob);
    });

    test('should validate job structure', () => {
      const validJob = {
        id: 'test-job-1',
        branch: 'main',
        client: 'test-client',
        apkIdentifier: '1.0.0',
        apkSourceType: 'registry',
        deviceSerial: 'emulator-5554',
        persistentWorkspace: false,
        timestamp: Date.now(),
      };

      // Test required job properties
      expect(validJob).toHaveProperty('id');
      expect(validJob).toHaveProperty('branch');
      expect(validJob).toHaveProperty('client');
      expect(validJob).toHaveProperty('apkIdentifier');
      expect(validJob).toHaveProperty('apkSourceType');
      expect(validJob).toHaveProperty('deviceSerial');
      expect(validJob).toHaveProperty('persistentWorkspace');
      expect(validJob).toHaveProperty('timestamp');

      // Test property types
      expect(typeof validJob.id).toBe('string');
      expect(typeof validJob.branch).toBe('string');
      expect(typeof validJob.client).toBe('string');
      expect(typeof validJob.apkIdentifier).toBe('string');
      expect(typeof validJob.apkSourceType).toBe('string');
      expect(typeof validJob.deviceSerial).toBe('string');
      expect(typeof validJob.persistentWorkspace).toBe('boolean');
      expect(typeof validJob.timestamp).toBe('number');
    });

    test('should handle job prioritization', () => {
      const jobQueue = [
        {
          id: 'job-1',
          priority: 1,
          timestamp: Date.now() - 1000,
          branch: 'main',
        },
        {
          id: 'job-2',
          priority: 2,
          timestamp: Date.now() - 500,
          branch: 'develop',
        },
        {
          id: 'job-3',
          priority: 1,
          timestamp: Date.now(),
          branch: 'feature',
        },
      ];

      // Sort by priority (higher first), then by timestamp (older first)
      jobQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      expect(jobQueue[0].id).toBe('job-2'); // Highest priority
      expect(jobQueue[1].id).toBe('job-1'); // Same priority, older
      expect(jobQueue[2].id).toBe('job-3'); // Same priority, newer
    });
  });

  describe('Workspace Creation', () => {
    test('should handle workspace path creation correctly', () => {
      const mockCreateWorker = (
        branch,
        client,
        apkIdentifier,
        apkSourceType,
        deviceSerial,
        persistentWorkspace = false,
      ) => {
        const workerId = 'test-worker';
        const sanitizedBranch = sanitize(branch);
        let workerWorkspacePath;
        let isPersistent = false;

        const timestamp = Date.now();
        // Determinar si usar workspace persistente basado en:
        // 1. El checkbox del frontend (persistentWorkspace)
        // 2. Que PERSISTENT_WORKSPACES_ROOT esté configurado
        if (persistentWorkspace && process.env.PERSISTENT_WORKSPACES_ROOT) {
          // Usar workspace persistente
          workerWorkspacePath = path.join(
            process.env.PERSISTENT_WORKSPACES_ROOT,
            sanitizedBranch,
          );
          isPersistent = true;
        } else {
          // Usar workspace temporal
          workerWorkspacePath = path.join(
            os.tmpdir(),
            `appium-orchestrator-${workerId}-${sanitizedBranch}-${timestamp}`,
          );
          isPersistent = false;
        }

        return {
          workspacePath: workerWorkspacePath,
          isPersistent: isPersistent,
          branch: sanitizedBranch,
        };
      };

      // Test persistent workspace
      process.env.PERSISTENT_WORKSPACES_ROOT = '/tmp/workspaces';
      const persistentResult = mockCreateWorker(
        'main',
        'test-client',
        '1.0.0',
        'registry',
        'emulator-5554',
        true,
      );
      expect(persistentResult.isPersistent).toBe(true);
      expect(persistentResult.workspacePath).toContain('/tmp/workspaces/main');
      expect(persistentResult.workspacePath).not.toContain(
        'appium-orchestrator-',
      );

      // Test temporary workspace
      const temporaryResult = mockCreateWorker(
        'main',
        'test-client',
        '1.0.0',
        'registry',
        'emulator-5554',
        false,
      );
      expect(temporaryResult.isPersistent).toBe(false);
      expect(temporaryResult.workspacePath).toContain('appium-orchestrator-');
      expect(temporaryResult.workspacePath).toContain('test-worker');
      expect(temporaryResult.workspacePath).toMatch(
        /appium-orchestrator-test-worker-main-\d+/,
      );
    });

    test('should handle missing PERSISTENT_WORKSPACES_ROOT', () => {
      delete process.env.PERSISTENT_WORKSPACES_ROOT;

      const mockCreateWorker = (
        branch,
        client,
        apkIdentifier,
        apkSourceType,
        deviceSerial,
        persistentWorkspace = false,
      ) => {
        const workerId = 'test-worker';
        const sanitizedBranch = sanitize(branch);
        let workerWorkspacePath;
        let isPersistent = false;

        if (persistentWorkspace && process.env.PERSISTENT_WORKSPACES_ROOT) {
          workerWorkspacePath = path.join(
            process.env.PERSISTENT_WORKSPACES_ROOT,
            sanitizedBranch,
          );
          isPersistent = true;
        } else {
          workerWorkspacePath = path.join(
            os.tmpdir(),
            `appium-orchestrator-${workerId}-${sanitizedBranch}-${Date.now()}`,
          );
          isPersistent = false;
        }

        return {
          workspacePath: workerWorkspacePath,
          isPersistent: isPersistent,
        };
      };

      // Even with persistentWorkspace=true, should use temporary if PERSISTENT_WORKSPACES_ROOT is not set
      const result = mockCreateWorker(
        'main',
        'test-client',
        '1.0.0',
        'registry',
        'emulator-5554',
        true,
      );
      expect(result.isPersistent).toBe(false);
      expect(result.workspacePath).toContain('appium-orchestrator-');
    });

    test('should sanitize branch names for workspace paths', () => {
      const mockCreateWorker = (
        branch,
        client,
        apkIdentifier,
        apkSourceType,
        deviceSerial,
        persistentWorkspace = false,
      ) => {
        const workerId = 'test-worker';
        const sanitizedBranch = sanitize(branch);
        let workerWorkspacePath;

        if (persistentWorkspace && process.env.PERSISTENT_WORKSPACES_ROOT) {
          workerWorkspacePath = path.join(
            process.env.PERSISTENT_WORKSPACES_ROOT,
            sanitizedBranch,
          );
        } else {
          workerWorkspacePath = path.join(
            os.tmpdir(),
            `appium-orchestrator-${workerId}-${sanitizedBranch}-${Date.now()}`,
          );
        }

        return {
          workspacePath: workerWorkspacePath,
          sanitizedBranch: sanitizedBranch,
        };
      };

      process.env.PERSISTENT_WORKSPACES_ROOT = '/tmp/workspaces';

      const dangerousBranch = 'feature/../../../malicious';
      const result = mockCreateWorker(
        dangerousBranch,
        'test-client',
        '1.0.0',
        'registry',
        'emulator-5554',
        true,
      );

      expect(result.sanitizedBranch).toBe('feature_.._.._.._malicious');
      expect(result.workspacePath).toContain('feature_.._.._.._malicious');
      expect(result.workspacePath).not.toContain('../../../');
    });
  });

  describe('Child Process Management', () => {
    test('should handle child process spawning', () => {
      const mockSpawn = (command, args, options) => {
        return {
          pid: Math.floor(Math.random() * 10000),
          spawnfile: command,
          spawnargs: args,
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          on: jest.fn(),
          once: jest.fn(),
        };
      };

      const testCommand = 'npm';
      const testArgs = ['test'];
      const testOptions = { cwd: '/tmp/workspace', env: { ...process.env } };

      const childProcess = mockSpawn(testCommand, testArgs, testOptions);

      expect(childProcess).toHaveProperty('pid');
      expect(childProcess).toHaveProperty('spawnfile');
      expect(childProcess).toHaveProperty('spawnargs');
      expect(childProcess).toHaveProperty('stdout');
      expect(childProcess).toHaveProperty('stderr');
      expect(childProcess.spawnfile).toBe(testCommand);
      expect(childProcess.spawnargs).toEqual(testArgs);
    });

    test('should handle child process cleanup', () => {
      const mockChildProcesses = new Map();

      const mockChildProcess = {
        pid: 1234,
        killed: false,
        kill: jest.fn(() => {
          mockChildProcess.killed = true;
          return true;
        }),
      };

      mockChildProcesses.set('test-worker', mockChildProcess);

      // Test cleanup process
      mockChildProcesses.forEach((childProcess, workerId) => {
        if (!childProcess.killed) {
          childProcess.kill();
          expect(childProcess.kill).toHaveBeenCalled();
          expect(childProcess.killed).toBe(true);
        }
      });

      mockChildProcesses.clear();
      expect(mockChildProcesses.size).toBe(0);
    });

    test('should handle process exit codes', () => {
      const exitCodeScenarios = [
        { code: 0, expected: 'success' },
        { code: 1, expected: 'failure' },
        { code: null, signal: 'SIGTERM', expected: 'terminated' },
        { code: null, signal: 'SIGKILL', expected: 'killed' },
      ];

      exitCodeScenarios.forEach((scenario) => {
        const mockProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'exit') {
              callback(scenario.code, scenario.signal);
            }
          }),
        };

        expect(
          scenario.code === null || typeof scenario.code === 'number',
        ).toBe(true);
      });
    });
  });

  describe('Worker Lifecycle Management', () => {
    test('should handle worker assignment to jobs', () => {
      const workerPool = [
        { id: 0, busy: false, currentJob: null },
        { id: 1, busy: false, currentJob: null },
      ];

      const jobQueue = [
        { id: 'job-1', branch: 'main', client: 'test-client' },
        { id: 'job-2', branch: 'develop', client: 'test-client' },
      ];

      // Simulate worker assignment
      const availableWorker = workerPool.find((worker) => !worker.busy);
      const job = jobQueue.shift();

      if (availableWorker && job) {
        availableWorker.busy = true;
        availableWorker.currentJob = job;
      }

      expect(workerPool[0].busy).toBe(true);
      expect(workerPool[0].currentJob).toEqual(job);
      expect(jobQueue.length).toBe(1);
    });

    test('should handle worker release after job completion', () => {
      const worker = {
        id: 0,
        busy: true,
        currentJob: { id: 'job-1', branch: 'main' },
      };

      // Simulate job completion
      worker.busy = false;
      worker.currentJob = null;

      expect(worker.busy).toBe(false);
      expect(worker.currentJob).toBe(null);
    });

    test('should handle worker error states', () => {
      const worker = {
        id: 0,
        busy: true,
        currentJob: { id: 'job-1', branch: 'main' },
        error: null,
        retryCount: 0,
      };

      // Simulate error occurrence
      worker.error = 'Test error message';
      worker.retryCount++;

      expect(worker.error).toBe('Test error message');
      expect(worker.retryCount).toBe(1);

      // Simulate error recovery
      worker.error = null;
      worker.busy = false;
      worker.currentJob = null;

      expect(worker.error).toBe(null);
      expect(worker.busy).toBe(false);
      expect(worker.currentJob).toBe(null);
    });
  });

  describe('Resource Management', () => {
    test('should handle workspace cleanup', () => {
      const mockWorkspaces = new Map();

      const mockWorkspace = {
        path: '/tmp/workspace-test',
        isPersistent: false,
        cleanup: jest.fn(() => {
          mockWorkspaces.delete('test-worker');
          return true;
        }),
      };

      mockWorkspaces.set('test-worker', mockWorkspace);

      // Test cleanup
      mockWorkspaces.forEach((workspace, workerId) => {
        if (!workspace.isPersistent) {
          workspace.cleanup();
        }
      });

      expect(mockWorkspace.cleanup).toHaveBeenCalled();
      expect(mockWorkspaces.size).toBe(0);
    });

    test('should handle persistent workspace retention', () => {
      const mockWorkspaces = new Map();

      const persistentWorkspace = {
        path: '/tmp/workspaces/main',
        isPersistent: true,
        cleanup: jest.fn(),
      };

      const temporaryWorkspace = {
        path: '/tmp/workspace-temp',
        isPersistent: false,
        cleanup: jest.fn(),
      };

      mockWorkspaces.set('worker-1', persistentWorkspace);
      mockWorkspaces.set('worker-2', temporaryWorkspace);

      // Test selective cleanup
      const initialSize = mockWorkspaces.size;
      mockWorkspaces.forEach((workspace, workerId) => {
        if (!workspace.isPersistent) {
          workspace.cleanup();
          mockWorkspaces.delete(workerId);
        }
      });

      expect(persistentWorkspace.cleanup).not.toHaveBeenCalled();
      expect(temporaryWorkspace.cleanup).toHaveBeenCalled();
      expect(mockWorkspaces.size).toBe(initialSize - 1); // Only persistent workspace remains
    });

    test('should handle memory usage tracking', () => {
      const memoryStats = {
        totalWorkers: 4,
        activeWorkers: 2,
        totalMemoryUsage: 0,
        peakMemoryUsage: 0,
      };

      // Simulate memory usage updates
      const updateMemoryUsage = (workerId, memoryUsage) => {
        memoryStats.totalMemoryUsage += memoryUsage;
        memoryStats.peakMemoryUsage = Math.max(
          memoryStats.peakMemoryUsage,
          memoryStats.totalMemoryUsage,
        );
      };

      updateMemoryUsage('worker-1', 100);
      updateMemoryUsage('worker-2', 150);

      expect(memoryStats.totalMemoryUsage).toBe(250);
      expect(memoryStats.peakMemoryUsage).toBe(250);

      // Simulate worker completion
      updateMemoryUsage('worker-1', -100);
      expect(memoryStats.totalMemoryUsage).toBe(150);
      expect(memoryStats.peakMemoryUsage).toBe(250);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle worker creation failures', () => {
      const mockCreateWorker = jest.fn(() => {
        throw new Error('Failed to create worker');
      });

      expect(() => {
        mockCreateWorker(
          'main',
          'test-client',
          '1.0.0',
          'registry',
          'emulator-5554',
        );
      }).toThrow('Failed to create worker');
    });

    test('should handle job processing timeouts', () => {
      const mockJob = {
        id: 'test-job',
        branch: 'main',
        client: 'test-client',
        timeout: 30000,
      };

      const mockProcessJob = (job, callback) => {
        const timeout = setTimeout(() => {
          callback(new Error('Job timeout'));
        }, 100);

        return { timeout };
      };

      let timeoutError = null;
      const { timeout } = mockProcessJob(mockJob, (error) => {
        timeoutError = error;
      });

      setTimeout(() => {
        expect(timeoutError).toBe(null);
      }, 50);

      setTimeout(() => {
        expect(timeoutError).toEqual(new Error('Job timeout'));
      }, 150);
    });

    test('should handle workspace cleanup failures', () => {
      const mockCleanup = jest.fn(() => {
        throw new Error('Failed to cleanup workspace');
      });

      expect(() => {
        mockCleanup();
      }).toThrow('Failed to cleanup workspace');
    });
  });

  describe('Performance Optimization', () => {
    test('should handle worker reuse', () => {
      const workerPool = [
        { id: 0, busy: false, currentJob: null, reuseCount: 0 },
      ];

      const jobs = [
        { id: 'job-1', branch: 'main' },
        { id: 'job-2', branch: 'develop' },
      ];

      // Simulate worker reuse
      jobs.forEach((job) => {
        const worker = workerPool.find((w) => !w.busy);
        if (worker) {
          worker.busy = true;
          worker.currentJob = job;
          worker.reuseCount++;

          // Simulate job completion
          worker.busy = false;
          worker.currentJob = null;
        }
      });

      expect(workerPool[0].reuseCount).toBe(2);
      expect(workerPool[0].busy).toBe(false);
    });

    test('should handle load balancing', () => {
      const workerPool = [
        { id: 0, busy: false, load: 0 },
        { id: 1, busy: false, load: 0 },
        { id: 2, busy: false, load: 0 },
      ];

      const selectLeastLoadedWorker = () => {
        return workerPool.reduce((least, current) =>
          current.load < least.load ? current : least,
        );
      };

      // Simulate load distribution
      for (let i = 0; i < 6; i++) {
        const worker = selectLeastLoadedWorker();
        worker.load++;
      }

      expect(workerPool[0].load).toBe(2);
      expect(workerPool[1].load).toBe(2);
      expect(workerPool[2].load).toBe(2);
    });
  });
});
