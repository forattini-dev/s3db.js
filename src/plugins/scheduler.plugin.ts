import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { SchedulerError } from "./scheduler.errors.js";
import { createLogger } from '../concerns/logger.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  createResource(config: ResourceConfig): Promise<Resource>;
  resources: Record<string, Resource>;
}

interface Resource {
  name: string;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Record<string, unknown>[]>;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  behavior?: string;
  partitions?: Record<string, PartitionConfig>;
}

interface PartitionConfig {
  fields: Record<string, string>;
}

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface PluginStorage {
  acquireLock(name: string, options: LockOptions): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
}

interface Lock {
  name: string;
  workerId: string;
  acquired: number;
}

interface LockOptions {
  ttl: number;
  timeout: number;
  workerId: string;
}

type JobAction = (database: Database, context: JobContext, scheduler: SchedulerPlugin) => Promise<unknown>;

interface JobConfig {
  schedule: string;
  description?: string;
  action: JobAction;
  enabled?: boolean;
  retries?: number;
  timeout?: number;
}

interface JobData extends JobConfig {
  enabled: boolean;
  retries: number;
  timeout: number;
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  successCount: number;
  errorCount: number;
}

interface JobContext {
  jobName: string;
  executionId: string;
  scheduledTime: Date;
  database: Database;
}

interface JobStatistics {
  totalRuns: number;
  totalSuccesses: number;
  totalErrors: number;
  avgDuration: number;
  lastRun: Date | null;
  lastSuccess: Date | null;
  lastError: JobError | null;
}

interface JobError {
  time: Date;
  message: string;
}

interface JobStatus {
  name: string;
  enabled: boolean;
  schedule: string;
  description?: string;
  lastRun: Date | null;
  nextRun: Date | null;
  isRunning: boolean;
  statistics: {
    totalRuns: number;
    totalSuccesses: number;
    totalErrors: number;
    successRate: number;
    avgDuration: number;
    lastSuccess: Date | null;
    lastError: JobError | null;
  };
}

interface JobHistoryEntry {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  result: unknown;
  error: string | null;
  retryCount: number;
}

interface JobHistoryOptions {
  limit?: number;
  status?: string | null;
}

type JobStartHook = (jobName: string, context: JobContext) => void | Promise<void>;
type JobCompleteHook = (jobName: string, result: unknown, duration: number) => void | Promise<void>;
type JobErrorHook = (jobName: string, error: Error, attempt: number) => void | Promise<void>;

export interface SchedulerPluginOptions {
  timezone?: string;
  jobs?: Record<string, JobConfig>;
  defaultTimeout?: number;
  defaultRetries?: number;
  jobHistoryResource?: string;
  persistJobs?: boolean;
  onJobStart?: JobStartHook | null;
  onJobComplete?: JobCompleteHook | null;
  onJobError?: JobErrorHook | null;
  logLevel?: string;
  logger?: Logger;
}

interface SchedulerConfig {
  timezone: string;
  jobs: Record<string, JobConfig>;
  defaultTimeout: number;
  defaultRetries: number;
  jobHistoryResource: string;
  persistJobs: boolean;
  onJobStart: JobStartHook | null;
  onJobComplete: JobCompleteHook | null;
  onJobError: JobErrorHook | null;
  logLevel?: string;
}

export class SchedulerPlugin extends CoordinatorPlugin {
  declare namespace: string;
  declare logLevel: string;
  declare workerId: string;
  declare isCoordinator: boolean;

  config: SchedulerConfig;
  jobs: Map<string, JobData> = new Map();
  activeJobs: Map<string, string> = new Map();
  timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  statistics: Map<string, JobStatistics> = new Map();

