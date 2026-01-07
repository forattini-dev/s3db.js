import { EventEmitter } from 'events';
import type { TaskExecutor } from '../concurrency/task-executor.interface.js';
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js';
import { SignatureStats } from './concerns/signature-stats.js';
import { FifoTaskQueue } from './concerns/fifo-task-queue.js';
import { PriorityTaskQueue } from './concerns/priority-task-queue.js';
export interface TaskContext {
    id: string;
    attempt: number;
    retries: number;
    metadata: Record<string, unknown>;
    signal?: AbortSignal;
}
export type TaskFunction<T = unknown> = (context: TaskContext) => Promise<T>;
export interface TaskPoolOptions {
    concurrency?: number | 'auto';
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    retryableErrors?: string[];
    autoTuning?: {
        enabled?: boolean;
        instance?: AdaptiveTuning;
        targetLatency?: number;
        [key: string]: unknown;
    };
    monitoring?: {
        enabled?: boolean;
        collectMetrics?: boolean;
        sampleRate?: number;
        telemetrySampleRate?: number;
        sampleInterval?: number;
        rollingWindowMs?: number;
        reportInterval?: number;
        signatureSampleLimit?: number;
        signatureAlpha?: number;
        signatureMaxEntries?: number;
        mode?: 'light' | 'passive' | 'detailed' | 'full' | 'balanced';
        exporter?: (snapshot: MonitoringSnapshot) => void;
    };
    features?: {
        profile?: 'bare' | 'light' | 'balanced';
        emitEvents?: boolean;
        signatureInsights?: boolean;
    };
    retryStrategy?: {
        jitter?: boolean;
        minDelay?: number;
        maxDelay?: number;
        clampDelay?: number;
        pressureClampThreshold?: number;
        pressureSkipThreshold?: number;
        latencyTarget?: number;
    };
    queue?: {
        agingMs?: number;
        maxAgingBoost?: number;
        latencyTarget?: number;
    };
}
export interface EnqueueOptions {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
    signature?: string;
    [key: string]: unknown;
}
export interface BatchOptions extends EnqueueOptions {
    onItemComplete?: (result: unknown, index: number) => void;
    onItemError?: (error: Error, index: number) => void;
}
export interface BatchResult<T = unknown> {
    results: (T | null)[];
    errors: Array<{
        error: Error;
        index: number;
    }>;
    batchId: string;
}
export interface TaskTimings {
    queueWait: number | null;
    execution: number | null;
    retryDelays: number[] | null;
    retryDelayTotal: number;
    total: number | null;
    failedAttempts: Array<{
        attempt: number;
        duration: number;
        error: string;
    }> | null;
    overhead?: number;
}
export interface TaskPerformance {
    heapUsedBefore: number | null;
    heapUsedAfter: number | null;
    heapDelta: number | null;
}
export interface PoolTask<T = unknown> {
    id: string;
    fn: TaskFunction<T>;
    priority: number;
    retries: number;
    timeout: number;
    metadata: Record<string, unknown>;
    attemptCount: number;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    collectMetrics: boolean;
    timings: TaskTimings;
    controller: AbortController | null;
    delayController?: AbortController | null;
    performance: TaskPerformance;
    signature: string;
    promise: Promise<T>;
    resolve: (result: T) => void;
    reject: (error: Error) => void;
}
export interface PoolStats {
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
export interface ThroughputSnapshot {
    windowMs: number;
    throughputPerSec: number;
    successRate: number;
}
export interface RollingMetricsResult {
    samples: RollingMetricsSnapshot | null;
    throughput: ThroughputSnapshot | null;
}
export interface AggregateMetrics {
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    avgTotal: number;
    p50Execution: number;
    p95Execution: number;
    p99Execution: number;
    avgHeapDelta: number;
    errorRate: number;
    avgRetries: number;
    autoTuning: unknown;
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
export interface TaskMetricsEntry {
    id: string;
    metadata: Record<string, unknown>;
    timings: TaskTimings;
    performance: TaskPerformance;
    attemptCount: number;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    success: boolean;
}
interface RollingMetricsEntry {
    queueWait: number;
    execution: number;
    retries: number;
    success: boolean;
}
declare class MemorySampler {
    interval: number;
    lastSampleTime: number;
    lastSample: {
        heapUsed: number;
    };
    constructor(interval?: number);
    snapshot(): number;
    maybeSample(): number;
    sampleNow(): number;
}
declare class RollingMetrics {
    size: number;
    entries: Array<RollingMetricsEntry | undefined>;
    index: number;
    length: number;
    sums: {
        queueWait: number;
        execution: number;
        retries: number;
    };
    errorCount: number;
    constructor(size?: number);
    push(entry: RollingMetricsEntry): void;
    snapshot(): RollingMetricsSnapshot;
}
declare class RollingWindow {
    windowMs: number;
    events: Array<{
        timestamp: number;
        success: boolean;
    }>;
    constructor(windowMs?: number);
    record(timestamp?: number, success?: boolean): void;
    snapshot(): ThroughputSnapshot;
    private _prune;
}
export interface TaskMetrics {
    taskId: string;
    timings: TaskTimings;
    performance: TaskPerformance;
    metadata: Record<string, unknown>;
}
export declare class TasksPool extends EventEmitter implements TaskExecutor {
    features: {
        profile: string;
        emitEvents: boolean;
        signatureInsights: boolean;
    };
    lightMode: boolean;
    bareMode: boolean;
    autoConcurrency: boolean;
    retries: number;
    retryDelay: number;
    timeout: number;
    retryableErrors: string[];
    retryStrategy: {
        jitter: boolean;
        minDelay: number;
        maxDelay: number;
        clampDelay: number;
        pressureClampThreshold: number;
        pressureSkipThreshold: number;
        latencyTarget: number;
    };
    priorityConfig: {
        agingMs: number;
        maxAgingBoost: number;
        latencyTarget: number;
    };
    queue: FifoTaskQueue<PoolTask> | PriorityTaskQueue<PoolTask>;
    active: Map<Promise<unknown>, PoolTask>;
    paused: boolean;
    stopped: boolean;
    stats: PoolStats;
    rollingMetrics: RollingMetrics;
    monitoring: {
        enabled: boolean;
        mode: string;
        collectMetrics: boolean;
        sampleRate: number;
        telemetryRate: number;
        sampleInterval: number;
        rollingWindowMs: number;
        reportInterval: number;
        signatureSampleLimit: number;
        exporter: ((snapshot: MonitoringSnapshot) => void) | null;
    };
    taskMetrics: Map<string, TaskMetricsEntry>;
    memorySampler: MemorySampler | null;
    rollingWindow: RollingWindow | null;
    signatureStats: SignatureStats | null;
    tuner: AdaptiveTuning | null;
    autoTuningConfig?: Record<string, unknown>;
    private _configuredConcurrency;
    private _effectiveConcurrency;
    private _drainInProgress;
    private _pendingDrain;
    private _activeWaiters;
    private _lightActiveTasks;
    private _monitoringState;
    private _lastTunedConcurrency;
    constructor(options?: TaskPoolOptions);
    private _normalizeConcurrency;
    get concurrency(): number | 'auto';
    get effectiveConcurrency(): number;
    private _defaultAutoConcurrency;
    private _normalizeSampleRate;
    private _shouldSampleMetrics;
    private _shouldCaptureAttemptTimeline;
    setTuner(tuner: AdaptiveTuning): void;
    enqueue<T = unknown>(fn: TaskFunction<T>, options?: EnqueueOptions): Promise<T>;
    addBatch<T = unknown>(fns: Array<TaskFunction<T>>, options?: BatchOptions): Promise<BatchResult<T>>;
    /**
     * Process an array of items with controlled concurrency.
     * This is a convenience method that mimics PromisePool.for().process() API.
     *
     * @example
     * const { results, errors } = await TasksPool.map(
     *   users,
     *   async (user) => fetchUserData(user.id),
     *   { concurrency: 10 }
     * );
     */
    static map<T, R>(items: T[], processor: (item: T, index: number) => Promise<R>, options?: {
        concurrency?: number;
        onItemComplete?: (result: R, index: number) => void;
        onItemError?: (error: Error, item: T, index: number) => void;
    }): Promise<{
        results: R[];
        errors: Array<{
            error: Error;
            item: T;
            index: number;
        }>;
    }>;
    processNext(): void;
    private _drainQueue;
    private _canProcessNext;
    private _processLightQueue;
    private _processBareQueue;
    private _executeTaskWithRetry;
    private _runSingleAttempt;
    private _executeBareTask;
    private _executeWithTimeout;
    private _isErrorRetryable;
    private _insertByPriority;
    private _recordTaskCompletion;
    private _storeTaskMetrics;
    private _recordRollingMetrics;
    pause(): Promise<void>;
    resume(): void;
    stop(): void;
    drain(): Promise<void>;
    private _waitForActive;
    private _notifyActiveWaiters;
    setConcurrency(n: number | 'auto'): void;
    getConcurrency(): number | 'auto';
    getStats(): Record<string, unknown>;
    getTaskMetrics(taskId: string): TaskMetricsEntry | undefined;
    getRollingMetrics(): RollingMetricsResult;
    getSignatureInsights(limit?: number): unknown[];
    getAggregateMetrics(since?: number): AggregateMetrics | null;
    private _avg;
    private _percentile;
    private _sleep;
    private _buildTaskContext;
    private _readHeapUsage;
    private _computeHeapDelta;
    private _shouldEnforceTimeout;
    private _computeRetryDelay;
    private _isTransientNetworkError;
    private _latencyTargetMs;
    private _syncQueueAging;
    private _safeEmit;
    private _currentActiveCount;
    private _maybeExportMonitoringSample;
    private _applyTunedConcurrency;
    process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: {
        onSuccess?: (item: T, result: R) => void;
        onError?: (item: T, error: Error) => void;
        priority?: number;
        retries?: number;
        timeout?: number;
        totalCount?: number;
        [key: string]: unknown;
    }): Promise<{
        results: R[];
        errors: (Error | {
            item?: T;
            error?: Error;
            index?: number;
        })[];
    }>;
    destroy(): Promise<void>;
}
export {};
//# sourceMappingURL=tasks-pool.class.d.ts.map