import { EventEmitter } from 'events'
import { nanoid } from 'nanoid'
import { TaskExecutor } from '../concurrency/task-executor.interface.js' // eslint-disable-line no-unused-vars
import { AdaptiveTuning } from '../concerns/adaptive-tuning.js'
import { FifoTaskQueue } from './concerns/fifo-task-queue.js'
import { PriorityTaskQueue } from './concerns/priority-task-queue.js'
import { extractLengthHint, deriveSignature } from './concerns/task-signature.js'
import { SignatureStats } from './concerns/signature-stats.js'

/**
 * TasksRunner - Temporary batch processor for custom workflows
 *
 * Similar to PromisePool but with enhanced features:
 * - Retry logic with exponential backoff
 * - Timeout support
 * - Priority queue
 * - Progress tracking
 * - Lifecycle control (pause/resume/stop/drain/destroy)
 * - Event emitters for monitoring
 * - Support for iterables and generators
 * - Corresponding results (order-preserving)
 *
 * Implements TaskExecutor interface for interchangeability with TasksPool.
 *
 * Use cases:
 * - Ad-hoc batch processing
 * - Custom workflows with multiple steps
 * - Independent of database operations
 * - When you need local concurrency control
 *
 * @class TasksRunner
 * @extends EventEmitter, TaskExecutor
 *
 * @example
 * const runner = new TasksRunner({ concurrency: 10 })
 * const { results, errors } = await runner.process(
 *   items,
 *   async (item) => await processItem(item)
 * )
 * runner.destroy()
 */
export class TasksRunner extends EventEmitter {
  /**
   * Symbol for tasks that did not run (in corresponding results)
   * @static
   */
  static notRun = Symbol('notRun')

  /**
   * Symbol for tasks that failed (in corresponding results)
   * @static
   */
  static failed = Symbol('failed')

  /**
   * Create TasksRunner instance
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.concurrency=5] - Max concurrent tasks
   * @param {number} [options.retries=3] - Max retry attempts
   * @param {number} [options.retryDelay=1000] - Base retry delay (ms)
   * @param {number} [options.timeout=30000] - Per-task timeout (ms)
   * @param {Array<string>} [options.retryableErrors=[]] - Retryable error types (empty = all)
   */
  constructor (options = {}) {
    super()

    const requestedRetries = options.retries ?? 3
    const monitoringRequested = options.monitoring?.enabled ?? false
    const requestedMonitoringMode = options.monitoring?.mode
    const requestedProfile = options.features?.profile
    const autoTuningRequested = options.autoTuning?.enabled || options.autoTuning?.instance
    const needsRichProfile = requestedRetries > 0 || !!options.priority || autoTuningRequested
    let profile = requestedProfile || (needsRichProfile ? 'balanced' : 'light')

    const defaultMonitoringMode =
      options.monitoring?.collectMetrics || options.monitoring?.mode === 'detailed'
        ? 'detailed'
        : 'passive'
    const monitoringMode = monitoringRequested
      ? requestedMonitoringMode || defaultMonitoringMode
      : 'light'

    if (profile === 'light' && monitoringRequested && monitoringMode !== 'passive') {
      profile = 'balanced'
    }

    this.features = {
      profile,
      emitEvents: options.features?.emitEvents ?? profile !== 'bare',
      trackProcessedItems:
        options.features?.trackProcessedItems ?? (profile !== 'light' && profile !== 'bare'),
      signatureInsights: options.features?.signatureInsights ?? true
    }
    this.lightMode = this.features.profile === 'light' || this.features.profile === 'bare'
    this.bareMode = this.features.profile === 'bare'

    this.concurrency = options.concurrency || 5
    this.retries = requestedRetries
    this.retryDelay = options.retryDelay || 1000
    this.timeout = options.timeout ?? 30000
    this.retryableErrors = options.retryableErrors || []

    this._queue = this.lightMode ? new FifoTaskQueue() : new PriorityTaskQueue()
    this.active = new Set()
    this.paused = false
    this.stopped = false
    this._activeWaiters = []

    this.stats = {
      queueSize: 0,
      activeCount: 0,
      processedCount: 0,
      errorCount: 0,
      retryCount: 0
    }

    this.processedItems = this.features.trackProcessedItems ? [] : null
    this.taskMetrics = new Map()
    const monitoringEnabled = !this.bareMode && monitoringRequested
    const collectMetricsRequested = options.monitoring?.collectMetrics ?? false
    const collectMetrics =
      monitoringEnabled && (collectMetricsRequested || monitoringMode === 'detailed')
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
    }
    this._taskMetricsOrder = []
    this._activeLightTasks = 0
    this._monitoringState = {
      lastExport: 0,
      lastProcessed: 0
    }
    this.signatureStats = this.features.signatureInsights
      ? new SignatureStats({
          alpha: options.monitoring?.signatureAlpha,
          maxEntries: options.monitoring?.signatureMaxEntries
        })
      : null
    this.tuner = null
    this._lastTunedConcurrency = null

