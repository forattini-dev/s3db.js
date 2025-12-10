import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import type { TaskExecutor } from '../concurrency/task-executor.interface.js';
import { AdaptiveTuning, type AdaptiveTuningOptions } from '../concerns/adaptive-tuning.js';
import { FifoTaskQueue } from './concerns/fifo-task-queue.js';
import { PriorityTaskQueue } from './concerns/priority-task-queue.js';
import { extractLengthHint, deriveSignature } from './concerns/task-signature.js';
import { SignatureStats } from './concerns/signature-stats.js';

export interface RunnerOptions {
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  priority?: boolean;
  autoTuning?: {
    enabled?: boolean;
    instance?: AdaptiveTuning;
    [key: string]: unknown;
  };
  monitoring?: {
    enabled?: boolean;
    collectMetrics?: boolean;
    sampleRate?: number;
    maxSamples?: number;
    rollingWindowMs?: number;
    reportInterval?: number;
    telemetrySampleRate?: number;
    signatureSampleLimit?: number;
    signatureAlpha?: number;
    signatureMaxEntries?: number;
    mode?: 'light' | 'passive' | 'detailed';
    exporter?: (snapshot: MonitoringSnapshot) => void;
  };
  features?: {
    profile?: 'bare' | 'light' | 'balanced';
    emitEvents?: boolean;
    trackProcessedItems?: boolean;
    signatureInsights?: boolean;
  };
}

export interface EnqueueOptions {
  priority?: number;
  retries?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
  signature?: string;
}

export interface ProcessOptions<T = unknown> extends EnqueueOptions {
  onProgress?: (item: T, stats: ProgressStats) => void;
  onItemComplete?: (item: T, result: unknown) => void;
  onItemError?: (item: T, error: Error) => void;
  totalCount?: number;
}

export interface ProgressStats {
  processedCount: number;
  totalCount: number | null;
  percentage: string | null;
}

export interface ProcessResult<T = unknown> {
  results: T[];
  errors: Array<{ item: unknown; error: Error; index: number }>;
}

export interface RunnerStats {
  queueSize: number;
  activeCount: number;
  processedCount: number;
  errorCount: number;
  retryCount: number;
}

export interface RollingMetricsSnapshot {
  sampleSize: number;
  avgQueueWait: number;
  avgExecution: number;
  avgRetries: number;
  errorRate: number;
}

export interface AggregateMetrics {
  count: number;
  avgQueueWait: number;
  avgExecution: number;
  avgTotal: number;
  p50Execution: number;
  p95Execution: number;
  p99Execution: number;
  errorRate: number;
  avgRetries: number;
}

export interface ProgressInfo {
  total: number;
  completed: number;
  pending: number;
  active: number;
  percentage: string | number;
}

export interface MonitoringSnapshot {
  timestamp: number;
  stage: string;
  profile: string;
  queueSize: number;
  activeCount: number;
  processed: number;
  errors: number;
  retries: number;
  throughput: number;
  signatureInsights: unknown[];
}

interface TaskTelemetry {
  enqueuedAt: number;
  startedAt?: number;
  failedAttempts: Array<{
    attempt: number;
    duration: number;
    errorName: string;
    errorMessage: string;
  }>;
}

interface TaskMetricEntry {
  id: string;
  completedAt: number;
  success: boolean;
  attemptCount: number;
  timings: {
    queueWait: number;
    execution: number;
    total: number;
    failedAttempts: Array<{
      attempt: number;
      duration: number;
      errorName: string;
      errorMessage: string;
    }>;
  };
  performance: Record<string, unknown>;
  error: { name: string; message: string } | null;
}

interface RunnerTask<T = unknown> {
  id: string;
  fn: () => Promise<T>;
  priority: number;
  retries: number;
  timeout: number;
  metadata: Record<string, unknown>;
  attemptCount: number;
  createdAt: number;
  signature: string;
  promise: Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  telemetry?: TaskTelemetry;
}

