import { EventEmitter } from 'events';
import type { TaskExecutor } from '../concurrency/task-executor.interface.js';
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js';
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
    errors: Array<{
        item: unknown;
        error: Error;
        index: number;
    }>;
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
    error: {
        name: string;
        message: string;
    } | null;
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
export declare class TasksRunner extends EventEmitter implements TaskExecutor {
    static notRun: symbol;
    static failed: symbol;
    features: {
        profile: string;
        emitEvents: boolean;
        trackProcessedItems: boolean;
        signatureInsights: boolean;
    };
    lightMode: boolean;
    bareMode: boolean;
    concurrency: number;
    retries: number;
    retryDelay: number;
    timeout: number;
    retryableErrors: string[];
    active: Set<Promise<unknown>>;
    paused: boolean;
    stopped: boolean;
    stats: RunnerStats;
    processedItems: unknown[] | null;
    taskMetrics: Map<string, TaskMetricEntry>;
    monitoring: {
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
    signatureStats: SignatureStats | null;
    tuner: AdaptiveTuning | null;
    autoTuningConfig?: Record<string, unknown>;
    private _queue;
    private _activeWaiters;
    private _activeLightTasks;
    private _taskMetricsOrder;
    private _monitoringState;
    private _lastTunedConcurrency;
    constructor(options?: RunnerOptions);
    get queue(): RunnerTask[];
    process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: ProcessOptions<T>): Promise<ProcessResult<R>>;
    enqueue<T = unknown>(fn: () => Promise<T>, options?: EnqueueOptions): Promise<T>;
    processIterable<T, R>(iterable: Iterable<T> | AsyncIterable<T>, processor: (item: T, index: number, runner: TasksRunner) => Promise<R>, options?: ProcessOptions<T>): Promise<ProcessResult<R>>;
    processCorresponding<T, R>(items: T[], processor: (item: T, index: number, runner: TasksRunner) => Promise<R>, options?: ProcessOptions<T>): Promise<Array<R | typeof TasksRunner.failed | typeof TasksRunner.notRun>>;
    processNext(): void;
    private _processLightQueue;
    private _processBareQueue;
    private _currentActiveCount;
    private _maybeExportMonitoringSample;
    private _executeTaskWithRetry;
    private _runSingleAttempt;
    private _executeBareTask;
    private _shouldEnforceTimeout;
    private _executeWithTimeout;
    private _isErrorRetryable;
    private _insertByPriority;
    private _waitForSlot;
    private _waitForActive;
    private _notifyActiveWaiters;
    private _sleep;
    private _primeTaskTelemetry;
    private _markTaskDequeued;
    private _shouldSampleMetrics;
    private _shouldTrackTelemetry;
    private _storeTaskMetric;
    private _recordTaskMetrics;
    pause(): Promise<void>;
    resume(): void;
    stop(): void;
    drain(): Promise<void>;
    setConcurrency(n: number): void;
    getConcurrency(): number;
    getStats(): Record<string, unknown>;
    getRollingMetrics(): RollingMetricsSnapshot | null;
    getSignatureInsights(limit?: number): unknown[];
    getAggregateMetrics(since?: number): AggregateMetrics | null;
    getProgress(): ProgressInfo;
    reset(): void;
    destroy(): Promise<void>;
    private _safeEmit;
    private _applyTunedConcurrency;
    private _normalizeSampleRate;
    private _avg;
    private _percentile;
    static process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: RunnerOptions & ProcessOptions<T>): Promise<ProcessResult<R>>;
    static withConcurrency(concurrency: number): TasksRunner;
}
export {};
//# sourceMappingURL=tasks-runner.class.d.ts.map