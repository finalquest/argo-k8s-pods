// Socket.io Manager Module
// Handles real-time communication, event handling, and client connections

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
    socket.on('prepare_workspace', async (data) => {
      console.log('--- DEBUG: Preparando workspace ---', data);
      const { branch } = data;

      try {
        this.emitLogUpdate({
          logLine: `--- 🔧 Preparando workspace para branch '${branch}'... ---
`,
        });

        // This would need workspace manager integration
        // For now, simulating workspace preparation
        setTimeout(() => {
          this.emitLogUpdate({
            logLine: `--- ✅ Workspace preparado para branch '${branch}'. ---
`,
          });
          socket.emit('workspace_ready', { branch });
        }, 2000);
      } catch (error) {
        this.emitLogUpdate({
          logLine: `--- ❌ Error preparando workspace: ${error.message} ---
`,
        });
        socket.emit('workspace_error', { error: error.message });
      }
    });
  }

  /**
   * Handle commit_changes event
   */
  handleCommitChanges(socket) {
    socket.on('commit_changes', async (data) => {
      console.log('--- DEBUG: Commit changes ---', data);
      // This would need branch manager integration
      // For now, just emitting log updates
      this.emitLogUpdate({
        logLine: `--- 📝 Iniciando commit de cambios... ---
`,
      });
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