export class TasksRunner extends EventEmitter implements TaskExecutor {
  static notRun = Symbol('notRun');
  static failed = Symbol('failed');

  public features: {
    profile: string;
    emitEvents: boolean;
    trackProcessedItems: boolean;
    signatureInsights: boolean;
  };
  public lightMode: boolean;
  public bareMode: boolean;
  public concurrency: number;
  public retries: number;
  public retryDelay: number;
  public timeout: number;
  public retryableErrors: string[];
  public active: Set<Promise<unknown>>;
  public paused: boolean;
  public stopped: boolean;
  public stats: RunnerStats;
  public processedItems: unknown[] | null;
  public taskMetrics: Map<string, TaskMetricEntry>;
  public monitoring: {
    enabled: boolean;
    mode: string;
    collectMetrics: boolean;
    sampleRate: number;
    maxSamples: number;
    rollingWindowMs: number;
    reportInterval: number;
    telemetryRate: number;
    signatureSampleLimit: number;
    exporter: ((snapshot: MonitoringSnapshot) => void) | null;
  };
  public signatureStats: SignatureStats | null;
  public tuner: AdaptiveTuning | null;
  public autoTuningConfig?: Record<string, unknown>;

  private _queue: FifoTaskQueue<RunnerTask> | PriorityTaskQueue<RunnerTask>;
  private _activeWaiters: Array<() => void>;
  private _activeLightTasks: number;
  private _taskMetricsOrder: string[];
  private _monitoringState: { lastExport: number; lastProcessed: number };
  private _lastTunedConcurrency: number | null;

  constructor(options: RunnerOptions = {}) {
    super();

    const requestedRetries = options.retries ?? 3;
    const monitoringRequested = options.monitoring?.enabled ?? false;
    const requestedMonitoringMode = options.monitoring?.mode;
    const requestedProfile = options.features?.profile;
    const autoTuningRequested = options.autoTuning?.enabled || options.autoTuning?.instance;
    const needsRichProfile = requestedRetries > 0 || !!options.priority || autoTuningRequested;
    let profile = requestedProfile || (needsRichProfile ? 'balanced' : 'light');

    const defaultMonitoringMode =
      options.monitoring?.collectMetrics || options.monitoring?.mode === 'detailed'
        ? 'detailed'
        : 'passive';
    const monitoringMode = monitoringRequested
      ? requestedMonitoringMode || defaultMonitoringMode
      : 'light';

    if (profile === 'light' && monitoringRequested && monitoringMode !== 'passive') {
      profile = 'balanced';
    }

    this.features = {
      profile,
      emitEvents: options.features?.emitEvents ?? profile !== 'bare',
      trackProcessedItems:
        options.features?.trackProcessedItems ?? (profile !== 'light' && profile !== 'bare'),
      signatureInsights: options.features?.signatureInsights ?? true
    };
    this.lightMode = this.features.profile === 'light' || this.features.profile === 'bare';
    this.bareMode = this.features.profile === 'bare';

    this.concurrency = options.concurrency || 5;
    this.retries = requestedRetries;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout ?? 30000;
    this.retryableErrors = options.retryableErrors || [];

    this._queue = this.lightMode
      ? new FifoTaskQueue<RunnerTask>()
      : new PriorityTaskQueue<RunnerTask>();
    this.active = new Set();
    this.paused = false;
    this.stopped = false;
    this._activeWaiters = [];

    this.stats = {
      queueSize: 0,
      activeCount: 0,
      processedCount: 0,
      errorCount: 0,
      retryCount: 0
    };

    this.processedItems = this.features.trackProcessedItems ? [] : null;
    this.taskMetrics = new Map();
    const monitoringEnabled = !this.bareMode && monitoringRequested;
    const collectMetricsRequested = options.monitoring?.collectMetrics ?? false;
    const collectMetrics =
      monitoringEnabled && (collectMetricsRequested || monitoringMode === 'detailed');
    this.monitoring = {
      enabled: monitoringEnabled,
      mode: monitoringMode,
      collectMetrics,
      sampleRate: this._normalizeSampleRate(options.monitoring?.sampleRate ?? 1),
      maxSamples: Math.max(1, options.monitoring?.maxSamples ?? 512),
      rollingWindowMs: options.monitoring?.rollingWindowMs ?? 1000,
      reportInterval: options.monitoring?.reportInterval ?? 1000,
      telemetryRate: this._normalizeSampleRate(
        options.monitoring?.telemetrySampleRate ??
          (collectMetrics || autoTuningRequested ? 1 : 0.2)
      ),
      signatureSampleLimit: Math.max(1, options.monitoring?.signatureSampleLimit ?? 8),
      exporter: typeof options.monitoring?.exporter === 'function' ? options.monitoring.exporter : null
    };
    this._taskMetricsOrder = [];
    this._activeLightTasks = 0;
    this._monitoringState = {
      lastExport: 0,
      lastProcessed: 0
    };
    this.signatureStats = this.features.signatureInsights
      ? new SignatureStats({
          alpha: options.monitoring?.signatureAlpha,
          maxEntries: options.monitoring?.signatureMaxEntries
        })
      : null;
    this.tuner = null;
    this._lastTunedConcurrency = null;

    const tunerInstance = options.autoTuning?.instance;
    if (!this.bareMode && autoTuningRequested) {
      this.autoTuningConfig = options.autoTuning;
      this.tuner = tunerInstance || new AdaptiveTuning(options.autoTuning as AdaptiveTuningOptions);
      const tunedConcurrency = this.tuner.getConcurrency();
      if (typeof tunedConcurrency === 'number' && tunedConcurrency > 0) {
        this.setConcurrency(tunedConcurrency);
        this._lastTunedConcurrency = tunedConcurrency;
      }
    }
  }

