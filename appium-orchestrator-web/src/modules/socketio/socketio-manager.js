// Socket.io Manager Module
// Handles real-time communication, event handling, and client connections

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class SocketIOManager {
  constructor(
    authenticationManager,
    workerPoolManager,
    jobQueueManager,
    configManager,
    validationManager,
  ) {
    this.authenticationManager = authenticationManager;
    this.workerPoolManager = workerPoolManager;
    this.jobQueueManager = jobQueueManager;
    this.configManager = configManager;
    this.validationManager = validationManager;
    this.io = null;
    this.connectedClients = new Set();
  }

  /**
   * Initialize Socket.io manager with server
   */
  initialize(server, sessionMiddleware, passport) {
    const { Server } = require('socket.io');
    const wrap = (middleware) => (socket, next) =>
      middleware(socket.request, {}, next);

    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
      },
    });

    // Apply session middleware (always needed for socket sessions)
    this.io.use(wrap(sessionMiddleware));

    // Apply authentication middleware only if authentication is enabled
    if (this.authenticationManager.isAuthenticationEnabled()) {
      this.io.use(wrap(passport.initialize()));
      this.io.use(wrap(passport.session()));

      // Custom authentication middleware
      this.io.use((socket, next) => {
        if (socket.request.user) {
          next();
        } else {
          console.log('Rechazando conexión de socket no autenticada.');
          next(new Error('unauthorized'));
        }
      });
    } else {
      // Development mode - allow all connections
      console.log('🔓 Socket.io en modo desarrollo - sin autenticación');
      this.io.use((socket, next) => {
        // Attach development user to socket request
        socket.request.user = this.configManager.getDevelopmentUser();
        next();
      });
    }

    this.setupEventHandlers();
    console.log('Socket.io manager initialized');
  }

  /**
   * Set up Socket.io event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Un cliente se ha conectado:', socket.id);
      this.connectedClients.add(socket.id);

      // Send initial status to client
      this.sendInitialStatus(socket);

      // Handle client events
      this.handleRunTest(socket);
      this.handleRunBatch(socket);
      this.handleStopTest(socket);
      this.handleCancelJob(socket);
      this.handleStopAllExecution(socket);
      this.handlePrepareWorkspace(socket);
      this.handleCommitChanges(socket);
      this.handlePushChanges(socket);

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('Un cliente se ha desconectado:', socket.id);
        this.connectedClients.delete(socket.id);
      });
    });
  }

  /**
   * Send initial status to connected client
   */
  sendInitialStatus(socket) {
    socket.emit('init', {
      slots: this.workerPoolManager.getWorkers().map((worker) => ({
        slotId: worker.id,
        job: worker.currentJob
          ? { id: worker.currentJob.id, featureName: worker.currentJob.feature }
          : null,
        status: worker.status,
        branch: worker.branch,
        client: worker.client,
        apkIdentifier: worker.apkIdentifier,
        apkSourceType: worker.apkSourceType,
        quickTest: worker.quickTest,
      })),
      status: {
        active: this.workerPoolManager.getStatistics().busyWorkers,
        queued: this.jobQueueManager.getStatistics().totalJobs,
        limit: this.workerPoolManager.getStatistics().maxWorkers,
      },
    });

    this.broadcastQueueStatus();
  }

  /**
   * Handle run_test event
   */
  handleRunTest(socket) {
    socket.on('run_test', (data) => {
      console.log('--- DEBUG: Datos recibidos en run_test ---', data);
      const { persistentWorkspace } = data;

      if (data.record) {
        // Record & Verify logic
        this.handleRecordAndVerify(socket, data, persistentWorkspace);
      } else {
        // Normal test logic
        this.handleNormalTest(socket, data, persistentWorkspace);
      }
    });
  }

  /**
   * Handle record and verify workflow
   */
  handleRecordAndVerify(socket, data, persistentWorkspace) {
    const recordJob = {
      ...data,
      record: true,
      persistentWorkspace,
    };
    const verifyJob = {
      ...data,
      record: false,
      highPriority: true,
      mappingToLoad: `${data.feature}.json`,
      persistentWorkspace,
    };

    if (recordJob.highPriority) {
      this.jobQueueManager.addJob(verifyJob);
      this.jobQueueManager.addJob(recordJob);
      this.emitLogUpdate({
        logLine: `--- ⚡️ Test de grabación y verificación para '${data.feature}' añadido a la cola con prioridad alta. ---
`,
      });
    } else {
      this.jobQueueManager.addJob(recordJob);
      this.jobQueueManager.addJob(verifyJob);
      this.emitLogUpdate({
        logLine: `--- 📼 Petición de grabación y verificación para '${data.feature}' encolada. ---
`,
      });
    }
  }

  /**
   * Handle normal test execution
   */
  handleNormalTest(socket, data, persistentWorkspace) {
    const job = {
      ...data,
      persistentWorkspace,
    };
    this.jobQueueManager.addJob(job);
    this.emitLogUpdate({
      logLine: `--- 📋 Petición de ejecución para '${data.feature}' encolada. ---
`,
    });
  }

  /**
   * Handle run_batch event
   */
  handleRunBatch(socket) {
    socket.on('run_batch', (data) => {
      console.log('--- DEBUG: Datos recibidos en run_batch ---', data);
      const { features, ...commonJobProps } = data;
      const { persistentWorkspace } = data;
      let count = 0;

      features.forEach((feature) => {
        const job = {
          ...commonJobProps,
          feature,
          persistentWorkspace,
        };
        this.jobQueueManager.addJob(job);
        count++;
      });

      this.emitLogUpdate({
        logLine: `--- 📦 ${count} Tests agregados a la cola para ejecución batch. ---
`,
      });
      this.broadcastQueueStatus();
    });
  }

  /**
   * Handle stop_test event
   */
  handleStopTest(socket) {
    socket.on('stop_test', (data) => {
      console.log('--- DEBUG: Datos recibidos en stop_test ---', data);
      const worker = this.workerPoolManager.getWorkerById(data.slotId);

      if (worker) {
        this.emitLogUpdate({
          logLine: `--- 🛑 Deteniendo ejecución en slot ${data.slotId}... ---
`,
        });
        worker.terminating = true;
        worker.process.send({ type: 'TERMINATE' });
        socket.emit('execution_stopped', { slotId: data.slotId });
      } else {
        this.emitLogUpdate({
          logLine: `--- ⚠️ No se encontró worker en slot ${data.slotId}. ---
`,
        });
      }
    });
  }

  /**
   * Handle cancel_job event
   */
  handleCancelJob(socket) {
    socket.on('cancel_job', (data) => {
      console.log('--- DEBUG: Datos recibidos en cancel_job ---', data);
      const result = this.jobQueueManager.cancelJob(data.jobId);

      if (result.success) {
        this.emitLogUpdate({
          logLine: `--- ❌ Job ${data.jobId} cancelado. ---
`,
        });
        socket.emit('job_cancelled', result);
      } else {
        this.emitLogUpdate({
          logLine: `--- ⚠️ No se pudo cancelar job ${data.jobId}: ${result.error}. ---
`,
        });
        socket.emit('job_cancel_failed', result);
      }
    });
  }

  /**
   * Handle stop_all_execution event
   */
  handleStopAllExecution(socket) {
    socket.on('stop_all_execution', () => {
      console.log('--- DEBUG: Deteniendo todas las ejecuciones ---');
      this.emitLogUpdate({
        logLine: `--- 🛑 Deteniendo todas las ejecuciones... ---
`,
      });

      this.workerPoolManager.getWorkers().forEach((worker) => {
        if (worker.status === 'busy' && !worker.terminating) {
          worker.terminating = true;
          worker.process.send({ type: 'TERMINATE' });
        }
      });

      const clearedJobs = this.jobQueueManager.clearQueue();
      this.emitLogUpdate({
        logLine: `--- 🧹 Se han limpiado ${clearedJobs} trabajos en cola. ---
`,
      });
      this.broadcastQueueStatus();
      socket.emit('all_execution_stopped');
    });
  }

  /**
   * Handle prepare_workspace event
   */
  handlePrepareWorkspace(socket) {
    socket.on('prepare_workspace', (data) => {
      const { branch } = data;
      const logPrefix = `[Workspace Prep: ${branch}]`;
      const logSlot = { slotId: 'system' }; // Use system log panel

      if (!this.configManager.isEnabled('persistentWorkspaces')) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} ❌ Error: La función de workspaces persistentes no está habilitada en el servidor.\n`,
        });
        return;
      }

      if (!branch) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} ❌ Error: No se ha especificado una branch.\n`,
        });
        return;
      }

      // Limpiar el panel de sistema antes de empezar
      this.io.emit('log_clear', logSlot);
      this.emitLogUpdate({
        ...logSlot,
        logLine: `--- 🚀 Iniciando preparación del workspace para la branch: ${branch} ---\n`,
      });

      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = path.join(
        this.configManager.get('PERSISTENT_WORKSPACES_ROOT'),
        sanitizedBranch,
      );

      // Create parent directory if it doesn't exist
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }

      const setupScript = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'scripts',
        'setup-workspace.sh',
      );
      const scriptProcess = spawn('bash', [setupScript, workspacePath, branch]);

      scriptProcess.stdout.on('data', (data) => {
        this.emitLogUpdate({ ...logSlot, logLine: data.toString() });
      });

      scriptProcess.stderr.on('data', (data) => {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `[stderr] ${data.toString()}`,
        });
      });

      scriptProcess.on('close', (code) => {
        if (code === 0) {
          this.emitLogUpdate({
            ...logSlot,
            logLine: `\n--- ✅ Workspace preparado exitosamente para la branch: ${branch} ---\n`,
          });
          socket.emit('workspace_ready', { branch });
        } else {
          this.emitLogUpdate({
            ...logSlot,
            logLine: `\n--- ❌ Error durante la preparación del workspace. Código de salida: ${code} ---\n`,
          });
          socket.emit('workspace_error', {
            error: `Workspace preparation failed with exit code ${code}`,
          });
        }
      });

      scriptProcess.on('error', (err) => {
        console.error('Error al ejecutar el script de workspace:', err);
        this.emitLogUpdate({
          ...logSlot,
          logLine: `\n--- ❌ Error al ejecutar el script: ${err.message} ---\n`,
        });
        socket.emit('workspace_error', { error: err.message });
      });
    });
  }

  /**
   * Handle commit_changes event
   */
  handleCommitChanges(socket) {
    socket.on('commit_changes', async (data) => {
      const { branch, files, message } = data;
      const logPrefix = `[Git Commit: ${branch}]`;
      const logSlot = { slotId: 'system' }; // Use system log panel

      if (!this.configManager.isEnabled('persistentWorkspaces')) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} ❌ Error: La función de workspaces persistentes no está habilitada.\n`,
        });
        return;
      }

      if (!branch || !files || files.length === 0 || !message) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} ❌ Error: Faltan datos para realizar el commit (branch, archivos o mensaje).\n`,
        });
        return;
      }

      this.emitLogUpdate({
        ...logSlot,
        logLine: `--- 🚀 Iniciando commit local para la branch: ${branch} ---\n`,
      });

      const sanitizedBranch = this.validationManager.sanitize(branch);
      const workspacePath = this.configManager.get(
        'PERSISTENT_WORKSPACES_ROOT',
      );
      const appiumWorkspacePath = require('path').join(
        workspacePath,
        sanitizedBranch,
        'appium',
      );

      if (!require('fs').existsSync(appiumWorkspacePath)) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} ❌ Error: No se encontró el workspace local.\n`,
        });
        return;
      }

      // --- Validación de Seguridad de Archivos ---
      for (const file of files) {
        const fullPath = require('path').join(appiumWorkspacePath, file);
        const resolvedPath = require('path').resolve(fullPath);
        if (
          !resolvedPath.startsWith(require('path').resolve(appiumWorkspacePath))
        ) {
          this.emitLogUpdate({
            ...logSlot,
            logLine: `${logPrefix} ❌ Error de seguridad: Se intentó acceder a un archivo fuera del workspace: ${file}\n`,
          });
          return;
        }
      }

      const executeGitCommand = (command, args) => {
        return new Promise((resolve, reject) => {
          const { spawn } = require('child_process');
          const gitProcess = spawn(command, args, { cwd: appiumWorkspacePath });

          gitProcess.stdout.on('data', (data) => {
            this.emitLogUpdate({ ...logSlot, logLine: data.toString() });
          });

          gitProcess.stderr.on('data', (data) => {
            this.emitLogUpdate({
              ...logSlot,
              logLine: `[stderr] ${data.toString()}`,
            });
          });

          gitProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`El comando de Git falló con código ${code}`));
            }
          });

          gitProcess.on('error', (err) => {
            reject(err);
          });
        });
      };

      try {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `${logPrefix} étape 1/3: Añadiendo archivos...
