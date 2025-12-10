import { EventEmitter } from 'events';
import { cpus } from 'os';
import { setTimeout as delay } from 'timers/promises';
import { nanoid } from 'nanoid';
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js';
import { SignatureStats } from './concerns/signature-stats.js';
import { FifoTaskQueue } from './concerns/fifo-task-queue.js';
import { PriorityTaskQueue } from './concerns/priority-task-queue.js';
import { deriveSignature } from './concerns/task-signature.js';
const INTERNAL_DEFER = '__taskExecutorInternalDefer';
class MemorySampler {
    interval;
    lastSampleTime;
    lastSample;
    constructor(interval = 100) {
        this.interval = Math.max(25, interval);
        this.lastSampleTime = 0;
        this.lastSample = { heapUsed: 0 };
        this.sampleNow();
    }
    snapshot() {
        return this.lastSample.heapUsed;
    }
    maybeSample() {
        if (Date.now() - this.lastSampleTime >= this.interval) {
            return this.sampleNow();
        }
        return this.snapshot();
    }
    sampleNow() {
        this.lastSample = process.memoryUsage();
        this.lastSampleTime = Date.now();
        return this.lastSample.heapUsed;
    }
}
class RollingMetrics {
    size;
    entries;
    index;
    length;
    sums;
    errorCount;
    constructor(size = 256) {
        this.size = size;
        this.entries = new Array(size);
        this.index = 0;
        this.length = 0;
        this.sums = {
            queueWait: 0,
            execution: 0,
            retries: 0
        };
        this.errorCount = 0;
    }
    push(entry) {
        const old = this.entries[this.index];
        if (old) {
            this.sums.queueWait -= old.queueWait;
            this.sums.execution -= old.execution;
            this.sums.retries -= old.retries;
            if (!old.success) {
                this.errorCount--;
            }
        }
        this.entries[this.index] = entry;
        this.index = (this.index + 1) % this.size;
        if (this.length < this.size) {
            this.length++;
        }
        this.sums.queueWait += entry.queueWait;
        this.sums.execution += entry.execution;
        this.sums.retries += entry.retries;
        if (!entry.success) {
            this.errorCount++;
        }
    }
    snapshot() {
        if (this.length === 0) {
            return {
                sampleSize: 0,
                avgQueueWait: 0,
                avgExecution: 0,
                avgRetries: 0,
                errorRate: 0
            };
        }
        return {
            sampleSize: this.length,
            avgQueueWait: this.sums.queueWait / this.length,
            avgExecution: this.sums.execution / this.length,
            avgRetries: this.sums.retries / this.length,
            errorRate: this.errorCount / this.length
        };
    }
}
class RollingWindow {
    windowMs;
    events;
    constructor(windowMs = 1000) {
        this.windowMs = Math.max(250, windowMs);
        this.events = [];
    }
    record(timestamp = Date.now(), success = true) {
        this.events.push({ timestamp, success });
        this._prune();
    }
    snapshot() {
        this._prune();
        const count = this.events.length;
        if (count === 0) {
            return {
                windowMs: this.windowMs,
                throughputPerSec: 0,
                successRate: 1
            };
        }
        const now = Date.now();
        const effectiveWindow = Math.max(1, Math.min(this.windowMs, now - this.events[0].timestamp));
        const throughputPerSec = (count / effectiveWindow) * 1000;
        const successCount = this.events.filter((e) => e.success).length;
        return {
            windowMs: this.windowMs,
            throughputPerSec,
            successRate: successCount / count
        };
    }
    _prune() {
        const cutoff = Date.now() - this.windowMs;
        while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
            this.events.shift();
        }
    }
}
export class TasksPool extends EventEmitter {
    features;
    lightMode;
    bareMode;
    autoConcurrency;
    retries;
    retryDelay;
    timeout;
    retryableErrors;
    retryStrategy;
    priorityConfig;
    queue;
    active;
    paused;
    stopped;
    stats;
    rollingMetrics;
    monitoring;
    taskMetrics;
    memorySampler;
    rollingWindow;
    signatureStats;
    tuner;
    autoTuningConfig;
    _configuredConcurrency;
    _effectiveConcurrency;
    _drainInProgress;
    _pendingDrain;
    _activeWaiters;
    _lightActiveTasks;
    _monitoringState;
    _lastTunedConcurrency;
    constructor(options = {}) {
        super();
        const requestedRetries = options.retries ?? 3;
        const monitoringRequested = options.monitoring?.enabled ?? true;
        const requestedMonitoringMode = options.monitoring?.mode;
        const requestedProfile = options.features?.profile;
        const needsRichProfile = requestedRetries > 0;
        let profile = requestedProfile || (needsRichProfile ? 'balanced' : 'light');
        const defaultMonitoringMode = options.monitoring?.collectMetrics || requestedMonitoringMode === 'detailed'
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
            signatureInsights: options.features?.signatureInsights ?? true
        };
        this.lightMode = this.features.profile === 'light' || this.features.profile === 'bare';
        this.bareMode = this.features.profile === 'bare';
        const tunerInstance = options.autoTuning?.instance;
        const autoTuningRequested = options.autoTuning?.enabled || tunerInstance;
        const requestedConcurrency = options.concurrency ?? 10;
        this.autoConcurrency = requestedConcurrency === 'auto';
        this._configuredConcurrency = this.autoConcurrency
            ? 'auto'
            : this._normalizeConcurrency(requestedConcurrency);
        this._effectiveConcurrency = this.autoConcurrency
            ? this._defaultAutoConcurrency()
            : this._configuredConcurrency;
        this.retries = requestedRetries;
        this.retryDelay = options.retryDelay || 1000;
        this.timeout = options.timeout ?? 30000;
        this.retryableErrors = options.retryableErrors || [
            'NetworkingError',
            'TimeoutError',
            'RequestTimeout',
            'ServiceUnavailable',
            'SlowDown',
            'RequestLimitExceeded'
        ];
        this.retryStrategy = {
            jitter: options.retryStrategy?.jitter ?? true,
            minDelay: options.retryStrategy?.minDelay ?? 50,
            maxDelay: options.retryStrategy?.maxDelay ?? 30000,
            clampDelay: options.retryStrategy?.clampDelay ?? 250,
            pressureClampThreshold: options.retryStrategy?.pressureClampThreshold ?? 4,
            pressureSkipThreshold: options.retryStrategy?.pressureSkipThreshold ?? 10,
            latencyTarget: options.retryStrategy?.latencyTarget ?? 2000
        };
        this.priorityConfig = {
            agingMs: options.queue?.agingMs ?? 250,
            maxAgingBoost: options.queue?.maxAgingBoost ?? 3,
            latencyTarget: options.queue?.latencyTarget ?? 500
        };
        this.queue = this.lightMode
            ? new FifoTaskQueue()
            : new PriorityTaskQueue(this.priorityConfig);
        this.active = new Map();
        this.paused = false;
        this.stopped = false;
        this._drainInProgress = false;
        this._pendingDrain = false;
        this._activeWaiters = [];
        this.stats = {
            queueSize: 0,
            activeCount: 0,
            processedCount: 0,
            errorCount: 0,
            retryCount: 0
        };
        this.rollingMetrics = new RollingMetrics(256);
        this._lightActiveTasks = 0;
        this._monitoringState = {
            lastExport: 0,
            lastProcessed: 0
        };
        const monitoringEnabled = !this.bareMode && monitoringRequested;
        const collectMetricsRequested = options.monitoring?.collectMetrics ?? false;
        const collectMetrics = monitoringEnabled && (collectMetricsRequested || monitoringMode === 'detailed');
        this.monitoring = {
            enabled: monitoringEnabled,
            mode: monitoringMode,
            collectMetrics,
            sampleRate: this._normalizeSampleRate(options.monitoring?.sampleRate ?? 0),
            telemetryRate: this._normalizeSampleRate(options.monitoring?.telemetrySampleRate ??
                (collectMetrics || autoTuningRequested ? 1 : 0.2)),
            sampleInterval: options.monitoring?.sampleInterval ?? 100,
            rollingWindowMs: options.monitoring?.rollingWindowMs ?? 1000,
            reportInterval: options.monitoring?.reportInterval ?? 1000,
            signatureSampleLimit: Math.max(1, options.monitoring?.signatureSampleLimit ?? 8),
            exporter: typeof options.monitoring?.exporter === 'function' ? options.monitoring.exporter : null
        };
        this.taskMetrics = new Map();
        this.memorySampler =
            this.monitoring.collectMetrics &&
                this.monitoring.sampleRate > 0 &&
                this.monitoring.mode !== 'light'
                ? new MemorySampler(this.monitoring.sampleInterval)
                : null;
        this.rollingWindow = this.monitoring.collectMetrics
            ? new RollingWindow(this.monitoring.rollingWindowMs)
            : null;
        this.signatureStats = this.features.signatureInsights
            ? new SignatureStats({
                alpha: options.monitoring?.signatureAlpha,
                maxEntries: options.monitoring?.signatureMaxEntries
            })
            : null;
        this.tuner = null;
        this._lastTunedConcurrency = null;
        if (!this.bareMode && autoTuningRequested) {
            this.autoTuningConfig = options.autoTuning;
            this.tuner = tunerInstance || new AdaptiveTuning(options.autoTuning);
            const tuned = this.tuner.getConcurrency();
            if (typeof tuned === 'number' && tuned > 0) {
                this.setConcurrency(tuned);
                this._lastTunedConcurrency = tuned;
            }
        }
    }
    _normalizeConcurrency(concurrency) {
        if (typeof concurrency === 'number' && concurrency >= 1) {
            return concurrency;
        }
        return 10;
    }
    get concurrency() {
        return this._configuredConcurrency;
    }
    get effectiveConcurrency() {
        return this._effectiveConcurrency;
    }
    _defaultAutoConcurrency() {
        try {
            const cpuCount = Math.max(1, cpus()?.length || 0);
            return Math.min(Math.max(cpuCount, 4), 20);
        }
        catch {
            return 10;
        }
    }
    _normalizeSampleRate(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 1;
        }
        if (value <= 0)
            return 0;
        if (value >= 1)
            return 1;
        return value;
    }
    _shouldSampleMetrics() {
        if (!this.monitoring.collectMetrics) {
            return false;
        }
        if (this.monitoring.sampleRate <= 0) {
            return false;
        }
        if (this.monitoring.sampleRate >= 1) {
            return true;
        }
        return Math.random() < this.monitoring.sampleRate;
    }
    _shouldCaptureAttemptTimeline(taskCollectMetrics) {
        if (taskCollectMetrics) {
            return true;
        }
        if (this.monitoring.collectMetrics || this.monitoring.mode === 'detailed') {
            return true;
        }
        return false;
    }
    setTuner(tuner) {
        this.tuner = tuner;
        if (this.autoConcurrency) {
            this._effectiveConcurrency = tuner.getConcurrency();
            this.processNext();
            this._lastTunedConcurrency = this._effectiveConcurrency;
        }
    }
    async enqueue(fn, options = {}) {
        let internalDefer = false;
        if (options && options[INTERNAL_DEFER]) {
            internalDefer = true;
            options = { ...options };
            delete options[INTERNAL_DEFER];
        }
        const collectMetrics = this._shouldSampleMetrics();
        const captureAttemptTimeline = this._shouldCaptureAttemptTimeline(collectMetrics);
        const taskMetadata = {
            ...(options.metadata || {})
        };
        const task = {
            id: nanoid(),
            fn: fn,
            priority: options.priority || 0,
            retries: options.retries ?? this.retries,
            timeout: options.timeout ?? this.timeout,
            metadata: taskMetadata,
            attemptCount: 0,
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            collectMetrics,
            timings: {
                queueWait: null,
                execution: null,
                retryDelays: captureAttemptTimeline ? [] : null,
                retryDelayTotal: 0,
                total: null,
                failedAttempts: captureAttemptTimeline ? [] : null
            },
            controller: null,
            performance: {
                heapUsedBefore: null,
                heapUsedAfter: null,
                heapDelta: null
            },
            signature: '',
            promise: null,
            resolve: null,
            reject: null
        };
        task.signature = deriveSignature(fn, taskMetadata, options.signature, task.priority);
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        task.promise = promise;
        task.resolve = (result) => {
            this._recordTaskCompletion(task, result, null);
            resolve(result);
        };
        task.reject = (error) => {
            this._recordTaskCompletion(task, null, error);
            reject(error);
        };
        this._insertByPriority(task);
        this.stats.queueSize = this.queue.length;
        if (!internalDefer) {
            this.processNext();
        }
        return promise;
    }
    async addBatch(fns, options = {}) {
        const results = [];
        const errors = [];
        const batchId = nanoid();
        const promises = fns.map((fn, index) => {
            const taskOptions = {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { ...options.metadata, batchId, index },
                [INTERNAL_DEFER]: true
            };
            return this.enqueue(fn, taskOptions)
                .then((result) => {
                results.push(result);
                if (options.onItemComplete) {
                    options.onItemComplete(result, index);
                }
                return result;
            })
                .catch((error) => {
                errors.push({ error, index });
                if (options.onItemError) {
                    options.onItemError(error, index);
                }
                throw error;
            });
        });
        if (promises.length > 0) {
            this.processNext();
        }
        const settled = await Promise.allSettled(promises);
        const orderedResults = settled.map((s) => {
            if (s.status === 'fulfilled')
                return s.value;
            return null;
        });
        return { results: orderedResults, errors, batchId };
    }
    processNext() {
        if (this.lightMode) {
            this._processLightQueue();
            return;
        }
        if (this.paused || this.stopped || this.queue.length === 0) {
            this._pendingDrain = false;
            return;
        }
        if (this._drainInProgress) {
            this._pendingDrain = true;
            return;
        }
        this._drainInProgress = true;
        do {
            this._pendingDrain = false;
            this._drainQueue();
        } while (this._pendingDrain && !this.paused && !this.stopped && this.queue.length > 0);
        this._drainInProgress = false;
    }
    _drainQueue() {
        while (this._canProcessNext()) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this.stats.queueSize = this.queue.length;
            const taskPromise = this._executeTaskWithRetry(task);
            this.active.set(taskPromise, task);
            this.stats.activeCount = this.active.size;
            this._safeEmit('pool:taskStarted', task);
            taskPromise
                .then((result) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.processedCount++;
                task.resolve(result);
                this._safeEmit('pool:taskCompleted', task, result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.errorCount++;
                task.reject(error);
                this._safeEmit('pool:taskError', task, error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._maybeExportMonitoringSample('task');
                this._notifyActiveWaiters();
                this.processNext();
                if (this.active.size === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
            });
        }
    }
    _canProcessNext() {
        return (!this.paused &&
            !this.stopped &&
            this.queue.length > 0 &&
            this._currentActiveCount() < this.effectiveConcurrency);
    }
    _processLightQueue() {
        if (this.paused || this.stopped) {
            return;
        }
        if (this.bareMode) {
            this._processBareQueue();
            return;
        }
        while (this.queue.length > 0 && this._lightActiveTasks < this.effectiveConcurrency) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this.stats.queueSize = this.queue.length;
            this._lightActiveTasks++;
            this.stats.activeCount = this._lightActiveTasks;
            this._safeEmit('pool:taskStarted', task);
            const taskPromise = this._executeTaskWithRetry(task);
            taskPromise
                .then((result) => {
                this.stats.processedCount++;
                task.resolve(result);
                this._safeEmit('pool:taskCompleted', task, result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                this.stats.errorCount++;
                task.reject(error);
                this._safeEmit('pool:taskError', task, error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._lightActiveTasks--;
                this.stats.activeCount = this._lightActiveTasks;
                this._notifyActiveWaiters();
                this._maybeExportMonitoringSample('task');
                if (this._lightActiveTasks === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
                else {
                    this._processLightQueue();
                }
            });
        }
    }
    _processBareQueue() {
        while (this.queue.length > 0 && this._lightActiveTasks < this.effectiveConcurrency) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this._lightActiveTasks++;
            const taskPromise = this._executeBareTask(task);
            taskPromise
                .then((result) => {
                task.resolve(result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                task.reject(error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._lightActiveTasks--;
                this._notifyActiveWaiters();
                if (this._lightActiveTasks === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
                else {
                    this._processBareQueue();
                }
            });
        }
    }
    async _executeTaskWithRetry(task) {
        if (this.bareMode || (task.retries === 0 && !this._shouldEnforceTimeout(task.timeout))) {
            return await this._runSingleAttempt(task);
        }
        let lastError;
        for (let attempt = 0; attempt <= task.retries; attempt++) {
            task.attemptCount = attempt + 1;
            if (attempt === 0) {
                task.startedAt = Date.now();
                task.timings.queueWait = task.startedAt - task.createdAt;
            }
            try {
                const result = await this._runSingleAttempt(task);
                return result;
            }
            catch (error) {
                lastError = error;
                if (task.timings.failedAttempts) {
                    task.timings.failedAttempts.push({
                        attempt: attempt + 1,
                        duration: task.timings.execution || 0,
                        error: error.message
                    });
                }
                const isRetryable = this._isErrorRetryable(error);
                const hasRetriesLeft = attempt < task.retries;
                if (isRetryable && hasRetriesLeft) {
                    this.stats.retryCount++;
                    this._safeEmit('pool:taskRetry', task, attempt + 1);
                    const delayMs = this._computeRetryDelay(task, attempt, error);
                    if (delayMs == null) {
                        throw error;
                    }
                    const delayStartTime = Date.now();
                    const delayController = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    task.delayController = delayController;
                    await this._sleep(delayMs, delayController?.signal);
                    const delayEndTime = Date.now();
                    const retryDuration = delayEndTime - delayStartTime;
                    if (task.timings.retryDelays) {
                        task.timings.retryDelays.push(retryDuration);
                    }
                    task.timings.retryDelayTotal = (task.timings.retryDelayTotal || 0) + retryDuration;
                    task.delayController = null;
                }
                else {
                    throw error;
                }
            }
            finally {
                task.controller = null;
                task.delayController = null;
            }
        }
        throw lastError;
    }
    async _runSingleAttempt(task) {
        if (typeof task.startedAt !== 'number') {
            task.startedAt = Date.now();
            task.timings.queueWait = task.startedAt - task.createdAt;
        }
        if (task.collectMetrics && this.memorySampler) {
            task.performance.heapUsedBefore = this._readHeapUsage('before');
        }
        const controller = this._shouldEnforceTimeout(task.timeout) && typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;
        task.controller = controller || null;
        const attemptStartTime = Date.now();
        const context = this._buildTaskContext(task, controller);
        const executionPromise = task.fn(context);
        const result = this._shouldEnforceTimeout(task.timeout)
            ? await this._executeWithTimeout(executionPromise, task.timeout, task, controller)
            : await executionPromise;
        const attemptEndTime = Date.now();
        task.timings.execution = attemptEndTime - attemptStartTime;
        if (task.collectMetrics && this.memorySampler) {
            task.performance.heapUsedAfter = this._readHeapUsage('after');
            task.performance.heapDelta = this._computeHeapDelta(task.performance.heapUsedBefore, task.performance.heapUsedAfter);
        }
        task.controller = null;
        return result;
    }
    async _executeBareTask(task) {
        return await this._runSingleAttempt(task);
    }
    async _executeWithTimeout(promise, timeout, task, controller) {
        let timerId;
        const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => {
                const timeoutError = new Error(`Task ${task.id} timed out after ${timeout}ms`);
                timeoutError.name = 'TimeoutError';
                timeoutError.code = 'EOPERATIONS_TIMEOUT';
                if (controller && typeof controller.abort === 'function') {
                    controller.abort(timeoutError);
                }
                reject(timeoutError);
            }, timeout);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            clearTimeout(timerId);
        }
    }
    _isErrorRetryable(error) {
        if (this.retryableErrors.length === 0) {
            return true;
        }
        return this.retryableErrors.some((errorType) => {
            return (error.name === errorType ||
                error.code === errorType ||
                error.constructor.name === errorType);
        });
    }
    _insertByPriority(task) {
        this.queue.enqueue(task);
    }
    _recordTaskCompletion(task, result, error) {
        task.completedAt = Date.now();
        task.timings.total = task.completedAt - task.createdAt;
        const totalRetryDelay = task.timings.retryDelays
            ? task.timings.retryDelays.reduce((a, b) => a + b, 0)
            : task.timings.retryDelayTotal || 0;
        task.timings.overhead = task.timings.total - (task.timings.execution || 0) - totalRetryDelay;
        if (this.tuner?.recordTaskMetrics) {
            try {
                this.tuner.recordTaskMetrics({
                    latency: task.timings.execution || 0,
                    queueWait: task.timings.queueWait ?? 0,
                    success: !error,
                    retries: task.attemptCount - 1,
                    heapDelta: task.performance.heapDelta || 0
                });
            }
            catch (tunerError) {
                this._safeEmit('tuner:error', tunerError);
            }
        }
        if (this.monitoring.collectMetrics && task.collectMetrics) {
            this._storeTaskMetrics(task, error);
        }
        if (this.signatureStats) {
            this.signatureStats.record(task.signature, {
                queueWait: task.timings.queueWait || 0,
                execution: task.timings.execution || 0,
                success: !error
            });
        }
        if (this.monitoring.enabled) {
            this._safeEmit('pool:taskMetrics', {
                taskId: task.id,
                timings: task.timings,
                performance: task.performance,
                metadata: task.metadata
            });
        }
        this._recordRollingMetrics(task, error);
    }
    _storeTaskMetrics(task, error) {
        const timingsSnapshot = {
            ...task.timings,
            retryDelays: task.timings.retryDelays ? task.timings.retryDelays.slice(0) : [],
            failedAttempts: task.timings.failedAttempts
                ? task.timings.failedAttempts.map((attempt) => ({ ...attempt }))
                : []
        };
        const performanceSnapshot = task.performance
            ? { ...task.performance }
            : { heapUsedBefore: null, heapUsedAfter: null, heapDelta: null };
        this.taskMetrics.set(task.id, {
            id: task.id,
            metadata: task.metadata,
            timings: timingsSnapshot,
            performance: performanceSnapshot,
            attemptCount: task.attemptCount,
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            success: !error
        });
        if (this.taskMetrics.size > 1000) {
            const oldestKey = this.taskMetrics.keys().next().value;
            if (oldestKey) {
                this.taskMetrics.delete(oldestKey);
            }
        }
    }
    _recordRollingMetrics(task, error) {
        const entry = {
            queueWait: task.timings.queueWait || 0,
            execution: task.timings.execution || 0,
            retries: (task.attemptCount || 1) - 1,
            success: !error
        };
        this.rollingMetrics?.push(entry);
        this.rollingWindow?.record(task.completedAt || Date.now(), entry.success);
        this._syncQueueAging();
    }
    async pause() {
        this.paused = true;
        while (this.active.size > 0) {
            await this._waitForActive();
        }
        this._safeEmit('pool:paused');
    }
    resume() {
        this.paused = false;
        this.processNext();
        this._safeEmit('pool:resumed');
    }
    stop() {
        this.stopped = true;
        this.queue.flush((task) => {
            task.reject(new Error('Task cancelled by stop()'));
        });
        this.stats.queueSize = this.queue.length;
        this.active.forEach((task) => {
            if (task.controller && typeof task.controller.abort === 'function') {
                task.controller.abort(new Error('Task cancelled by stop()'));
            }
            if (task.delayController && typeof task.delayController.abort === 'function') {
                task.delayController.abort(new Error('Task cancelled by stop()'));
            }
        });
        this._safeEmit('pool:stopped');
        if (this.tuner?.stop) {
            this.tuner.stop();
        }
    }
    async drain() {
        while (this.queue.length > 0 || this._currentActiveCount() > 0) {
            await this._waitForActive();
        }
        this._safeEmit('pool:drained');
        this._maybeExportMonitoringSample('drain', true);
    }
    async _waitForActive() {
        if (this._currentActiveCount() === 0)
            return;
        await new Promise((resolve) => {
            this._activeWaiters.push(resolve);
        });
    }
    _notifyActiveWaiters() {
        if (this._activeWaiters.length === 0) {
            return;
        }
        const waiters = this._activeWaiters;
        this._activeWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }
    setConcurrency(n) {
        if (n === 'auto') {
            this.autoConcurrency = true;
            this._configuredConcurrency = 'auto';
            this._effectiveConcurrency = this._defaultAutoConcurrency();
            this.processNext();
            return;
        }
        if (typeof n !== 'number' || n < 1) {
            throw new Error('Concurrency must be >= 1');
        }
        const normalized = this._normalizeConcurrency(n);
        this.autoConcurrency = false;
        this._configuredConcurrency = normalized;
        this._effectiveConcurrency = normalized;
        this.processNext();
    }
    getConcurrency() {
        return this.concurrency;
    }
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            activeCount: this._currentActiveCount(),
            concurrency: this.concurrency,
            effectiveConcurrency: this.effectiveConcurrency,
            paused: this.paused,
            stopped: this.stopped,
            rolling: this.getRollingMetrics()
        };
    }
    getTaskMetrics(taskId) {
        return this.taskMetrics.get(taskId);
    }
    getRollingMetrics() {
        return {
            samples: this.rollingMetrics?.snapshot() || null,
            throughput: this.rollingWindow?.snapshot() || null
        };
    }
    getSignatureInsights(limit = 5) {
        if (!this.signatureStats) {
            return [];
        }
        return this.signatureStats.snapshot(limit);
    }
    getAggregateMetrics(since = 0) {
        const tasks = Array.from(this.taskMetrics.values()).filter((t) => t.completedAt && t.completedAt > since);
        if (tasks.length === 0)
            return null;
        return {
            count: tasks.length,
            avgQueueWait: this._avg(tasks.map((t) => t.timings.queueWait || 0)),
            avgExecution: this._avg(tasks.map((t) => t.timings.execution || 0)),
            avgTotal: this._avg(tasks.map((t) => t.timings.total || 0)),
            p50Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.5),
            p95Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.95),
            p99Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.99),
            avgHeapDelta: this._avg(tasks.map((t) => t.performance.heapDelta || 0)),
            errorRate: tasks.filter((t) => t.timings.failedAttempts && t.timings.failedAttempts.length > 0).length / tasks.length,
            avgRetries: this._avg(tasks.map((t) => (t.attemptCount || 1) - 1)),
            autoTuning: this.tuner ? this.tuner.getMetrics() : null
        };
    }
    _avg(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    _percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const sorted = arr.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    _sleep(ms, signal) {
        if (signal && typeof signal.aborted !== 'undefined') {
            return delay(ms, undefined, { signal });
        }
        return delay(ms);
    }
    _buildTaskContext(task, controller) {
        return {
            id: task.id,
            attempt: task.attemptCount,
            retries: task.retries,
            metadata: task.metadata,
            signal: controller?.signal
        };
    }
    _readHeapUsage(stage) {
        if (!this.memorySampler)
            return null;
        if (this.monitoring.mode === 'full') {
            return this.memorySampler.sampleNow();
        }
        if (this.monitoring.mode === 'balanced') {
            return stage === 'after'
                ? this.memorySampler.maybeSample()
                : this.memorySampler.snapshot();
        }
        return this.memorySampler.snapshot();
    }
    _computeHeapDelta(before, after) {
        if (typeof before !== 'number' || typeof after !== 'number') {
            return null;
        }
        return after - before;
    }
    _shouldEnforceTimeout(timeout) {
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
    _computeRetryDelay(task, attempt, error) {
        const base = this.retryDelay * Math.pow(2, attempt);
        const saturation = (this.queue.length + this.active.size) / Math.max(1, this.effectiveConcurrency);
        if (saturation >= this.retryStrategy.pressureSkipThreshold) {
            return null;
        }
        let delayMs = base;
        const latencyTarget = this._latencyTargetMs();
        if (saturation >= this.retryStrategy.pressureClampThreshold ||
            (task.timings.queueWait || 0) > latencyTarget) {
            delayMs = Math.min(delayMs, this.retryStrategy.clampDelay);
        }
        if (this._isTransientNetworkError(error)) {
            delayMs = Math.max(this.retryStrategy.minDelay, delayMs * 0.5);
        }
        if (this.retryStrategy.jitter) {
            const jitterWindow = Math.max(1, delayMs * 0.2);
            delayMs = delayMs - jitterWindow / 2 + Math.random() * jitterWindow;
        }
        delayMs = Math.min(Math.max(delayMs, this.retryStrategy.minDelay), this.retryStrategy.maxDelay);
        return delayMs;
    }
    _isTransientNetworkError(error) {
        const message = `${error.name || ''} ${error.code || ''} ${error.message || ''}`;
        return /timeout|network|throttl|slowdown|temporarily unavailable/i.test(message);
    }
    _latencyTargetMs() {
        if (this.tuner && typeof this.tuner.targetLatency === 'number') {
            const target = this.tuner.targetLatency;
            if (target > 0) {
                return target;
            }
        }
        if (this.autoTuningConfig?.targetLatency) {
            return this.autoTuningConfig.targetLatency;
        }
        return this.retryStrategy.latencyTarget;
    }
    _syncQueueAging() {
        if (!this.queue?.setAgingMultiplier || !this.rollingMetrics) {
            return;
        }
        const snapshot = this.rollingMetrics.snapshot();
        if (!snapshot.sampleSize)
            return;
        const target = this._latencyTargetMs();
        if (!target)
            return;
        const ratio = snapshot.avgQueueWait / Math.max(1, target);
        const multiplier = Math.min(4, Math.max(0.25, ratio || 1));
        this.queue.setAgingMultiplier(multiplier);
    }
    _safeEmit(event, ...args) {
        if (!this.features.emitEvents) {
            return;
        }
        super.emit(event, ...args);
    }
    _currentActiveCount() {
        return this.lightMode ? this._lightActiveTasks : this.active.size;
    }
    _maybeExportMonitoringSample(stage, force = false) {
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
        const snapshot = {
            timestamp: now,
            stage,
            profile: this.features.profile,
            queueSize: this.queue.length,
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
        }
        catch {
            // ignore exporter failures
        }
    }
    _applyTunedConcurrency() {
        if (!this.tuner) {
            return;
        }
        const tuned = this.tuner.getConcurrency();
        if (typeof tuned === 'number' &&
            tuned > 0 &&
            tuned !== this._lastTunedConcurrency &&
            tuned !== this.effectiveConcurrency) {
            this.setConcurrency(tuned);
            this._lastTunedConcurrency = tuned;
        }
    }
    async process(items, processor, options = {}) {
        const results = [];
        const errors = [];
        const promises = items.map((item, index) => {
            return this.enqueue(async () => {
                return await processor(item, index, this);
            }, {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { index, totalCount: options.totalCount || items.length }
            })
                .then((result) => {
                results.push(result);
                if (options.onSuccess) {
                    options.onSuccess(item, result);
                }
                return result;
            })
                .catch((error) => {
                errors.push({ item, error, index });
                if (options.onError) {
                    options.onError(item, error);
                }
            });
        });
        await Promise.all(promises);
        return { results, errors };
    }
    async destroy() {
        this.stop();
        await this.drain();
        this.taskMetrics.clear();
        this.removeAllListeners();
    }
}
//# sourceMappingURL=tasks-pool.class.js.map