  get queue(): RunnerTask[] {
    if (typeof (this._queue as FifoTaskQueue<RunnerTask>).toArray === 'function') {
      return (this._queue as FifoTaskQueue<RunnerTask>).toArray();
    }
    if (Array.isArray((this._queue as PriorityTaskQueue<RunnerTask>).heap)) {
      return (this._queue as PriorityTaskQueue<RunnerTask>).heap.map((node) => node.task);
    }
    return [];
  }

  async process<T, R>(
    items: T[],
    processor: (item: T, index?: number, executor?: unknown) => Promise<R>,
    options?: ProcessOptions<T>
  ): Promise<ProcessResult<R>> {
    const iterableOptions = {
      ...options,
      totalCount:
        typeof items?.length === 'number' && Number.isFinite(items.length)
          ? items.length
          : options?.totalCount
    };

    return await this.processIterable(items, processor, iterableOptions);
  }

  async enqueue<T = unknown>(fn: () => Promise<T>, options: EnqueueOptions = {}): Promise<T> {
    const taskMetadata = {
      ...(options.metadata || {})
    };
    const task: RunnerTask<T> = {
      id: nanoid(),
      fn,
      priority: options.priority || 0,
      retries: options.retries ?? this.retries,
      timeout: options.timeout ?? this.timeout,
      metadata: taskMetadata,
      attemptCount: 0,
      createdAt: Date.now(),
      signature: '',
      promise: null as unknown as Promise<T>,
      resolve: null as unknown as (result: T) => void,
      reject: null as unknown as (error: Error) => void
    };
    task.signature = deriveSignature(fn, taskMetadata, options.signature, task.priority);
    this._primeTaskTelemetry(task as unknown as RunnerTask);

    let resolve!: (result: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    task.promise = promise;
    task.resolve = resolve;
    task.reject = reject;

    this._insertByPriority(task as unknown as RunnerTask);
    this.stats.queueSize = this._queue.length;

    this.processNext();

    return promise;
  }

  async processIterable<T, R>(
    iterable: Iterable<T> | AsyncIterable<T>,
    processor: (item: T, index: number, runner: TasksRunner) => Promise<R>,
    options: ProcessOptions<T> = {}
  ): Promise<ProcessResult<R>> {
    const results: R[] = [];
    const errors: Array<{ item: unknown; error: Error; index: number }> = [];

    let index = 0;
    let processedCount = 0;
    const totalCount =
      typeof options.totalCount === 'number' && options.totalCount >= 0
        ? options.totalCount
        : null;

    const reportProgress = (item: T): void => {
      processedCount++;
      if (!options.onProgress) return;
      const percentage =
        totalCount != null && totalCount > 0
          ? ((processedCount / totalCount) * 100).toFixed(2)
          : null;
      options.onProgress(item, {
        processedCount,
        totalCount,
        percentage
      });
    };

    for await (const item of iterable) {
      if (this.stopped) break;

      const currentIndex = index;
      this.enqueue(
        async () => {
          return await processor(item, currentIndex, this);
        },
        {
          priority: options.priority,
          retries: options.retries,
          timeout: options.timeout,
          metadata: { item, index: currentIndex, itemLength: extractLengthHint(item) }
        }
      )
        .then((result) => {
          results.push(result as R);
          options.onItemComplete?.(item, result);
          reportProgress(item);
        })
        .catch((error: Error) => {
          errors.push({ item, error, index: currentIndex });
          options.onItemError?.(item, error);
          reportProgress(item);
        });

      index++;

      if (this._currentActiveCount() >= this.concurrency) {
        await this._waitForSlot();
      }
    }

    await this.drain();

    return { results, errors };
  }

  async processCorresponding<T, R>(
    items: T[],
    processor: (item: T, index: number, runner: TasksRunner) => Promise<R>,
    options: ProcessOptions<T> = {}
  ): Promise<Array<R | typeof TasksRunner.failed | typeof TasksRunner.notRun>> {
    const results: Array<R | typeof TasksRunner.failed | typeof TasksRunner.notRun> = Array(items.length).fill(TasksRunner.notRun);

    for (let index = 0; index < items.length; index++) {
      if (this.stopped) break;
      const item = items[index];

      this.enqueue(
        async () => {
          return await processor(item!, index, this);
        },
        {
          priority: options.priority,
          retries: options.retries,
          timeout: options.timeout,
          metadata: { item, index, itemLength: extractLengthHint(item) }
        }
      )
        .then((result) => {
          results[index] = result as R;
        })
        .catch((error: Error) => {
          results[index] = TasksRunner.failed;
          options.onItemError?.(item!, error);
        });

      if (this._currentActiveCount() >= this.concurrency) {
        await this._waitForSlot();
      }
    }

    await this.drain();

    return results;
  }

  processNext(): void {
    if (this.lightMode) {
      this._processLightQueue();
      return;
    }

    while (!this.paused && !this.stopped && this.active.size < this.concurrency && this._queue.length > 0) {
      const task = this._queue.dequeue();
      if (!task) break;
      this.stats.queueSize = this._queue.length;
      this._markTaskDequeued(task);

      const taskPromise = this._executeTaskWithRetry(task);

      this.active.add(taskPromise);
      this.stats.activeCount = this.active.size;
      this._safeEmit('taskStart', task);

      taskPromise
        .then((result) => {
          this.active.delete(taskPromise);
          this.stats.activeCount = this.active.size;
          this.stats.processedCount++;
          if (this.processedItems) {
            this.processedItems.push(task.metadata.item);
          }
          this._recordTaskMetrics(task, true);
          task.resolve(result);
          this._safeEmit('taskComplete', task, result);
        })
        .catch((error: Error) => {
          this.active.delete(taskPromise);
          this.stats.activeCount = this.active.size;
          this.stats.errorCount++;
          this._recordTaskMetrics(task, false, error);
          task.reject(error);
          this._safeEmit('taskError', task, error);
        })
        .finally(() => {
          this._maybeExportMonitoringSample('task');
          this._notifyActiveWaiters();
          this.processNext();

          if (this.active.size === 0 && this._queue.length === 0) {
            this._safeEmit('drained');
          }
        });
    }
  }

  private _processLightQueue(): void {
    if (this.paused || this.stopped) {
      return;
    }
    if (this.bareMode) {
      this._processBareQueue();
      return;
    }

    while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
      const task = this._queue.dequeue();
      if (!task) break;

      this._markTaskDequeued(task);
      this._activeLightTasks++;
      this.stats.activeCount = this._activeLightTasks;
      this.stats.queueSize = this._queue.length;
      const taskPromise = this._executeTaskWithRetry(task);
      this._safeEmit('taskStart', task);

      taskPromise
        .then((result) => {
          this.stats.processedCount++;
          if (this.processedItems) {
            this.processedItems.push(task.metadata.item);
          }
          this._recordTaskMetrics(task, true);
          task.resolve(result);
          this._safeEmit('taskComplete', task, result);
        })
        .catch((error: Error) => {
          this.stats.errorCount++;
          this._recordTaskMetrics(task, false, error);
          task.reject(error);
          this._safeEmit('taskError', task, error);
        })
        .finally(() => {
          this._maybeExportMonitoringSample('task');
          this._activeLightTasks--;
          this.stats.activeCount = this._activeLightTasks;
          this._notifyActiveWaiters();
          if (this._activeLightTasks === 0 && this._queue.length === 0) {
            this._safeEmit('drained');
          } else {
            this._processLightQueue();
          }
        });
    }
  }

