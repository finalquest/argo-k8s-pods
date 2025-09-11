// Job Queue Manager Module
// Handles job queue operations, job lifecycle management, and job assignment

class JobQueueManager {
  constructor() {
    this.workerPoolManager = null; // Will be set by server after initialization
    this.jobQueue = [];
    this.jobIdCounter = 0;
    this.io = null; // Will be set by server
  }

  /**
   * Initialize the job queue manager with socket.io
   */
  initialize(io) {
    this.io = io;
  }

  /**
   * Add a job to the queue
   */
  addJob(job) {
    const jobId = ++this.jobIdCounter;
    const fullJob = {
      ...job,
      id: jobId,
      createdAt: new Date().toISOString(),
      status: 'queued',
    };

    this.jobQueue.push(fullJob);
    console.log(`Job ${jobId} agregado a la cola para feature: ${job.feature}`);
    this.processQueue();
    return jobId;
  }

  /**
   * Process the job queue
   */
  processQueue() {
    if (this.jobQueue.length === 0) {
      this.checkIdleAndCleanup();
      return;
    }

    console.log(`Procesando cola con ${this.jobQueue.length} trabajos...`);

    const jobsToProcess = this.jobQueue.length;
    for (let i = 0; i < jobsToProcess; i++) {
      const job = this.jobQueue.shift();
      const assigned = this.assignJobToWorker(job);
      if (!assigned) {
        this.jobQueue.push(job);
      }
    }
    this.workerPoolManager.broadcastStatus();
  }

  /**
   * Assign a job to a suitable worker
   */
  assignJobToWorker(job) {
    // Find a suitable worker
    const worker = this.workerPoolManager.findSuitableWorker(job);

    if (worker) {
      this.workerPoolManager.runJobOnWorker(job, worker);
      return true;
    }

    // If no suitable worker found and we can create a new one
    if (
      this.workerPoolManager.getWorkers().length <
      this.workerPoolManager.maxWorkers
    ) {
      const apkSourceType = job.localApk ? 'local' : 'registry';
      const apkIdentifier =
        job.localApk || job.apkVersion || process.env.APK_PATH;

      const newWorker = this.workerPoolManager.createWorker(
        job.branch,
        job.client,
        apkIdentifier,
        apkSourceType,
        job.deviceSerial,
        job.persistentWorkspace,
      );
      this.workerPoolManager.runJobOnWorker(job, newWorker);
      return true;
    }

    return false;
  }

  /**
   * Requeue a job (add to front of queue)
   */
  requeueJob(job) {
    console.log(`Re-encolando job ${job.id}...`);
    this.jobQueue.unshift(job);
  }

  /**
   * Remove a job from the queue
   */
  removeJob(jobId) {
    const index = this.jobQueue.findIndex((job) => job.id === jobId);
    if (index !== -1) {
      const job = this.jobQueue.splice(index, 1)[0];
      console.log(`Job ${jobId} eliminado de la cola`);
      return job;
    }
    return null;
  }

  /**
   * Get all jobs in the queue
   */
  getQueuedJobs() {
    return this.jobQueue;
  }

  /**
   * Get job by ID
   */
  getJobById(jobId) {
    return this.jobQueue.find((job) => job.id === jobId);
  }

  /**
   * Check if queue is empty and cleanup idle workers
   */
  checkIdleAndCleanup() {
    const isQueueEmpty = this.jobQueue.length === 0;

    if (isQueueEmpty) {
      this.io.emit('log_update', {
        logLine: `--- 🧹 Cola vacía. Generando reportes finales para workers inactivos... ---
`,
      });
      this.workerPoolManager.generateReportsForIdleWorkers();
    }
  }

  /**
   * Clear the job queue
   */
  clearQueue() {
    const jobsCleared = this.jobQueue.length;
    this.jobQueue = [];
    console.log(`Cola limpiada. ${jobsCleared} trabajos eliminados.`);
    return jobsCleared;
  }

  /**
   * Get queue statistics
   */
  getStatistics() {
    return {
      totalJobs: this.jobQueue.length,
      jobIdCounter: this.jobIdCounter,
      averageWaitTime: this.calculateAverageWaitTime(),
      oldestJob: this.jobQueue.length > 0 ? this.jobQueue[0] : null,
      newestJob:
        this.jobQueue.length > 0
          ? this.jobQueue[this.jobQueue.length - 1]
          : null,
    };
  }

  /**
   * Calculate average wait time for jobs in queue
   */
  calculateAverageWaitTime() {
    if (this.jobQueue.length === 0) return 0;

    const now = Date.now();
    const totalWaitTime = this.jobQueue.reduce((sum, job) => {
      const createdAt = new Date(job.createdAt).getTime();
      return sum + (now - createdAt);
    }, 0);

    return totalWaitTime / this.jobQueue.length;
  }

  /**
   * Get job status by ID
   */
  getJobStatus(jobId) {
    // Check if job is in queue
    const queuedJob = this.getJobById(jobId);
    if (queuedJob) {
      return {
        id: jobId,
        status: 'queued',
        position: this.jobQueue.findIndex((job) => job.id === jobId) + 1,
        job: queuedJob,
      };
    }

    // Check if job is running on a worker
    const workers = this.workerPoolManager.getWorkers();
    const workerWithJob = workers.find(
      (w) => w.currentJob && w.currentJob.id === jobId,
    );
    if (workerWithJob) {
      return {
        id: jobId,
        status: 'running',
        workerId: workerWithJob.id,
        slotId: workerWithJob.id,
        job: workerWithJob.currentJob,
      };
    }

    return {
      id: jobId,
      status: 'not_found',
    };
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId) {
    // Try to remove from queue first
    const removedJob = this.removeJob(jobId);
    if (removedJob) {
      console.log(`Job ${jobId} cancelado y eliminado de la cola`);
      return { success: true, status: 'cancelled_from_queue' };
    }

    // Check if job is running on a worker
    const workers = this.workerPoolManager.getWorkers();
    const workerWithJob = workers.find(
      (w) => w.currentJob && w.currentJob.id === jobId,
    );
    if (workerWithJob) {
      // Mark job for cancellation
      workerWithJob.currentJob.cancelled = true;
      // Send cancellation signal to worker
      workerWithJob.process.send({ type: 'CANCEL_JOB', jobId });
      console.log(
        `Señal de cancelación enviada para job ${jobId} en worker ${workerWithJob.id}`,
      );
      return { success: true, status: 'cancellation_sent' };
    }

    return { success: false, error: 'Job not found' };
  }

  /**
   * Prioritize a job (move to front of queue)
   */
  prioritizeJob(jobId) {
    const jobIndex = this.jobQueue.findIndex((job) => job.id === jobId);
    if (jobIndex === -1) {
      return { success: false, error: 'Job not found in queue' };
    }

    const job = this.jobQueue.splice(jobIndex, 1)[0];
    this.jobQueue.unshift(job);
    console.log(`Job ${jobId} prioritizado y movido al frente de la cola`);

    this.processQueue();
    return { success: true, job };
  }

  /**
   * Get jobs by branch
   */
  getJobsByBranch(branch) {
    return this.jobQueue.filter((job) => job.branch === branch);
  }

  /**
   * Get jobs by client
   */
  getJobsByClient(client) {
    return this.jobQueue.filter((job) => job.client === client);
  }

  /**
   * Get jobs by status (queued jobs are always 'queued')
   */
  getJobsByStatus(status) {
    if (status === 'queued') {
      return this.jobQueue;
    }
    return [];
  }
}

module.exports = JobQueueManager;