  constructor(options: SchedulerPluginOptions = {}) {
    super(options as any);

    if (options.logger) {
      this.logger = options.logger as any;
    } else {
      const logLevel = (this.logLevel || 'info') as any;
      this.logger = createLogger({ name: 'SchedulerPlugin', level: logLevel });
    }

    const opts = this.options as SchedulerPluginOptions;
    const {
      timezone = 'UTC',
      jobs = {},
      defaultTimeout = 300000,
      defaultRetries = 1,
      jobHistoryResource = 'plg_job_executions',
      persistJobs = true,
      onJobStart = null,
      onJobComplete = null,
      onJobError = null,
      ...rest
    } = opts;

    this.config = {
      timezone: timezone as string,
      jobs: jobs as Record<string, JobConfig>,
      defaultTimeout: defaultTimeout as number,
      defaultRetries: defaultRetries as number,
      jobHistoryResource: jobHistoryResource as string,
      persistJobs: persistJobs as boolean,
      logLevel: this.logLevel,
      onJobStart: onJobStart as JobStartHook | null,
      onJobComplete: onJobComplete as JobCompleteHook | null,
      onJobError: onJobError as JobErrorHook | null,
      ...rest
    };

    this._validateConfiguration();
  }

  private _isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' ||
           process.env.JEST_WORKER_ID !== undefined ||
           (global as Record<string, unknown>).expect !== undefined;
  }

  private _validateConfiguration(): void {
    if (Object.keys(this.config.jobs).length === 0) {
      throw new SchedulerError('At least one job must be defined', {
        operation: 'validateConfiguration',
        jobCount: 0,
        suggestion: 'Provide at least one job in the jobs configuration: { jobs: { myJob: { schedule: "* * * * *", action: async () => {...} } } }'
      });
    }

    for (const [jobName, job] of Object.entries(this.config.jobs)) {
      if (!job.schedule) {
        throw new SchedulerError(`Job '${jobName}' must have a schedule`, {
          operation: 'validateConfiguration',
          taskId: jobName,
          providedConfig: Object.keys(job),
          suggestion: 'Add a schedule property with a valid cron expression: { schedule: "0 * * * *", action: async () => {...} }'
        });
      }

      if (!job.action || typeof job.action !== 'function') {
        throw new SchedulerError(`Job '${jobName}' must have an action function`, {
          operation: 'validateConfiguration',
          taskId: jobName,
          actionType: typeof job.action,
          suggestion: 'Provide an action function: { schedule: "...", action: async (db, ctx) => {...} }'
        });
      }

      if (!this._isValidCronExpression(job.schedule)) {
        throw new SchedulerError(`Job '${jobName}' has invalid cron expression`, {
          operation: 'validateConfiguration',
          taskId: jobName,
          cronExpression: job.schedule,
          suggestion: 'Use valid cron format (5 fields: minute hour day month weekday) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)'
        });
      }
    }
  }

  private _isValidCronExpression(expr: string): boolean {
    if (typeof expr !== 'string') return false;

    const shortcuts = ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@hourly'];
    if (shortcuts.includes(expr)) return true;

    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    return true;
  }

  override async onInstall(): Promise<void> {
    if (this.config.persistJobs) {
      await this._createJobHistoryResource();
    }

    for (const [jobName, jobConfig] of Object.entries(this.config.jobs)) {
      this.jobs.set(jobName, {
        ...jobConfig,
        enabled: jobConfig.enabled !== false,
        retries: jobConfig.retries || this.config.defaultRetries,
        timeout: jobConfig.timeout || this.config.defaultTimeout,
        lastRun: null,
        nextRun: null,
        runCount: 0,
        successCount: 0,
        errorCount: 0
      });

      this.statistics.set(jobName, {
        totalRuns: 0,
        totalSuccesses: 0,
        totalErrors: 0,
        avgDuration: 0,
        lastRun: null,
        lastSuccess: null,
        lastError: null
      });
    }

    this.emit('db:plugin:initialized', { jobs: this.jobs.size });

    await this.startCoordination();
  }

  private async _createJobHistoryResource(): Promise<void> {
    if (!this.database) return;

    const [ok] = await tryFn(() => this.database!.createResource({
      name: this.config.jobHistoryResource,
      attributes: {
        id: 'string|required',
        jobName: 'string|required',
        status: 'string|required',
        startTime: 'number|required',
        endTime: 'number',
        duration: 'number',
        result: 'json|default:null',
        error: 'string|default:null',
        retryCount: 'number|default:0',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      partitions: {
        byJob: { fields: { jobName: 'string' } },
        byDate: { fields: { createdAt: 'string|maxlength:10' } }
      }
    }));
  }

  override async onBecomeCoordinator(): Promise<void> {
    this.logger.debug(
      { workerId: this.workerId },
      'Global coordinator elected this worker as leader - starting job scheduling'
    );

    await this._startScheduling();

    this.emit('plg:scheduler:coordinator-promoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  override async onStopBeingCoordinator(): Promise<void> {
    this.logger.debug(
      { workerId: this.workerId },
      'Global coordinator demoted this worker from leader - job timers will be stopped automatically'
    );

    this.emit('plg:scheduler:coordinator-demoted', {
      workerId: this.workerId,
      timestamp: Date.now()
    });
  }

  override async coordinatorWork(): Promise<void> {
    // Scheduler uses setTimeout-based job scheduling rather than a work loop
  }

  private async _startScheduling(): Promise<void> {
    for (const [jobName, job] of this.jobs) {
      if (job.enabled) {
        this._scheduleNextExecution(jobName);
      }
    }
  }

  private _scheduleNextExecution(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job || !job.enabled) return;

    const nextRun = this._calculateNextRun(job.schedule);
    job.nextRun = nextRun;

    const delay = nextRun.getTime() - Date.now();

    if (delay > 0) {
      const timer = setTimeout(() => {
        this._executeJob(jobName);
      }, delay);

      this.timers.set(jobName, timer);

      this.logger.debug({ jobName, nextRun: nextRun.toISOString(), delayMs: delay }, `Scheduled job '${jobName}' for ${nextRun.toISOString()}`);
    }
  }

  private _calculateNextRun(schedule: string): Date {
    const now = new Date();

    if (schedule === '@yearly' || schedule === '@annually') {
      const next = new Date(now);
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0, 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (schedule === '@monthly') {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (schedule === '@weekly') {
      const next = new Date(now);
      next.setDate(next.getDate() + (7 - next.getDay()));
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (schedule === '@daily') {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (schedule === '@hourly') {
      const next = new Date(now);
      next.setHours(next.getHours() + 1, 0, 0, 0);
      return next;
    }

    const [minute, hour] = schedule.split(/\s+/);

    const next = new Date(now);
    next.setMinutes(parseInt(minute ?? '0') || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (hour !== '*') {
      next.setHours(parseInt(hour ?? '0'));
    }

    if (next <= now) {
      if (hour !== '*') {
        next.setDate(next.getDate() + 1);
      } else {
        next.setHours(next.getHours() + 1);
      }
    }

    if (this._isTestEnvironment()) {
      next.setTime(next.getTime() + 1000);
    }

    return next;
  }

  _calculateNextRunFromConfig(config: { enabled?: boolean; schedule?: string; timezone?: string } = {}): Date | null {
    if (!config || config.enabled === false) {
      return null;
    }

    const schedule = typeof config.schedule === 'string' ? config.schedule.trim() : '';
    if (!schedule) {
      return null;
    }

    const nextRun = this._calculateNextRun(schedule);

    if (config.timezone) {
      try {
        const localized = nextRun.toLocaleString('en-US', { timeZone: config.timezone });
        const tzDate = new Date(localized);
        if (!Number.isNaN(tzDate.getTime())) {
          return tzDate;
        }
      } catch (error) {
        this.logger.warn({ timezone: config.timezone, error: (error as Error).message }, 'Failed to apply timezone adjustment');
      }
    }

    return nextRun;
  }

  private async _executeJob(jobName: string): Promise<void> {
    const job = this.jobs.get(jobName);
    if (!job) {
      return;
    }

    if (this.activeJobs.has(jobName)) {
      return;
    }

    this.activeJobs.set(jobName, 'acquiring-lock');

    const storage = this.getStorage() as unknown as PluginStorage;
    const lockName = `job-${jobName}`;
    const lock = await storage.acquireLock(lockName, {
      ttl: Math.ceil(job.timeout / 1000) + 60,
      timeout: 0,
      workerId: process.pid ? String(process.pid) : 'unknown'
    });

    if (!lock) {
      this.logger.debug({ jobName }, `Job '${jobName}' already running on another instance`);
      this.activeJobs.delete(jobName);
      return;
    }

    const executionId = `${jobName}_${idGenerator()}`;
    const startTime = Date.now();

    const context: JobContext = {
      jobName,
      executionId,
      scheduledTime: new Date(startTime),
      database: this.database as unknown as Database
    };

    const setTimer = (
      (globalThis as Record<string, unknown>)?.originalSetTimeout ||
      (globalThis as Record<string, unknown>)?.setTimeout ||
      setTimeout
    ) as typeof setTimeout;

    const clearTimer = (
      (globalThis as Record<string, unknown>)?.originalClearTimeout ||
      (globalThis as Record<string, unknown>)?.clearTimeout ||
      clearTimeout
    ) as typeof clearTimeout;

    this.activeJobs.set(jobName, executionId);

    try {
      if (this.config.onJobStart) {
        await this._executeHook(this.config.onJobStart, jobName, context);
      }

      this.emit('plg:scheduler:job-start', { jobName, executionId, startTime });

      let attempt = 0;
      let lastError: Error | null = null;
      let result: unknown = null;
      let status: 'success' | 'error' | 'timeout' = 'success';

      const isTestEnvironment = this._isTestEnvironment();

      while (attempt <= job.retries) {
        try {
          const actualTimeout = isTestEnvironment ? Math.min(job.timeout, 1000) : job.timeout;

          let timeoutId: ReturnType<typeof setTimeout>;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimer(() => reject(new Error('Job execution timeout')), actualTimeout);
          });

          const jobPromise = job.action(this.database as unknown as Database, context, this);

          try {
            result = await Promise.race([jobPromise, timeoutPromise]);
            clearTimer(timeoutId!);
          } catch (raceError) {
            clearTimer(timeoutId!);
            throw raceError;
          }

          status = 'success';
          break;

        } catch (error) {
          lastError = error as Error;
          attempt++;

          if (attempt <= job.retries) {
            this.logger.warn({ jobName, attempt: attempt + 1, totalAttempts: job.retries + 1, error: (error as Error).message }, `Job '${jobName}' failed (attempt ${attempt + 1}): ${(error as Error).message}`);

            const baseDelay = Math.min(Math.pow(2, attempt) * 1000, 5000);
            const delay = isTestEnvironment ? 1 : baseDelay;
            await new Promise(resolve => setTimer(resolve, delay));
          }
        }
      }

      const endTime = Date.now();
      const duration = Math.max(1, endTime - startTime);

      if (lastError && attempt > job.retries) {
        status = lastError.message.includes('timeout') ? 'timeout' : 'error';
      }

      job.lastRun = new Date(endTime);
      job.runCount++;

      if (status === 'success') {
        job.successCount++;
      } else {
        job.errorCount++;
      }

      const stats = this.statistics.get(jobName)!;
      stats.totalRuns++;
      stats.lastRun = new Date(endTime);

      if (status === 'success') {
        stats.totalSuccesses++;
        stats.lastSuccess = new Date(endTime);
      } else {
        stats.totalErrors++;
        stats.lastError = { time: new Date(endTime), message: lastError?.message || 'Unknown error' };
      }

      stats.avgDuration = ((stats.avgDuration * (stats.totalRuns - 1)) + duration) / stats.totalRuns;

      if (this.config.persistJobs) {
        await this._persistJobExecution(jobName, executionId, startTime, endTime, duration, status, result, lastError, attempt);
      }

      if (status === 'success' && this.config.onJobComplete) {
        await this._executeHook(this.config.onJobComplete, jobName, result, duration);
      } else if (status !== 'success' && this.config.onJobError) {
        await this._executeHook(this.config.onJobError, jobName, lastError, attempt);
      }

      this.emit('plg:scheduler:job-complete', {
        jobName,
        executionId,
        status,
        duration,
        result,
        error: lastError?.message,
        retryCount: attempt
      });

      this.activeJobs.delete(jobName);

      if (job.enabled) {
        this._scheduleNextExecution(jobName);
      }

      if (lastError && status !== 'success') {
        throw lastError;
      }
    } finally {
      if (lock) {
        await tryFn(() => storage.releaseLock(lock));
      }
    }
  }

  private async _persistJobExecution(
    jobName: string,
    executionId: string,
    startTime: number,
    endTime: number,
    duration: number,
    status: string,
    result: unknown,
    error: Error | null,
    retryCount: number
  ): Promise<void> {
    if (!this.database) return;

    const [ok, err] = await tryFn(() =>
      this.database!.resources[this.config.jobHistoryResource]!.insert({
        id: executionId,
        jobName,
        status,
        startTime,
        endTime,
        duration,
        result: result ? JSON.stringify(result) : null,
        error: error?.message || null,
        retryCount,
        createdAt: new Date(startTime).toISOString().slice(0, 10)
      })
    );

    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, `Failed to persist job execution: ${(err as Error).message}`);
    }
  }

  private async _executeHook(hook: Function, ...args: unknown[]): Promise<void> {
    if (typeof hook === 'function') {
      const [ok, err] = await tryFn(() => hook(...args));
      if (!ok) {
        this.logger.warn({ error: (err as Error).message }, `Hook execution failed: ${(err as Error).message}`);
      }
    }
  }

  async runJob(jobName: string, context: Record<string, unknown> = {}): Promise<void> {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: 'runJob',
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
      });
    }

    if (this.activeJobs.has(jobName)) {
      throw new SchedulerError(`Job '${jobName}' is already running`, {
        operation: 'runJob',
        taskId: jobName,
        executionId: this.activeJobs.get(jobName),
        suggestion: 'Wait for current execution to complete or check job status with getJobStatus()'
      });
    }

    await this._executeJob(jobName);
  }

  enableJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: 'enableJob',
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
      });
    }

    job.enabled = true;
    this._scheduleNextExecution(jobName);

    this.emit('plg:scheduler:job-enabled', { jobName });
  }

  disableJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: 'disableJob',
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
      });
    }

    job.enabled = false;

    const timer = this.timers.get(jobName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobName);
    }

    this.emit('plg:scheduler:job-disabled', { jobName });
  }

  getJobStatus(jobName: string): JobStatus | null {
    const job = this.jobs.get(jobName);
    const stats = this.statistics.get(jobName);

    if (!job || !stats) {
      return null;
    }

    return {
      name: jobName,
      enabled: job.enabled,
      schedule: job.schedule,
      description: job.description,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      isRunning: this.activeJobs.has(jobName),
      statistics: {
        totalRuns: stats.totalRuns,
        totalSuccesses: stats.totalSuccesses,
        totalErrors: stats.totalErrors,
        successRate: stats.totalRuns > 0 ? (stats.totalSuccesses / stats.totalRuns) * 100 : 0,
        avgDuration: Math.round(stats.avgDuration),
        lastSuccess: stats.lastSuccess,
        lastError: stats.lastError
      }
    };
  }

  getAllJobsStatus(): JobStatus[] {
    const jobs: JobStatus[] = [];
    for (const jobName of this.jobs.keys()) {
      const status = this.getJobStatus(jobName);
      if (status) {
        jobs.push(status);
      }
    }
    return jobs;
  }

  async getJobHistory(jobName: string, options: JobHistoryOptions = {}): Promise<JobHistoryEntry[]> {
    if (!this.config.persistJobs || !this.database) {
      return [];
    }

    const { limit = 50, status = null } = options;

    const queryParams: Record<string, unknown> = {
      jobName
    };

    if (status) {
      queryParams.status = status;
    }

    const [ok, err, history] = await tryFn(() =>
      this.database!.resources[this.config.jobHistoryResource]!.query(queryParams)
    );

    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, `Failed to get job history: ${(err as Error).message}`);
      return [];
    }

    const filtered = (history as Array<Record<string, unknown>>)
      .sort((a, b) => (b.startTime as number) - (a.startTime as number))
      .slice(0, limit);

    return filtered.map(h => {
      let result: unknown = null;
      if (h.result) {
        try {
          result = JSON.parse(h.result as string);
        } catch {
          result = h.result;
        }
      }

      return {
        id: h.id as string,
        status: h.status as string,
        startTime: new Date(h.startTime as number),
        endTime: h.endTime ? new Date(h.endTime as number) : null,
        duration: h.duration as number,
        result,
        error: h.error as string | null,
        retryCount: h.retryCount as number
      };
    });
  }

  addJob(jobName: string, jobConfig: JobConfig): void {
    if (this.jobs.has(jobName)) {
      throw new SchedulerError(`Job '${jobName}' already exists`, {
        operation: 'addJob',
        taskId: jobName,
        existingJobs: Array.from(this.jobs.keys()),
        suggestion: 'Use a different job name or remove the existing job first with removeJob()'
      });
    }

    if (!jobConfig.schedule || !jobConfig.action) {
      throw new SchedulerError('Job must have schedule and action', {
        operation: 'addJob',
        taskId: jobName,
        providedConfig: Object.keys(jobConfig),
        suggestion: 'Provide both schedule and action: { schedule: "0 * * * *", action: async (db, ctx) => {...} }'
      });
    }

    if (!this._isValidCronExpression(jobConfig.schedule)) {
      throw new SchedulerError('Invalid cron expression', {
        operation: 'addJob',
        taskId: jobName,
        cronExpression: jobConfig.schedule,
        suggestion: 'Use valid cron format (5 fields) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)'
      });
    }

    const job: JobData = {
      ...jobConfig,
      enabled: jobConfig.enabled !== false,
      retries: jobConfig.retries ?? this.config.defaultRetries,
      timeout: jobConfig.timeout ?? this.config.defaultTimeout,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      successCount: 0,
      errorCount: 0
    };

    this.jobs.set(jobName, job);
    this.statistics.set(jobName, {
      totalRuns: 0,
      totalSuccesses: 0,
      totalErrors: 0,
      avgDuration: 0,
      lastRun: null,
      lastSuccess: null,
      lastError: null
    });

    if (job.enabled) {
      this._scheduleNextExecution(jobName);
    }

    this.emit('plg:scheduler:job-added', { jobName });
  }

  removeJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: 'removeJob',
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: 'Check job name or use getAllJobsStatus() to list available jobs'
      });
    }

    const timer = this.timers.get(jobName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobName);
    }

    this.jobs.delete(jobName);
    this.statistics.delete(jobName);
    this.activeJobs.delete(jobName);

    this.emit('plg:scheduler:job-removed', { jobName });
  }

  getPlugin(pluginName: string): unknown {
    return null;
  }

  override async start(): Promise<void> {
    this.logger.debug({ jobCount: this.jobs.size }, `Started with ${this.jobs.size} jobs`);
  }

  override async stop(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (!this._isTestEnvironment() && this.activeJobs.size > 0) {
      this.logger.debug({ activeJobCount: this.activeJobs.size }, `Waiting for ${this.activeJobs.size} active jobs to complete...`);

      const timeout = 5000;
      const start = Date.now();

      while (this.activeJobs.size > 0 && (Date.now() - start) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.activeJobs.size > 0) {
        this.logger.warn(`[SchedulerPlugin] ${this.activeJobs.size} jobs still running after timeout`);
      }
    }

    if (this._isTestEnvironment()) {
      this.activeJobs.clear();
    }

    this.jobs.clear();
    this.statistics.clear();
    this.activeJobs.clear();
    this.removeAllListeners();

    await this.stopCoordination();
  }
}
