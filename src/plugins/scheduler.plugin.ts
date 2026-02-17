import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { idGenerator } from "../concerns/id.js";
import { SchedulerError } from "./scheduler.errors.js";
import { createLogger } from '../concerns/logger.js';

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

interface CronFieldParseResult {
  values: Set<number>;
  wildcard: boolean;
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

  private readonly _cronShortcutMap = new Map([
    ['@yearly', '0 0 1 1 *'],
    ['@annually', '0 0 1 1 *'],
    ['@monthly', '0 0 1 * *'],
    ['@weekly', '0 0 * * 0'],
    ['@daily', '0 0 * * *'],
    ['@hourly', '0 * * * *']
  ]);

  private readonly _dayOfWeekNames: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
  };

  private readonly _monthNames: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };

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

  private _buildRange(min: number, max: number): Set<number> {
    const values = new Set<number>();
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return values;
  }

  private _normalizeCronExpression(expr: string): string | null {
    const normalized = String(expr).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return this._cronShortcutMap.get(normalized) || normalized;
  }

  private _parseFieldValue(
    value: string,
    min: number,
    max: number,
    namedValues: Record<string, number> = {}
  ): number | null {
    const raw = String(value).trim().toLowerCase();

    if (raw === '*' || raw === '?') {
      return null;
    }

    const named = namedValues[raw];
    if (named !== undefined) {
      if (named < min || named > max) {
        return null;
      }
      return named;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return null;
    }

    return parsed;
  }

  private _parseField(
    expression: string,
    min: number,
    max: number,
    namedValues: Record<string, number> = {}
  ): CronFieldParseResult | null {
    const normalized = String(expression).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized === '*' || normalized === '?') {
      return {
        values: this._buildRange(min, max),
        wildcard: true
      };
    }

    const tokens = normalized.split(',').map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
      return null;
    }

    const values = new Set<number>();

    for (const token of tokens) {
      if (token.includes('/')) {
        const [range, stepValue, ...rangeExtras] = token.split('/');
        if (!stepValue || rangeExtras.length > 0) {
          return null;
        }

        const step = Number(stepValue);
        if (!Number.isInteger(step) || step <= 0) {
          return null;
        }

        const base = (range || '*').trim().toLowerCase();

        if (base === '*' || base === '') {
          for (let i = min; i <= max; i += step) {
            values.add(i);
          }
          continue;
        }

        const rangeParts = base.split('-');
        if (rangeParts.length !== 2) {
          return null;
        }

        const [startToken, endToken] = rangeParts;
        if (!startToken || !endToken) {
          return null;
        }

        const start = this._parseFieldValue(startToken, min, max, namedValues);
        const end = this._parseFieldValue(endToken, min, max, namedValues);
        if (start === null || end === null) {
          return null;
        }

        const lo = Math.min(start, end);
        const hi = Math.max(start, end);

        for (let i = lo; i <= hi; i += step) {
          values.add(i);
        }
        continue;
      }

      if (token.includes('-')) {
        const rangeParts = token.split('-');
        if (rangeParts.length !== 2) {
          return null;
        }

        const [startToken, endToken] = rangeParts;
        if (!startToken || !endToken) {
          return null;
        }

        const start = this._parseFieldValue(startToken, min, max, namedValues);
        const end = this._parseFieldValue(endToken, min, max, namedValues);

        if (start === null || end === null) {
          return null;
        }

        const lo = Math.min(start, end);
        const hi = Math.max(start, end);

        for (let i = lo; i <= hi; i++) {
          values.add(i);
        }
        continue;
      }

      const parsed = this._parseFieldValue(token, min, max, namedValues);
      if (parsed === null) {
        return null;
      }

      values.add(parsed);
    }

    if (values.size === 0) {
      return null;
    }

    return {
      values,
      wildcard: false
    };
  }

  private _isValidCronExpression(expr: string): boolean {
    if (typeof expr !== 'string') {
      return false;
    }

    const normalized = this._normalizeCronExpression(expr);
    if (!normalized) {
      return false;
    }

    const parts = normalized.split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    const [minuteExpr, hourExpr, dayOfMonthExpr, monthExpr, dayOfWeekExpr] = parts;

    const minute = this._parseField(minuteExpr, 0, 59);
    if (!minute) return false;

    const hour = this._parseField(hourExpr, 0, 23);
    if (!hour) return false;

    const dayOfMonth = this._parseField(dayOfMonthExpr, 1, 31);
    if (!dayOfMonth) return false;

    const month = this._parseField(monthExpr, 1, 12, this._monthNames);
    if (!month) return false;

    const dayOfWeek = this._parseField(dayOfWeekExpr, 0, 6, this._dayOfWeekNames);
    if (!dayOfWeek) return false;

    return true;
  }

  private _getDateParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } | null {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23'
      });

      const parts = formatter.formatToParts(date);
      const values = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

      const weekdayName = (values.weekday || '').toLowerCase().slice(0, 3);

      return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        weekday: this._dayOfWeekNames[weekdayName] ?? 0
      };
    } catch {
      this.logger.warn({ scheduleTimezone: timezone }, `Invalid schedule timezone, using local timezone fallback.`);
      return null;
    }
  }

  private _hasCronMatchInTimezone(schedule: string, date: Date, timezone: string): boolean {
    const normalized = this._normalizeCronExpression(schedule);
    if (!normalized) {
      return false;
    }

    const parts = normalized.split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    const [minuteExpr, hourExpr, dayOfMonthExpr, monthExpr, dayOfWeekExpr] = parts;

    const minute = this._parseField(minuteExpr, 0, 59);
    const hour = this._parseField(hourExpr, 0, 23);
    const dayOfMonth = this._parseField(dayOfMonthExpr, 1, 31);
    const month = this._parseField(monthExpr, 1, 12, this._monthNames);
    const dayOfWeek = this._parseField(dayOfWeekExpr, 0, 6, this._dayOfWeekNames);

    if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
      return false;
    }

    const timezoneParts = this._getDateParts(date, timezone);
    if (!timezoneParts) {
      return false;
    }

    const minuteMatch = minute.values.has(timezoneParts.minute);
    const hourMatch = hour.values.has(timezoneParts.hour);
    const monthMatch = month.values.has(timezoneParts.month);

    const dayOfMonthExprIsWildcard = dayOfMonth.wildcard;
    const dayOfWeekExprIsWildcard = dayOfWeek.wildcard;
    const domMatch = dayOfMonth.values.has(timezoneParts.day);
    const dowMatch = dayOfWeek.values.has(timezoneParts.weekday);

    const dateMatch = dayOfMonthExprIsWildcard && dayOfWeekExprIsWildcard
      ? true
      : dayOfMonthExprIsWildcard
        ? dowMatch
        : dayOfWeekExprIsWildcard
          ? domMatch
          : (domMatch || dowMatch);

    return minuteMatch && hourMatch && monthMatch && dateMatch;
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

    await tryFn(() => this.database!.createResource({
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

  private _calculateNextRun(schedule: string, timezone: string = this.config.timezone): Date {
    const now = new Date();
    const normalized = this._normalizeCronExpression(schedule);

    if (!normalized) {
      const fallback = new Date(now);
      fallback.setSeconds(0, 0);
      fallback.setMilliseconds(0);
      fallback.setTime(fallback.getTime() + 60 * 1000);
      if (this._isTestEnvironment()) {
        fallback.setTime(fallback.getTime() + 1000);
      }
      return fallback;
    }

    if (normalized === '0 0 1 1 *') {
      const next = new Date(now);
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0, 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (normalized === '0 0 1 * *') {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (normalized === '0 0 * * 0') {
      const next = new Date(now);
      next.setDate(next.getDate() + (7 - next.getDay()));
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (normalized === '0 0 * * *') {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    if (normalized === '0 * * * *') {
      const next = new Date(now);
      next.setHours(next.getHours() + 1, 0, 0, 0);
      return next;
    }

    const parts = normalized.split(/\s+/);
    if (parts.length !== 5) {
      const fallback = new Date(now);
      fallback.setSeconds(0, 0);
      fallback.setMilliseconds(0);
      fallback.setTime(fallback.getTime() + 60 * 1000);
      return fallback;
    }

    const [minuteExpr, hourExpr, dayOfMonthExpr, monthExpr, dayOfWeekExpr] = parts;

    if (this._isValidCronExpression(normalized)) {
      const candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setMilliseconds(0);
      candidate.setTime(candidate.getTime() + 60 * 1000);

      for (let attempt = 0; attempt < 60 * 24 * 366; attempt++) {
        if (this._hasCronMatchInTimezone(
          `${minuteExpr} ${hourExpr} ${dayOfMonthExpr} ${monthExpr} ${dayOfWeekExpr}`,
          candidate,
          timezone
        )) {
          return candidate;
        }
        candidate.setTime(candidate.getTime() + 60 * 1000);
      }

      // Safety fallback in case timezone resolution fails unexpectedly
      candidate.setTime(candidate.getTime() + 60 * 1000);
      return candidate;
    }

    const fallback = new Date(now);
    fallback.setSeconds(0, 0);
    fallback.setMilliseconds(0);
    fallback.setTime(fallback.getTime() + 60 * 1000);
    return fallback;
  }

  _calculateNextRunFromConfig(config: { enabled?: boolean; schedule?: string; timezone?: string } = {}): Date | null {
    if (!config || config.enabled === false) {
      return null;
    }

    const schedule = typeof config.schedule === 'string' ? config.schedule.trim() : '';
    if (!schedule) {
      return null;
    }

    const nextRun = this._calculateNextRun(schedule, config.timezone || this.config.timezone);

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
      workerId: this.workerId
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

  async runJob(jobName: string, _context: Record<string, unknown> = {}): Promise<void> {
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