`,
        });

        // Handle both individual files and directories
        const gitAddArgs =
          files.length === 1 && files[0].endsWith('/')
            ? [files[0]] // Add directory
            : [...files]; // Add individual files

        await executeGitCommand('git', ['add', ...gitAddArgs]);

        this.emitLogUpdate({
          ...logSlot,
          logLine: `
${logPrefix} étape 2/3: Realizando commit local...
`,
        });
        await executeGitCommand('git', ['commit', '-m', message]);

        this.emitLogUpdate({
          ...logSlot,
          logLine: `
--- ✅ Commit local realizado con éxito para la branch: ${branch} ---
`,
        });

        // Notificar al frontend que hay commits pendientes de push
        this.emitCommitStatusUpdate({
          branch,
          hasPendingCommits: true,
          message:
            'Hay commits locales que no han sido subidos al repositorio remoto.',
        });

        // Notificar al frontend para que actualice el status de cambios del workspace
        this.io.emit('workspace_changes_committed', { branch });
      } catch (error) {
        this.emitLogUpdate({
          ...logSlot,
          logLine: `\n--- ❌ Error durante el commit local: ${error.message} ---\n`,
        });
      }
    });
  }

  /**
   * Handle push_changes event
   */
  handlePushChanges(socket) {
    socket.on('push_changes', async (data) => {
      console.log('--- DEBUG: Push changes ---', data);
      // This would need branch manager integration
      // For now, just emitting log updates
      this.emitLogUpdate({
        logLine: `--- 🚀 Iniciando push de cambios... ---