  private _processBareQueue(): void {
    while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
      const task = this._queue.dequeue();
      if (!task) break;

      this._activeLightTasks++;
      const taskPromise = this._executeBareTask(task);

      taskPromise
        .then((result) => {
          task.resolve(result);
        })
        .catch((error: Error) => {
          task.reject(error);
        })
        .finally(() => {
          this._activeLightTasks--;
          this._notifyActiveWaiters();
          if (this._activeLightTasks === 0 && this._queue.length === 0) {
            this._safeEmit('drained');
          } else {
            this._processBareQueue();
          }
        });
    }
  }

  private _currentActiveCount(): number {
    return this.lightMode ? this._activeLightTasks : this.active.size;
  }

  private _maybeExportMonitoringSample(stage: string, force: boolean = false): void {
    if (!this.monitoring.enabled || !this.monitoring.exporter) {
      return;
    }
    const now = Date.now();
    if (!force && now - this._monitoringState.lastExport < this.monitoring.reportInterval) {
      return;
    }
    const completed = this.stats.processedCount + this.stats.errorCount;
    const deltaCompleted = completed - this._monitoringState.lastProcessed;
    const elapsed = Math.max(1, now - this._monitoringState.lastExport || this.monitoring.reportInterval);
    const throughput = deltaCompleted > 0 ? (deltaCompleted / elapsed) * 1000 : 0;
    const snapshot: MonitoringSnapshot = {
      timestamp: now,
      stage,
      profile: this.features.profile,
      queueSize: this._queue.length,
      activeCount: this._currentActiveCount(),
      processed: this.stats.processedCount,
      errors: this.stats.errorCount,
      retries: this.stats.retryCount,
      throughput,
      signatureInsights: this.signatureStats
        ? this.signatureStats.snapshot(this.monitoring.signatureSampleLimit)
        : []
    };
    this._monitoringState.lastExport = now;
    this._monitoringState.lastProcessed = completed;
    try {
      this.monitoring.exporter(snapshot);
    } catch {
      // noop
    }
  }

  private async _executeTaskWithRetry(task: RunnerTask): Promise<unknown> {
    if (this.bareMode || (task.retries === 0 && !this._shouldEnforceTimeout(task.timeout))) {
      return await this._runSingleAttempt(task);
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= task.retries; attempt++) {
      task.attemptCount = attempt + 1;
      const attemptStartedAt = this.monitoring.enabled ? Date.now() : 0;

      try {
        const result = await this._runSingleAttempt(task);
        return result;
      } catch (error) {
        lastError = error as Error;

        const isRetryable = this._isErrorRetryable(error as Error);
        const hasRetriesLeft = attempt < task.retries;

        if (this.monitoring.enabled && task.telemetry) {
          task.telemetry.failedAttempts.push({
            attempt: attempt + 1,
            duration: Date.now() - attemptStartedAt,
            errorName: (error as Error)?.name || (error as Error)?.constructor?.name || 'Error',
            errorMessage: (error as Error)?.message || ''
          });
        }

        if (isRetryable && hasRetriesLeft) {
          this.stats.retryCount++;
          this._safeEmit('taskRetry', task, attempt + 1);
          const delayMs = this.retryDelay * Math.pow(2, attempt);
          await this._sleep(delayMs);
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async _runSingleAttempt(task: RunnerTask): Promise<unknown> {
    const operation = task.fn();
    if (!this._shouldEnforceTimeout(task.timeout)) {
      return await operation;
    }
    return await this._executeWithTimeout(operation, task.timeout, task);
  }

  private async _executeBareTask(task: RunnerTask): Promise<unknown> {
    return await this._runSingleAttempt(task);
  }

  private _shouldEnforceTimeout(timeout: number): boolean {
    if (this.bareMode) {
      return false;
    }
    if (timeout == null) {
      return false;
    }
    if (!Number.isFinite(timeout)) {
      return false;
    }
    return timeout > 0;
  }

  private async _executeWithTimeout(promise: Promise<unknown>, timeout: number, task: RunnerTask): Promise<unknown> {
    let timerId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timerId!);
    }
  }

  private _isErrorRetryable(error: Error): boolean {
    if (this.retryableErrors.length === 0) {
      return true;
    }

    return this.retryableErrors.some((errorType) => {
      return (
        error.name === errorType ||
        (error as Error & { code?: string }).code === errorType ||
        error.constructor.name === errorType
      );
    });
  }

  private _insertByPriority(task: RunnerTask): void {
    this._queue.enqueue(task);
  }

  private async _waitForSlot(): Promise<void> {
    while (this._currentActiveCount() >= this.concurrency) {
      await this._waitForActive();
    }
  }

  private async _waitForActive(): Promise<void> {
    if (this._currentActiveCount() === 0) return;
    await new Promise<void>((resolve) => {
      this._activeWaiters.push(resolve);
    });
  }

  private _notifyActiveWaiters(): void {
    if (this._activeWaiters.length === 0) {
      return;
    }
    const waiters = this._activeWaiters;
    this._activeWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _primeTaskTelemetry(task: RunnerTask): void {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return;
    }
    if (!this._shouldTrackTelemetry()) {
      return;
    }
    task.telemetry = {
      enqueuedAt: task.createdAt,
      failedAttempts: []
    };
  }

  private _markTaskDequeued(task: RunnerTask): void {
    if (!task.telemetry) {
      return;
    }
    if (typeof task.telemetry.enqueuedAt !== 'number') {
      task.telemetry.enqueuedAt = task.createdAt || Date.now();
    }
    task.telemetry.startedAt = Date.now();
  }

  private _shouldSampleMetrics(): boolean {
    if (!this.monitoring.collectMetrics) {
      return false;
    }
    if (this.monitoring.sampleRate >= 1) {
      return true;
    }
    if (this.monitoring.sampleRate <= 0) {
      return false;
    }
    return Math.random() < this.monitoring.sampleRate;
  }

  private _shouldTrackTelemetry(): boolean {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return false;
    }
    if (this.tuner || this.monitoring.mode === 'detailed' || this.monitoring.collectMetrics) {
      return true;
    }
    if (this.monitoring.telemetryRate >= 1) {
      return true;
    }
    if (this.monitoring.telemetryRate <= 0) {
      return false;
    }
    return Math.random() < this.monitoring.telemetryRate;
  }

  private _storeTaskMetric(entry: TaskMetricEntry): void {
    this.taskMetrics.set(entry.id, entry);
    this._taskMetricsOrder.push(entry.id);
    if (this._taskMetricsOrder.length > this.monitoring.maxSamples) {
      const oldest = this._taskMetricsOrder.shift();
      if (oldest) {
        this.taskMetrics.delete(oldest);
      }
    }
  }

  private _recordTaskMetrics(task: RunnerTask, success: boolean, error?: Error): void {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return;
    }
    if (!task.telemetry) {
      if (this.signatureStats) {
        this.signatureStats.record(task.signature, { success });
      }
      return;
    }
    const telemetry = task.telemetry || {};
    const completedAt = Date.now();
    const enqueuedAt = typeof telemetry.enqueuedAt === 'number' ? telemetry.enqueuedAt : task.createdAt || completedAt;
    const startedAt = typeof telemetry.startedAt === 'number' ? telemetry.startedAt : completedAt;
    const queueWait = Math.max(0, startedAt - enqueuedAt);
    const execution = Math.max(0, completedAt - startedAt);
    const total = Math.max(0, completedAt - (task.createdAt || enqueuedAt));
    let entry: TaskMetricEntry | null = null;
    if (this.monitoring.enabled) {
      entry = {
        id: task.id,
        completedAt,
        success,
        attemptCount: task.attemptCount,
        timings: {
          queueWait,
          execution,
          total,
          failedAttempts: telemetry.failedAttempts || []
        },
        performance: {},
        error: success
          ? null
          : {
              name: error?.name || error?.constructor?.name || 'Error',
              message: error?.message || ''
            }
      };
      if (this._shouldSampleMetrics()) {
        this._storeTaskMetric(entry);
      }
    }
    if (this.tuner?.recordTaskMetrics) {
      try {
        this.tuner.recordTaskMetrics({
          latency: execution,
          queueWait,
          success,
          retries: (task.attemptCount || 1) - 1,
          heapDelta: ((entry?.performance as Record<string, unknown>)?.heapDelta as number) || 0
        });
      } catch (tunerError) {
        this._safeEmit('tuner:error', tunerError);
      }
      this._applyTunedConcurrency();
    }
    if (this.signatureStats) {
      this.signatureStats.record(task.signature, {
        queueWait,
        execution,
        success
      });
    }
    delete task.telemetry;
  }

  async pause(): Promise<void> {
    this.paused = true;
    while (this.active.size > 0) {
      await this._waitForActive();
    }
    this._safeEmit('paused');
  }

  resume(): void {
    this.paused = false;
    this.processNext();
    this._safeEmit('resumed');
  }

  stop(): void {
    this.stopped = true;

    this._queue.flush((task) => {
      task.promise?.catch(() => {});
      task.reject(new Error('Task cancelled by stop()'));
    });
    this.stats.queueSize = this._queue.length;
    this._safeEmit('stopped');
  }

  async drain(): Promise<void> {
    while (this._queue.length > 0 || this._currentActiveCount() > 0) {
      await this._waitForActive();
    }
    this._safeEmit('drained');
  }

  setConcurrency(n: number): void {
    if (n < 1) {
      throw new Error('Concurrency must be >= 1');
    }
    this.concurrency = n;
    this.processNext();
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  getStats(): Record<string, unknown> {
    return {
      ...this.stats,
      queueSize: this._queue.length,
      activeCount: this._currentActiveCount(),
      concurrency: this.concurrency,
      paused: this.paused,
      stopped: this.stopped,
      rolling: this.getRollingMetrics()
    };
  }

  getRollingMetrics(): RollingMetricsSnapshot | null {
    if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
      return null;
    }
    const entries = Array.from(this.taskMetrics.values());
    if (entries.length === 0) {
      return {
        sampleSize: 0,
        avgQueueWait: 0,
        avgExecution: 0,
        avgRetries: 0,
        errorRate: 0
      };
    }
    return {
      sampleSize: entries.length,
      avgQueueWait: this._avg(entries.map((t) => t.timings.queueWait || 0)),
      avgExecution: this._avg(entries.map((t) => t.timings.execution || 0)),
      avgRetries: this._avg(entries.map((t) => (t.attemptCount || 1) - 1)),
      errorRate: entries.filter((t) => !t.success).length / entries.length
    };
  }

  getSignatureInsights(limit: number = 5): unknown[] {
    if (!this.signatureStats) {
      return [];
    }
    return this.signatureStats.snapshot(limit);
  }

  getAggregateMetrics(since: number = 0): AggregateMetrics | null {
    if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
      return null;
    }
    const entries = Array.from(this.taskMetrics.values()).filter(
      (entry) => !since || (entry.completedAt || 0) > since
    );
    if (entries.length === 0) {
      return null;
    }
    const executions = entries.map((entry) => entry.timings.execution || 0);
    return {
      count: entries.length,
      avgQueueWait: this._avg(entries.map((entry) => entry.timings.queueWait || 0)),
      avgExecution: this._avg(executions),
      avgTotal: this._avg(entries.map((entry) => entry.timings.total || 0)),
      p50Execution: this._percentile(executions, 0.5),
      p95Execution: this._percentile(executions, 0.95),
      p99Execution: this._percentile(executions, 0.99),
      errorRate: entries.filter((entry) => !entry.success).length / entries.length,
      avgRetries: this._avg(entries.map((entry) => (entry.attemptCount || 1) - 1))
    };
  }

  getProgress(): ProgressInfo {
    const total =
      this.stats.processedCount + this.stats.errorCount + this._queue.length + this._currentActiveCount();
    const completed = this.stats.processedCount + this.stats.errorCount;

    return {
      total,
      completed,
      pending: this._queue.length,
      active: this._currentActiveCount(),
      percentage: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
    };
  }

  reset(): void {
    this._queue = this.lightMode
      ? new FifoTaskQueue<RunnerTask>()
      : new PriorityTaskQueue<RunnerTask>();
    this.active.clear();
    this.paused = false;
    this.stopped = false;
    this.processedItems = this.features.trackProcessedItems ? [] : null;
    this.taskMetrics.clear();
    this._taskMetricsOrder = [];
    this.signatureStats?.reset();
    this._activeWaiters = [];
    this._activeLightTasks = 0;

    this.stats = {
      queueSize: 0,
      activeCount: 0,
      processedCount: 0,
      errorCount: 0,
      retryCount: 0
    };
  }

  async destroy(): Promise<void> {
    this.stop();
    this.removeAllListeners();
    if (this.tuner?.stop) {
      this.tuner.stop();
    }
  }

  private _safeEmit(event: string, ...args: unknown[]): void {
    if (!this.features.emitEvents) {
      return;
    }
    super.emit(event, ...args);
  }

  private _applyTunedConcurrency(): void {
    if (!this.tuner) {
      return;
    }
    const tuned = this.tuner.getConcurrency();
    if (
      typeof tuned === 'number' &&
      tuned > 0 &&
      tuned !== this._lastTunedConcurrency &&
      tuned !== this.concurrency
    ) {
      this.setConcurrency(tuned);
      this._lastTunedConcurrency = tuned;
    }
  }

  private _normalizeSampleRate(value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 1;
    }
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
  }

  private _avg(arr: number[]): number {
    if (!arr || arr.length === 0) {
      return 0;
    }
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  }

  private _percentile(arr: number[], p: number): number {
    if (!arr || arr.length === 0) {
      return 0;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[index] ?? 0;
  }

  static async process<T, R>(
    items: T[],
    processor: (item: T, index?: number, executor?: unknown) => Promise<R>,
    options: RunnerOptions & ProcessOptions<T> = {}
  ): Promise<ProcessResult<R>> {
    const runner = new TasksRunner(options);
    const result = await runner.process(items, processor, options);
    runner.destroy();
    return result;
  }

  static withConcurrency(concurrency: number): TasksRunner {
    return new TasksRunner({ concurrency });
  }
}
