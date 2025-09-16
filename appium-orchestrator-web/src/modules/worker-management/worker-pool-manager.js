// Worker Pool Manager Module
// Handles worker pool operations, worker lifecycle management, and worker monitoring

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class WorkerPoolManager {
  constructor(
    configManager,
    validationManager,
    processManager,
    jobQueueManager,
  ) {
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.processManager = processManager;
    this.jobQueueManager = jobQueueManager;
    this.workerPool = [];
    this.maxWorkers = configManager.get('MAX_PARALLEL_TESTS');
    this.io = null; // Will be set by server
    this.workspaceManager = null; // Will be set by server
  }

  /**
   * Initialize the worker pool manager with socket.io and workspace manager
   */
  initialize(io, workspaceManager) {
    this.io = io;
    this.workspaceManager = workspaceManager;
  }

  /**
   * Create a new worker
   */
  createWorker(branch, client, apkIdentifier, apkSourceType, deviceSerial, quickTest = false) {
    const workerId =
      this.workerPool.length > 0
        ? Math.max(...this.workerPool.map((w) => w.id)) + 1
        : 0;

    const forkOptions = {};
    // When running in local mode INSIDE Docker, we need to tell the worker
    // where to find the host's ADB server. 'host.docker.internal' is a special
    // Docker DNS that resolves to the host's IP.
    if (process.env.DEVICE_SOURCE === 'local' && process.env.IS_DOCKER) {
      console.log(
        `[WORKER POOL] Docker local mode detected. Injecting ANDROID_ADB_SERVER_HOST=host.docker.internal for worker ${workerId}`,
      );
      forkOptions.env = {
        ...process.env,
        ANDROID_ADB_SERVER_HOST: 'host.docker.internal',
      };
    }

    const workerProcess = fork(
      path.join(__dirname, '..', '..', '..', 'worker.js'),
      [],
      forkOptions,
    );

    const worker = {
      id: workerId,
      process: workerProcess,
      branch: branch,
      client: client,
      apkIdentifier: apkIdentifier,
      apkSourceType: apkSourceType,
      deviceSerial: deviceSerial,
      status: 'initializing',
      currentJob: null,
      terminating: false,
      quickTest: quickTest,
    };

    this.workerPool.push(worker);
    let logMessage = `Worker ${worker.id} creado para la branch ${branch}, cliente ${client}, APK: ${apkIdentifier} (source: ${apkSourceType})`;
    if (deviceSerial) {
      logMessage += `, Dispositivo: ${deviceSerial}`;
    }
    console.log(logMessage);

    // Determine workspace path based on persistent workspace configuration
    const sanitizedBranch = this.validationManager.sanitize(branch);
    let workerWorkspacePath;
    let isPersistent = false;

    // Check if persistent workspace exists for this branch (regardless of checkbox)
    if (process.env.PERSISTENT_WORKSPACES_ROOT) {
      const persistentWorkspacePath = path.join(
        process.env.PERSISTENT_WORKSPACES_ROOT,
        sanitizedBranch,
      );

      if (fs.existsSync(persistentWorkspacePath)) {
        // Use persistent workspace automatically if it exists
        workerWorkspacePath = persistentWorkspacePath;
        isPersistent = true;
        console.log(
          `[WORKER POOL] Usando workspace persistente existente para worker ${workerId}: ${workerWorkspacePath}`,
        );
      } else {
        // Use temporary workspace if persistent doesn't exist
        workerWorkspacePath = path.join(
          os.tmpdir(),
          `appium-orchestrator-${workerId}-${sanitizedBranch}-${Date.now()}`,
        );
        isPersistent = false;
        console.log(
          `[WORKER POOL] Workspace persistente no encontrado para branch ${sanitizedBranch}, usando temporal: ${workerWorkspacePath}`,
        );
      }
    } else {
      // Use temporary workspace if PERSISTENT_WORKSPACES_ROOT not configured
      workerWorkspacePath = path.join(
        os.tmpdir(),
        `appium-orchestrator-${workerId}-${sanitizedBranch}-${Date.now()}`,
      );
      isPersistent = false;
      console.log(
        `[WORKER POOL] PERSISTENT_WORKSPACES_ROOT no configurado, usando workspace temporal: ${workerWorkspacePath}`,
      );
    }

    // Only create directory if using temporary workspace (persistent workspace should already exist)
    if (!isPersistent) {
      fs.mkdirSync(workerWorkspacePath, { recursive: true });
    }
    const initMessage = {
      type: 'INIT',
      branch,
      client,
      workerWorkspacePath,
      isPersistent,
      quickTest,
    };

    if (apkSourceType === 'local') {
      initMessage.localApkPath = path.join(
        process.env.LOCAL_APK_DIRECTORY,
        apkIdentifier,
      );
    } else {
      initMessage.apkVersion = apkIdentifier;
    }

    // If it's a worker for a local device, send the serial in the INIT message
    if (process.env.DEVICE_SOURCE === 'local') {
      initMessage.deviceSerial = deviceSerial;
    }

    worker.process.send(initMessage);

    this.setupWorkerEventHandlers(worker);
    return worker;
  }

  /**
   * Set up event handlers for a worker
   */
  setupWorkerEventHandlers(worker) {
    const slotId = worker.id;

    worker.process.on('message', async (message) => {
      const currentJob = worker.currentJob;

      switch (message.type) {
        case 'READY':
          console.log(`Worker ${worker.id} reportó READY.`);
          worker.status = 'ready';

          if (worker.currentJob) {
            try {
              if (worker.currentJob.record) {
                await this.processManager.startRecordingSequence(
                  worker.currentJob,
                  worker,
                );
              }
              console.log(
                `Worker ${worker.id} está listo, iniciando job ${worker.currentJob.id}.`,
              );
              worker.status = 'busy';
              worker.process.send({ type: 'START', job: worker.currentJob });
            } catch {
              // Handle recording sequence error
            }
          } else {
            this.jobQueueManager.processQueue();
          }
          this.broadcastStatus();
          break;

        case 'READY_FOR_NEXT_JOB': {
          console.log(`Worker ${worker.id} reportó READY_FOR_NEXT_JOB.`);

          if (currentJob && currentJob.record) {
            try {
              console.log(
                `Finalizando secuencia de grabación para el job ${currentJob.id}`,
              );
              this.io.emit('log_update', {
                slotId,
                logLine: `--- ⏹ Deteniendo grabación para ${currentJob.feature}... ---
`,
              });
              const featureName = path.basename(currentJob.feature, '.feature');
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
              if (!response.ok) throw new Error(`Status ${response.status}`);
              const result = await response.json();
              this.io.emit('log_update', {
                slotId,
                logLine: `--- 💾 Mappings guardados en ${result.summary.filesCreated > 1 ? 'directorio' : 'archivo'} ${featureName}.json (${result.summary.totalMappings} mappings) ---
`,
              });
            } catch (error) {
              console.error(
                `Error al detener la grabación para el job ${currentJob.id}:`,
                error,
              );
              this.io.emit('log_update', {
                slotId,
                logLine: `--- ❌ Error al guardar los mappings para ${currentJob.feature}: ${error.message} ---
`,
              });
            }
          }

          worker.status = 'ready';

          let reportUrl = null;
          if (message.data && message.data.reportPath) {
            reportUrl = this.processManager.handleReport(
              currentJob,
              message.data.reportPath,
            );
          }

          worker.currentJob = null;
          this.io.emit('job_finished', {
            slotId,
            jobId: currentJob.id,
            exitCode: message.data?.exitCode ?? 0,
            reportUrl: reportUrl,
          });
          this.broadcastStatus();
          this.jobQueueManager.processQueue();
          break;
        }

        case 'UNIFIED_REPORT_READY':
          console.log(`Worker ${worker.id} reportó UNIFIED_REPORT_READY.`);
          if (message.data && message.data.reportPath) {
            const syntheticJob = {
              branch: worker.branch,
              feature: `_ReporteUnificado_ ${worker.client}`,
              client: worker.client,
            };
            this.processManager.handleReport(
              syntheticJob,
              message.data.reportPath,
            );
          }
          worker.process.send({ type: 'TERMINATE' });
          break;

        case 'LOG':
          this.io.emit('log_update', { slotId, logLine: message.data });
          break;

        case 'PROGRESS_UPDATE':
          this.io.emit('progress_update', {
            slotId,
            jobId: currentJob ? currentJob.id : null,
            event: message.event,
            data: message.data,
            timestamp: message.timestamp,
          });
          break;
      }
    });

    worker.process.on('close', async (code) => {
      console.log(`Worker ${worker.id} se cerró con código ${code}.`);
      const index = this.workerPool.findIndex((w) => w.id === worker.id);
      if (index !== -1) {
        this.workerPool.splice(index, 1);
      }

      const { currentJob } = worker;
      if (worker.status === 'busy' && currentJob && !worker.terminating) {
        this.io.emit('log_update', {
          logLine: `--- ⚠️ Worker murió inesperadamente. Re-encolando job ${currentJob.id}... ---
`,
        });
        this.io.emit('job_finished', {
          slotId: worker.id,
          jobId: currentJob.id,
          exitCode: code,
        });
        this.jobQueueManager.requeueJob(currentJob);
      }

      this.broadcastStatus();
      this.jobQueueManager.processQueue();
    });

    worker.process.on('error', (err) => {
      console.error(`Error irrecuperable en el worker ${worker.id}:`, err);
    });
  }

  /**
   * Run a job on a worker
   */
  async runJobOnWorker(job, worker) {
    const wasReady = worker.status === 'ready';
    worker.status = 'busy';
    worker.currentJob = job;
    job.slotId = worker.id;

    this.io.emit('job_started', {
      slotId: worker.id,
      featureName: job.feature,
      jobId: job.id,
      branch: worker.branch,
    });

    if (wasReady) {
      try {
        if (job.record) {
          await this.processManager.startRecordingSequence(job, worker);
        }
        console.log(
          `Enviando job ${job.id} a worker ${worker.id} que ya estaba listo.`,
        );
        worker.process.send({ type: 'START', job });
      } catch {
        // Handle recording sequence error
      }
    }

    this.broadcastStatus();
  }

  /**
   * Find a suitable worker for a job
   */
  findSuitableWorker(job) {
    const apkSourceType = job.localApk ? 'local' : 'registry';
    const apkIdentifier =
      job.localApk || job.apkVersion || process.env.APK_PATH;

    // For local workers, deviceSerial is a search criterion
    const isLocal = process.env.DEVICE_SOURCE === 'local';

    return this.workerPool.find((w) => {
      const baseMatch =
        w.branch === job.branch &&
        w.client === job.client &&
        w.apkIdentifier === apkIdentifier &&
        w.apkSourceType === apkSourceType &&
        w.status === 'ready';
      if (!baseMatch) return false;
      // If local, device serial must also match
      if (isLocal) {
        return w.deviceSerial === job.deviceSerial;
      }
      return true;
    });
  }

  /**
   * Get all workers in the pool
   */
  getWorkers() {
    return this.workerPool;
  }

  /**
   * Get worker by ID
   */
  getWorkerById(workerId) {
    return this.workerPool.find((w) => w.id === workerId);
  }

  /**
   * Terminate a worker
   */
  terminateWorker(workerId) {
    const worker = this.getWorkerById(workerId);
    if (worker) {
      worker.terminating = true;
      worker.process.send({ type: 'TERMINATE' });
    }
  }

  /**
   * Generate unified reports for idle workers
   */
  generateReportsForIdleWorkers() {
    const idleWorkers = this.workerPool.filter((w) => w.status === 'ready');

    idleWorkers.forEach((worker) => {
      if (!worker.terminating) {
        worker.terminating = true;
        worker.process.send({ type: 'GENERATE_UNIFIED_REPORT' });
      }
    });
  }

  /**
   * Broadcast worker pool status
   */
  broadcastStatus() {
    if (!this.io) return;

    const slots = this.workerPool.map((worker) => ({
      slotId: worker.id,
      job: worker.currentJob
        ? { id: worker.currentJob.id, featureName: worker.currentJob.feature }
        : null,
      status: worker.status,
      branch: worker.branch,
      client: worker.client,
      apkIdentifier: worker.apkIdentifier,
      apkSourceType: worker.apkSourceType,
    }));
    this.io.emit('worker_pool_update', slots);
  }

  /**
   * Get worker pool statistics
   */
  getStatistics() {
    const totalWorkers = this.workerPool.length;
    const busyWorkers = this.workerPool.filter(
      (w) => w.status === 'busy',
    ).length;
    const readyWorkers = this.workerPool.filter(
      (w) => w.status === 'ready',
    ).length;
    const initializingWorkers = this.workerPool.filter(
      (w) => w.status === 'initializing',
    ).length;

    return {
      totalWorkers,
      busyWorkers,
      readyWorkers,
      initializingWorkers,
      maxWorkers: this.maxWorkers,
      utilization: totalWorkers > 0 ? (busyWorkers / totalWorkers) * 100 : 0,
    };
  }

  /**
   * Clean up all workers
   */
  async cleanup() {
    const terminationPromises = this.workerPool.map((worker) => {
      return new Promise((resolve) => {
        worker.terminating = true;
        worker.process.send({ type: 'TERMINATE' });
        worker.process.on('close', () => resolve());
        // Force kill after timeout
        setTimeout(() => {
          if (!worker.process.killed) {
            worker.process.kill('SIGKILL');
            resolve();
          }
        }, 5000);
      });
    });

    await Promise.all(terminationPromises);
    this.workerPool = [];
  }
}

module.exports = WorkerPoolManager;