`,
      });
    });
  }

  /**
   * Emit log update to all connected clients
   */
  emitLogUpdate(data) {
    this.io.emit('log_update', data);
  }

  /**
   * Emit log clear to all connected clients
   */
  emitLogClear(slotId) {
    this.io.emit('log_clear', slotId);
  }

  /**
   * Emit job started event
   */
  emitJobStarted(data) {
    this.io.emit('job_started', data);
  }

  /**
   * Emit job finished event
   */
  emitJobFinished(data) {
    this.io.emit('job_finished', data);
  }

  /**
   * Emit progress update event
   */
  emitProgressUpdate(data) {
    this.io.emit('progress_update', data);
  }

  /**
   * Emit worker pool update event
   */
  emitWorkerPoolUpdate(slots) {
    this.io.emit('worker_pool_update', slots);
  }

  /**
   * Emit queue status update event
   */
  broadcastQueueStatus() {
    this.io.emit('queue_status_update', {
      active: this.workerPoolManager.getStatistics().busyWorkers,
      queued: this.jobQueueManager.getStatistics().totalJobs,
      limit: this.workerPoolManager.getStatistics().maxWorkers,
    });
  }

  /**
   * Emit commit status update event
   */
  emitCommitStatusUpdate(data) {
    this.io.emit('commit_status_update', data);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  /**
   * Get socket.io instance
   */
  getIO() {
    return this.io;
  }

  /**
   * Clean up socket.io manager
   */
  cleanup() {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
    this.connectedClients.clear();
  }
}

module.exports = SocketIOManager;