    const tunerInstance = options.autoTuning?.instance
    if (!this.bareMode && autoTuningRequested) {
      this.autoTuningConfig = options.autoTuning
      this.tuner = tunerInstance || new AdaptiveTuning(options.autoTuning)
      const tunedConcurrency = this.tuner.getConcurrency()
      if (typeof tunedConcurrency === 'number' && tunedConcurrency > 0) {
        this.setConcurrency(tunedConcurrency)
        this._lastTunedConcurrency = tunedConcurrency
      }
    }
  }

  get queue () {
    if (typeof this._queue?.toArray === 'function') {
      return this._queue.toArray()
    }
    if (Array.isArray(this._queue?.heap)) {
      return this._queue.heap
    }
    return []
  }

  /**
   * Process array of items through processor function
   *
   * @param {Array} items - Items to process
   * @param {Function} processor - async (item, index, manager) => result
   * @param {Object} [options={}] - Processing options
   * @param {Function} [options.onProgress] - Progress callback (item, stats)
   * @param {Function} [options.onItemComplete] - Item completion callback (item, result)
   * @param {Function} [options.onItemError] - Item error callback (item, error)
   * @param {number} [options.priority] - Default priority for all tasks
   * @param {number} [options.retries] - Override default retries
   * @param {number} [options.timeout] - Override default timeout
   * @returns {Promise<{results: Array, errors: Array}>}
   *
   * @example
   * const { results, errors } = await manager.process(
   *   users,
   *   async (user, index) => {
   *     await db.users.insert(user)
   *     return user.id
   *   },
   *   {
   *     onProgress: (item, stats) => {
   *       console.log(`Progress: ${stats.percentage}%`)
   *     }
   *   }
   * )
   */
  async process (items, processor, options = {}) {
    const iterableOptions = {
      ...options,
      totalCount:
        typeof items?.length === 'number' && Number.isFinite(items.length)
          ? items.length
          : options.totalCount
    }

    return await this.processIterable(items, processor, iterableOptions)
  }

  /**
   * Enqueue single task
   *
   * @param {Function} fn - async () => result
   * @param {Object} [options={}] - Task options
   * @param {number} [options.priority=0] - Task priority (higher = first)
   * @param {number} [options.retries] - Override retries
   * @param {number} [options.timeout] - Override timeout
   * @param {Object} [options.metadata={}] - Metadata for monitoring
   * @param {string} [options.signature] - Override auto-generated task signature
   * @returns {Promise} Promise that resolves with result
   *
   * @example
   * const result = await manager.enqueue(
   *   async () => await someOperation(),
   *   { priority: 10, retries: 5 }
   * )
   */
  async enqueue (fn, options = {}) {
    const taskMetadata = {
      ...(options.metadata || {})
    }
    const task = {
      id: nanoid(),
      fn,
      priority: options.priority || 0,
      retries: options.retries ?? this.retries,
      timeout: options.timeout ?? this.timeout,
      metadata: taskMetadata,
      attemptCount: 0,
      createdAt: Date.now()
    }
    task.signature = deriveSignature(fn, taskMetadata, options.signature, task.priority)
    this._primeTaskTelemetry(task)

    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    task.promise = promise
    task.resolve = resolve
    task.reject = reject

    this._insertByPriority(task)
    this.stats.queueSize = this._queue.length

    this.processNext()

    return promise
  }

  /**
   * Process items from iterable/generator
   *
   * More memory-efficient than process() for large datasets.
   * Items are consumed incrementally as capacity allows.
   *
   * @param {Iterable|AsyncIterable} iterable - Iterable or async generator
   * @param {Function} processor - async (item, index, manager) => result
   * @param {Object} [options={}] - Processing options
   * @param {Function} [options.onItemComplete] - Item completion callback (item, result)
   * @param {Function} [options.onItemError] - Item error callback (item, error)
   * @param {Function} [options.onProgress] - Progress callback (item, stats)
   * @param {number} [options.totalCount] - Known total item count for progress stats
   * @returns {Promise<{results: Array, errors: Array}>}
   *
   * @example
   * async function* dataGenerator() {
   *   for (let i = 0; i < 10000; i++) {
   *     yield { id: i, name: `Item ${i}` }
   *   }
   * }
   *
   * const { results, errors } = await manager.processIterable(
   *   dataGenerator(),
   *   async (item) => await db.items.insert(item)
   * )
   */
  async processIterable (iterable, processor, options = {}) {
    const results = []
    const errors = []

    let index = 0
    let processedCount = 0
    const totalCount =
      typeof options.totalCount === 'number' && options.totalCount >= 0
        ? options.totalCount
        : null

    const reportProgress = (item) => {
      processedCount++
      if (!options.onProgress) return
      const percentage =
        totalCount != null && totalCount > 0
          ? ((processedCount / totalCount) * 100).toFixed(2)
          : null
      options.onProgress(item, {
        processedCount,
        totalCount,
        percentage
      })
    }

    for await (const item of iterable) {
      if (this.stopped) break

      const currentIndex = index
      const promise = this.enqueue(
        async () => {
          return await processor(item, currentIndex, this)
        },
        {
          priority: options.priority,
          retries: options.retries,
          timeout: options.timeout,
          metadata: { item, index: currentIndex, itemLength: extractLengthHint(item) }
        }
      )
        .then((result) => {
          results.push(result)
          options.onItemComplete?.(item, result)
          reportProgress(item)
        })
        .catch((error) => {
          errors.push({ item, error, index: currentIndex })
          options.onItemError?.(item, error)
          reportProgress(item)
        })

      index++

      // Don't consume next item until there's a slot
      if (this._currentActiveCount() >= this.concurrency) {
        await this._waitForSlot()
      }
    }

    // Wait for all remaining tasks
    await this.drain()

    return { results, errors }
  }

  /**
   * Process batch with corresponding results (preserve order)
   *
   * Results array will have same length as items array.
   * Failed tasks are marked with TasksRunner.failed symbol.
   * Not-run tasks are marked with TasksRunner.notRun symbol.
   *
   * @param {Array} items - Items to process
   * @param {Function} processor - async (item, index, runner) => result
   * @param {Object} [options={}] - Processing options
   * @returns {Promise<Array>} Results array with symbols for failed/notRun
   *
   * @example
   * const results = await runner.processCorresponding(items, async (item) => {
   *   if (item.invalid) throw new Error('invalid')
   *   return item.id
   * })
   * // results = [1, 2, TasksRunner.failed, 4, TasksRunner.notRun]
   */
  async processCorresponding (items, processor, options = {}) {
    const results = Array(items.length).fill(TasksRunner.notRun)

    for (let index = 0; index < items.length; index++) {
      if (this.stopped) break
      const item = items[index]

      this.enqueue(
        async () => {
          return await processor(item, index, this)
        },
        {
          priority: options.priority,
          retries: options.retries,
          timeout: options.timeout,
          metadata: { item, index, itemLength: extractLengthHint(item) }
        }
      )
        .then((result) => {
          results[index] = result
        })
        .catch((error) => {
          results[index] = TasksRunner.failed
          options.onItemError?.(item, error)
        })

      if (this._currentActiveCount() >= this.concurrency) {
        await this._waitForSlot()
      }
    }

    await this.drain()

    return results
  }

  /**
   * Process next tasks from queue
   * @private
   */
  processNext () {
    if (this.lightMode) {
      this._processLightQueue()
      return
    }

    while (!this.paused && !this.stopped && this.active.size < this.concurrency && this._queue.length > 0) {
      const task = this._queue.dequeue()
      this.stats.queueSize = this._queue.length
      this._markTaskDequeued(task)

      const taskPromise = this._executeTaskWithRetry(task)

      this.active.add(taskPromise)
      this.stats.activeCount = this.active.size
      this._safeEmit('taskStart', task)

      taskPromise
        .then((result) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.processedCount++
          if (this.processedItems) {
            this.processedItems.push(task.metadata.item)
          }
          this._recordTaskMetrics(task, true)
          task.resolve(result)
          this._safeEmit('taskComplete', task, result)
        })
        .catch((error) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.errorCount++
          this._recordTaskMetrics(task, false, error)
          task.reject(error)
          this._safeEmit('taskError', task, error)
        })
        .finally(() => {
          this._maybeExportMonitoringSample('task')
          this._notifyActiveWaiters()
          this.processNext()

          if (this.active.size === 0 && this._queue.length === 0) {
            this._safeEmit('drained')
          }
        })
    }
  }

  _processLightQueue () {
    if (this.paused || this.stopped) {
      return
    }
    if (this.bareMode) {
      this._processBareQueue()
      return
    }

    while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
      const task = this._queue.dequeue()
      if (!task) break

      this._markTaskDequeued(task)
      this._activeLightTasks++
      this.stats.activeCount = this._activeLightTasks
      this.stats.queueSize = this._queue.length
      const taskPromise = this._executeTaskWithRetry(task)
      this._safeEmit('taskStart', task)

      taskPromise
        .then((result) => {
          this.stats.processedCount++
          if (this.processedItems) {
            this.processedItems.push(task.metadata.item)
          }
          this._recordTaskMetrics(task, true)
          task.resolve(result)
          this._safeEmit('taskComplete', task, result)
        })
        .catch((error) => {
          this.stats.errorCount++
          this._recordTaskMetrics(task, false, error)
          task.reject(error)
          this._safeEmit('taskError', task, error)
        })
        .finally(() => {
          this._maybeExportMonitoringSample('task')
          this._activeLightTasks--
          this.stats.activeCount = this._activeLightTasks
          this._notifyActiveWaiters()
          if (this._activeLightTasks === 0 && this._queue.length === 0) {
            this._safeEmit('drained')
          } else {
            this._processLightQueue()
          }
        })
    }
  }

  _processBareQueue () {
    while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
      const task = this._queue.dequeue()
      if (!task) break

      this._activeLightTasks++
      const taskPromise = this._executeBareTask(task)

      taskPromise
        .then((result) => {
          task.resolve(result)
        })
        .catch((error) => {
          task.reject(error)
        })
        .finally(() => {
          this._activeLightTasks--
          this._notifyActiveWaiters()
          if (this._activeLightTasks === 0 && this._queue.length === 0) {
            this._safeEmit('drained')
          } else {
            this._processBareQueue()
          }
        })
    }
  }

  _currentActiveCount () {
    return this.lightMode ? this._activeLightTasks : this.active.size
  }

  _maybeExportMonitoringSample (stage, force = false) {
    if (!this.monitoring.enabled || !this.monitoring.exporter) {
      return
    }
    const now = Date.now()
    if (!force && now - this._monitoringState.lastExport < this.monitoring.reportInterval) {
      return
    }
    const completed = this.stats.processedCount + this.stats.errorCount
    const deltaCompleted = completed - this._monitoringState.lastProcessed
    const elapsed = Math.max(1, now - this._monitoringState.lastExport || this.monitoring.reportInterval)
    const throughput = deltaCompleted > 0 ? (deltaCompleted / elapsed) * 1000 : 0
    const snapshot = {
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
    }
    this._monitoringState.lastExport = now
    this._monitoringState.lastProcessed = completed
    try {
      this.monitoring.exporter(snapshot)
    } catch {
      // noop
    }
  }

  /**
   * Execute task with retry logic
   * @private
   */
  async _executeTaskWithRetry (task) {
    if (this.bareMode || (task.retries === 0 && !this._shouldEnforceTimeout(task.timeout))) {
      return await this._runSingleAttempt(task)
    }

    let lastError

    for (let attempt = 0; attempt <= task.retries; attempt++) {
      task.attemptCount = attempt + 1
      const attemptStartedAt = this.monitoring.enabled ? Date.now() : 0

      try {
        const result = await this._runSingleAttempt(task)
        return result
      } catch (error) {
        lastError = error

        const isRetryable = this._isErrorRetryable(error)
        const hasRetriesLeft = attempt < task.retries

        if (this.monitoring.enabled && task.telemetry) {
          task.telemetry.failedAttempts.push({
            attempt: attempt + 1,
            duration: Date.now() - attemptStartedAt,
            errorName: error?.name || error?.constructor?.name || 'Error',
            errorMessage: error?.message || ''
          })
        }

        if (isRetryable && hasRetriesLeft) {
          this.stats.retryCount++
          this._safeEmit('taskRetry', task, attempt + 1)
          const delay = this.retryDelay * Math.pow(2, attempt)
          await this._sleep(delay)
        } else {
          throw error
        }
      }
    }

    throw lastError
  }

  async _runSingleAttempt (task) {
    const operation = task.fn()
    if (!this._shouldEnforceTimeout(task.timeout)) {
      return await operation
    }
    return await this._executeWithTimeout(operation, task.timeout, task)
  }

  async _executeBareTask (task) {
    return await this._runSingleAttempt(task)
  }

  _shouldEnforceTimeout (timeout) {
    if (this.bareMode) {
      return false
    }
    if (timeout == null) {
      return false
    }
    if (!Number.isFinite(timeout)) {
      return false
    }
    return timeout > 0
  }

  /**
   * Execute promise with timeout
   * @private
   */
  async _executeWithTimeout (promise, timeout, task) {
    let timerId

    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${timeout}ms`))
      }, timeout)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timerId)
    }
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isErrorRetryable (error) {
    // If no retryableErrors list, retry all errors
    if (this.retryableErrors.length === 0) {
      return true
    }

    // Check if error matches any retryable type
    // ⚠️ IMPORTANT: Only check error.name, error.code, and constructor name.
    // Do NOT use error.message.includes() as it causes false positives
    // (e.g., UnknownError with message containing "ServiceUnavailable" would retry)
    return this.retryableErrors.some((errorType) => {
      return (
        error.name === errorType ||
        error.code === errorType ||
        error.constructor.name === errorType
      )
    })
  }

  /**
   * Insert task by priority
   * @private
   */
  _insertByPriority (task) {
    this._queue.enqueue(task)
  }

  /**
   * Wait for processing slot
   * @private
   */
  async _waitForSlot () {
    while (this._currentActiveCount() >= this.concurrency) {
      await this._waitForActive()
    }
  }

  /**
   * Wait for active tasks
   * @private
   */
  async _waitForActive () {
    if (this._currentActiveCount() === 0) return
    await new Promise((resolve) => {
      this._activeWaiters.push(resolve)
    })
  }

  _notifyActiveWaiters () {
    if (this._activeWaiters.length === 0) {
      return
    }
    const waiters = this._activeWaiters
    this._activeWaiters = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  /**
   * Sleep
   * @private
   */
  _sleep (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Mark task dequeued time for monitoring
   * @param {Object} task
   * @private
   */
  _primeTaskTelemetry (task) {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return
    }
    if (!this._shouldTrackTelemetry()) {
      return
    }
    task.telemetry = {
      enqueuedAt: task.createdAt,
      failedAttempts: []
    }
  }

  _markTaskDequeued (task) {
    if (!task.telemetry) {
      return
    }
    if (typeof task.telemetry.enqueuedAt !== 'number') {
      task.telemetry.enqueuedAt = task.createdAt || Date.now()
    }
    task.telemetry.startedAt = Date.now()
  }

  /**
   * Decide if metrics entry should be sampled
   * @returns {boolean}
   * @private
   */
  _shouldSampleMetrics () {
    if (!this.monitoring.collectMetrics) {
      return false
    }
    if (this.monitoring.sampleRate >= 1) {
      return true
    }
    if (this.monitoring.sampleRate <= 0) {
      return false
    }
    return Math.random() < this.monitoring.sampleRate
  }

  _shouldTrackTelemetry () {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return false
    }
    if (this.tuner || this.monitoring.mode === 'detailed' || this.monitoring.collectMetrics) {
      return true
    }
    if (this.monitoring.telemetryRate >= 1) {
      return true
    }
    if (this.monitoring.telemetryRate <= 0) {
      return false
    }
    return Math.random() < this.monitoring.telemetryRate
  }

  /**
   * Persist task metrics respecting sample window
   * @param {Object} entry
   * @private
   */
  _storeTaskMetric (entry) {
    this.taskMetrics.set(entry.id, entry)
    this._taskMetricsOrder.push(entry.id)
    if (this._taskMetricsOrder.length > this.monitoring.maxSamples) {
      const oldest = this._taskMetricsOrder.shift()
      if (oldest) {
        this.taskMetrics.delete(oldest)
      }
    }
  }

  /**
   * Record metrics for completed task
   * @param {Object} task
   * @param {boolean} success
   * @param {Error} [error]
   * @private
   */
  _recordTaskMetrics (task, success, error) {
    if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
      return
    }
    if (!task.telemetry) {
      if (this.signatureStats) {
        this.signatureStats.record(task.signature, { success })
      }
      return
    }
    const telemetry = task.telemetry || {}
    const completedAt = Date.now()
    const enqueuedAt = typeof telemetry.enqueuedAt === 'number' ? telemetry.enqueuedAt : task.createdAt || completedAt
    const startedAt = typeof telemetry.startedAt === 'number' ? telemetry.startedAt : completedAt
    const queueWait = Math.max(0, startedAt - enqueuedAt)
    const execution = Math.max(0, completedAt - startedAt)
    const total = Math.max(0, completedAt - (task.createdAt || enqueuedAt))
    let entry = null
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
      }
      if (this._shouldSampleMetrics()) {
        this._storeTaskMetric(entry)
      }
    }
    if (this.tuner?.recordTaskMetrics) {
      try {
        this.tuner.recordTaskMetrics({
          latency: execution,
          queueWait,
          success,
          retries: (task.attemptCount || 1) - 1,
          heapDelta: entry?.performance?.heapDelta || 0
        })
      } catch (tunerError) {
        this._safeEmit('tuner:error', tunerError)
      }
      this._applyTunedConcurrency()
    }
    if (this.signatureStats) {
      this.signatureStats.record(task.signature, {
        queueWait,
        execution,
        success
      })
    }
    delete task.telemetry
  }

  /**
   * Pause processing
   *
   * No new tasks will start, but active tasks will complete.
   * Resolves when all active tasks finish.
   *
   * @returns {Promise<void>}
   */
  async pause () {
    this.paused = true
    while (this.active.size > 0) {
      await this._waitForActive()
    }
    this._safeEmit('paused')
  }

  /**
   * Resume processing
   */
  resume () {
    this.paused = false
    this.processNext()
    this._safeEmit('resumed')
  }

  /**
   * Stop processing
   *
   * Cancels all pending tasks with rejection.
   * Active tasks will complete.
   */
  stop () {
    this.stopped = true

    this._queue.flush((task) => {
      task.promise?.catch(() => {})
      task.reject(new Error('Task cancelled by stop()'))
    })
    this.stats.queueSize = this._queue.length
    this._safeEmit('stopped')
  }

  /**
   * Drain queue (wait for all tasks to complete)
   *
   * @returns {Promise<void>}
   */
  async drain () {
    while (this._queue.length > 0 || this._currentActiveCount() > 0) {
      await this._waitForActive()
    }
    this._safeEmit('drained')
  }

  /**
   * Set concurrency limit
   *
   * @param {number} n - New concurrency (must be >= 1)
   */
  setConcurrency (n) {
    if (n < 1) {
      throw new Error('Concurrency must be >= 1')
    }
    this.concurrency = n
    this.processNext()
  }

  /**
   * Get current concurrency setting
   * @returns {number} Current concurrency level
   */
  getConcurrency () {
    return this.concurrency
  }

  /**
   * Get current statistics
   *
   * @returns {Object} Current stats
   */
  getStats () {
    return {
      ...this.stats,
      queueSize: this._queue.length,
      activeCount: this._currentActiveCount(),
      concurrency: this.concurrency,
      paused: this.paused,
      stopped: this.stopped,
      rolling: this.getRollingMetrics()
    }
  }

  /**
   * Get rolling metrics snapshot
   *
   * @returns {Object|null}
   */
  getRollingMetrics () {
    if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
      return null
    }
    const entries = Array.from(this.taskMetrics.values())
    if (entries.length === 0) {
      return {
        sampleSize: 0,
        avgQueueWait: 0,
        avgExecution: 0,
        avgRetries: 0,
        errorRate: 0
      }
    }
    return {
      sampleSize: entries.length,
      avgQueueWait: this._avg(entries.map((t) => t.timings.queueWait || 0)),
      avgExecution: this._avg(entries.map((t) => t.timings.execution || 0)),
      avgRetries: this._avg(entries.map((t) => (t.attemptCount || 1) - 1)),
      errorRate: entries.filter((t) => !t.success).length / entries.length
    }
  }

  getSignatureInsights (limit = 5) {
    if (!this.signatureStats) {
      return []
    }
    return this.signatureStats.snapshot(limit)
  }

  /**
   * Aggregate task metrics
   *
   * @param {number} [since=0]
   * @returns {Object|null}
   */
  getAggregateMetrics (since = 0) {
    if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
      return null
    }
    const entries = Array.from(this.taskMetrics.values()).filter(
      (entry) => !since || (entry.completedAt || 0) > since
    )
    if (entries.length === 0) {
      return null
    }
    const executions = entries.map((entry) => entry.timings.execution || 0)
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
    }
  }

  /**
   * Get progress information
   *
   * @returns {Object} Progress information
   */
  getProgress () {
    const total =
      this.stats.processedCount + this.stats.errorCount + this._queue.length + this._currentActiveCount()
    const completed = this.stats.processedCount + this.stats.errorCount

    return {
      total,
      completed,
      pending: this._queue.length,
      active: this._currentActiveCount(),
      percentage: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
    }
  }

  /**
   * Reset manager (clear state)
   */
  reset () {
    this._queue = this.lightMode ? new FifoTaskQueue() : new PriorityTaskQueue()
    this.active.clear()
    this.paused = false
    this.stopped = false
    this.processedItems = this.features.trackProcessedItems ? [] : null
    this.taskMetrics.clear()
    this._taskMetricsOrder = []
    this.signatureStats?.reset()
    this._activeWaiters = []
    this._activeLightTasks = 0

    this.stats = {
      queueSize: 0,
      activeCount: 0,
      processedCount: 0,
      errorCount: 0,
      retryCount: 0
    }
  }

  /**
   * Destroy manager (cleanup)
   */
  destroy () {
    this.stop()
    this.removeAllListeners()
    if (this.tuner?.stop) {
      this.tuner.stop()
    }
  }

  _safeEmit (event, ...args) {
    if (!this.features.emitEvents) {
      return
    }
    super.emit(event, ...args)
  }

  _applyTunedConcurrency () {
    if (!this.tuner) {
      return
    }
    const tuned = this.tuner.getConcurrency()
    if (
      typeof tuned === 'number' &&
      tuned > 0 &&
      tuned !== this._lastTunedConcurrency &&
      tuned !== this.concurrency
    ) {
      this.setConcurrency(tuned)
      this._lastTunedConcurrency = tuned
    }
  }

  /**
   * Normalize sampling rate between 0 and 1
   * @param {number} value
   * @returns {number}
   * @private
   */
  _normalizeSampleRate (value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 1
    }
    if (value <= 0) return 0
    if (value >= 1) return 1
    return value
  }

  /**
   * Average helper
   * @param {Array<number>} arr
   * @returns {number}
   * @private
   */
  _avg (arr) {
    if (!arr || arr.length === 0) {
      return 0
    }
    const sum = arr.reduce((a, b) => a + b, 0)
    return sum / arr.length
  }

  /**
   * Percentile helper
   * @param {Array<number>} arr
   * @param {number} p
   * @returns {number}
   * @private
   */
  _percentile (arr, p) {
    if (!arr || arr.length === 0) {
      return 0
    }
    const sorted = arr.slice().sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
    return sorted[index]
  }

  /**
   * Static helper: Process batch (one-liner)
   *
   * @static
   * @param {Array} items - Items to process
   * @param {Function} processor - async (item, index) => result
   * @param {Object} [options={}] - Options
   * @returns {Promise<{results: Array, errors: Array}>}
   *
   * @example
   * const { results, errors } = await TasksRunner.process(
   *   items,
   *   async (item) => await doSomething(item),
   *   { concurrency: 5, retries: 3 }
   * )
   */
  static async process (items, processor, options = {}) {
    const runner = new TasksRunner(options)
    const result = await runner.process(items, processor, options)
    runner.destroy()
    return result
  }

  /**
   * Static helper: Create TasksRunner with concurrency
   *
   * @static
   * @param {number} concurrency - Concurrency limit
   * @returns {TasksRunner} New TasksRunner instance
   *
   * @example
   * const runner = TasksRunner.withConcurrency(5)
   * await runner.process(items, processor)
   */
  static withConcurrency (concurrency) {
    return new TasksRunner({ concurrency })
  }
}
