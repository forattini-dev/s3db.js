import { EventEmitter } from 'events'
import { cpus } from 'os'
import { setTimeout as delay } from 'timers/promises'
import { nanoid } from 'nanoid'
import { TaskExecutor } from './concurrency/task-executor.interface.js'

const INTERNAL_DEFER = '__taskExecutorInternalDefer'

/**
 * TasksPool - Global operation queue for controlling S3 operation concurrency
 *
 * Manages concurrent execution of S3 operations with:
 * - Configurable concurrency limit
 * - Retry logic with exponential backoff
 * - Per-operation timeout
 * - Priority queue support
 * - Optional adaptive auto-tuning
 * - Comprehensive metrics collection
 * - Event emission for monitoring
 *
 * Implements TaskExecutor interface for interchangeability with TasksRunner.
 *
 * @class TasksPool
 * @extends EventEmitter, TaskExecutor
 */
export class TasksPool extends EventEmitter {
  /**
   * Create a TasksPool instance
   *
   * @param {Object} options - Configuration options
   * @param {number|string} [options.concurrency='auto'] - Max concurrent operations (number or 'auto')
   * @param {number} [options.retries=3] - Max retry attempts per operation
   * @param {number} [options.retryDelay=1000] - Base retry delay in ms (exponential backoff)
   * @param {number} [options.timeout=30000] - Per-operation timeout in ms
   * @param {Array<string>} [options.retryableErrors] - List of retryable error types
   * @param {Object} [options.autoTuning] - Auto-tuning configuration
   * @param {boolean} [options.autoTuning.enabled=false] - Enable adaptive tuning
   * @param {Object} [options.monitoring] - Monitoring configuration
   * @param {boolean} [options.monitoring.enabled=true] - Enable metrics collection
   * @param {boolean} [options.monitoring.collectMetrics=false] - Collect detailed task metrics
   * @param {number} [options.monitoring.sampleRate=0] - Fraction (0-1) of tasks to persist detailed metrics
   */
  constructor (options = {}) {
    super()

    // Normalize configuration
    const requestedConcurrency = options.concurrency ?? 10
    this.autoConcurrency = requestedConcurrency === 'auto'
    this._configuredConcurrency = this.autoConcurrency
      ? 'auto'
      : this._normalizeConcurrency(requestedConcurrency)
    this._effectiveConcurrency = this.autoConcurrency
      ? this._defaultAutoConcurrency()
      : this._configuredConcurrency
    this.retries = options.retries ?? 3
    this.retryDelay = options.retryDelay || 1000
    this.timeout = options.timeout ?? 30000
    this.retryableErrors = options.retryableErrors || [
      'NetworkingError',
      'TimeoutError',
      'RequestTimeout',
      'ServiceUnavailable',
      'SlowDown',
      'RequestLimitExceeded'
    ]

    this.retryStrategy = {
      jitter: options.retryStrategy?.jitter ?? true,
      minDelay: options.retryStrategy?.minDelay ?? 50,
      maxDelay: options.retryStrategy?.maxDelay ?? 30000,
      clampDelay: options.retryStrategy?.clampDelay ?? 250,
      pressureClampThreshold: options.retryStrategy?.pressureClampThreshold ?? 4,
      pressureSkipThreshold: options.retryStrategy?.pressureSkipThreshold ?? 10,
      latencyTarget: options.retryStrategy?.latencyTarget ?? 2000
    }

    this.priorityConfig = {
      agingMs: options.queue?.agingMs ?? 250,
      maxAgingBoost: options.queue?.maxAgingBoost ?? 3,
      latencyTarget: options.queue?.latencyTarget ?? 500
    }

    // State
    this.queue = new PriorityTaskQueue(this.priorityConfig)
    this.active = new Map()
    this.paused = false
    this.stopped = false
    this._drainInProgress = false
    this._pendingDrain = false
    this._activeWaiters = []

    // Statistics
    this.stats = {
      queueSize: 0,
      activeCount: 0,
      processedCount: 0,
      errorCount: 0,
      retryCount: 0
    }
    this.rollingMetrics = new RollingMetrics(256)

    // Metrics collection (optional)
    this.monitoring = {
      enabled: options.monitoring?.enabled ?? true,
      collectMetrics: options.monitoring?.collectMetrics ?? false,
      sampleRate: this._normalizeSampleRate(options.monitoring?.sampleRate ?? 0),
      mode: options.monitoring?.mode || 'balanced', // 'light' | 'balanced' | 'full'
      sampleInterval: options.monitoring?.sampleInterval ?? 100,
      rollingWindowMs: options.monitoring?.rollingWindowMs ?? 1000
    }
    this.taskMetrics = new Map()
    this.memorySampler =
      this.monitoring.collectMetrics &&
      this.monitoring.sampleRate > 0 &&
      this.monitoring.mode !== 'light'
        ? new MemorySampler(this.monitoring.sampleInterval)
        : null
    this.rollingWindow = this.monitoring.enabled
      ? new RollingWindow(this.monitoring.rollingWindowMs)
      : null

    // Auto-tuning (optional, initialized externally if needed)
    this.tuner = null
    if (options.autoTuning?.enabled) {
      // Tuner will be injected after construction to avoid circular dependency
      this.autoTuningConfig = options.autoTuning
    }
  }

  /**
   * Normalize concurrency value (handle 'auto' or numeric)
   * @private
   */
  _normalizeConcurrency (concurrency) {
    if (typeof concurrency === 'number' && concurrency >= 1) {
      return concurrency
    }
    return 10 // Default fallback
  }

  get concurrency () {
    return this._configuredConcurrency
  }

  get effectiveConcurrency () {
    return this._effectiveConcurrency
  }

  /**
   * Default concurrency when 'auto' is requested but tuner isn't attached yet
   * @private
   */
  _defaultAutoConcurrency () {
    try {
      const cpuCount = Math.max(1, cpus()?.length || 0)
      return Math.min(Math.max(cpuCount * 4, 4), 64)
    } catch {
      return 10
    }
  }

  /**
   * Normalize sampling rate between 0 and 1
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
   * Decide if current task should capture detailed metrics
   * @private
   */
  _shouldSampleMetrics () {
    if (!this.monitoring.collectMetrics) {
      return false
    }
    if (this.monitoring.sampleRate <= 0) {
      return false
    }
    if (this.monitoring.sampleRate >= 1) {
      return true
    }
    return Math.random() < this.monitoring.sampleRate
  }

  /**
   * Set auto-tuning engine (injected after construction)
   * @param {AdaptiveTuning} tuner - Auto-tuning engine instance
   */
  setTuner (tuner) {
    this.tuner = tuner
    if (this.autoConcurrency) {
      this._effectiveConcurrency = tuner.getConcurrency()
      this.processNext()
    }
  }

  /**
   * Enqueue an operation for execution
   *
   * Returns a Promise that resolves when the operation completes.
   * The operation is added to the queue and will execute when a slot is available.
   *
   * @param {Function} fn - Async function to execute. Receives a context object:
   *   async ({ signal, metadata, attempt }) => { ... }
   * @param {Object} [options={}] - Operation options
   * @param {number} [options.priority=0] - Priority (higher = executes first)
   * @param {number} [options.retries] - Override default retries
   * @param {number} [options.timeout] - Override default timeout
   * @param {Object} [options.metadata={}] - Metadata for monitoring
   * @returns {Promise} Promise that resolves with operation result
   *
   * @example
   * const result = await pool.enqueue(
   *   async () => await s3.putObject(params),
   *   { priority: 10, retries: 5 }
   * )
   */
  async enqueue (fn, options = {}) {
    let internalDefer = false
    if (options && options[INTERNAL_DEFER]) {
      internalDefer = true
      options = { ...options }
      delete options[INTERNAL_DEFER]
    }

    const collectMetrics = this._shouldSampleMetrics()

    const task = {
      id: nanoid(),
      fn,
      priority: options.priority || 0,
      retries: options.retries ?? this.retries,
      timeout: options.timeout ?? this.timeout,
      metadata: options.metadata || {},
      attemptCount: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      collectMetrics,
      timings: {
        queueWait: null,
        execution: null,
        retryDelays: [],
        total: null,
        failedAttempts: []
      },
      controller: null,
      performance: {
        heapUsedBefore: null,
        heapUsedAfter: null,
        heapDelta: null
      }
    }

    // Create deferred promise
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    task.promise = promise
    task.resolve = (result) => {
      this._recordTaskCompletion(task, result, null)
      resolve(result)
    }
    task.reject = (error) => {
      this._recordTaskCompletion(task, null, error)
      reject(error)
    }

    // Insert by priority
    this._insertByPriority(task)
    this.stats.queueSize = this.queue.length

    // Store metrics if enabled
    // (now handled on completion to avoid storing closures)

    // Start processing
    if (!internalDefer) {
      this.processNext()
    }

    return promise
  }

  /**
   * Add batch of operations (executes all with controlled concurrency)
   *
   * Returns a Promise that resolves when ALL operations complete.
   * More efficient than calling enqueue() in a loop + Promise.all()
   * because it manages the entire batch as a group.
   *
   * @param {Array<Function>} fns - Array of async functions to execute
   * @param {Object} [options={}] - Batch options
   * @param {number} [options.priority=0] - Priority for all operations
   * @param {number} [options.retries] - Override default retries
   * @param {number} [options.timeout] - Override default timeout
   * @param {Function} [options.onItemComplete] - Callback per item completion
   * @param {Function} [options.onItemError] - Callback per item error
   * @returns {Promise<{results: Array, errors: Array}>} Results and errors arrays
   *
   * @example
   * const operations = items.map(item => async () => await client.putObject(item))
   * const { results, errors } = await pool.addBatch(operations)
   */
  async addBatch (fns, options = {}) {
    const results = []
    const errors = []
    const batchId = nanoid()

    // Enqueue all operations
    const promises = fns.map((fn, index) => {
      const taskOptions = {
        priority: options.priority,
        retries: options.retries,
        timeout: options.timeout,
        metadata: { ...options.metadata, batchId, index },
        [INTERNAL_DEFER]: true
      }

      return this.enqueue(fn, taskOptions)
        .then((result) => {
          results.push(result)
          if (options.onItemComplete) {
            options.onItemComplete(result, index)
          }
          return result
        })
        .catch((error) => {
          errors.push({ error, index })
          if (options.onItemError) {
            options.onItemError(error, index)
          }
          throw error // Re-throw to be caught by Promise.allSettled
        })
    })

    if (promises.length > 0) {
      this.processNext()
    }

    // Wait for all to settle (success or failure)
    const settled = await Promise.allSettled(promises)

    // Extract successful results (preserving order)
    const orderedResults = settled.map((s, idx) => {
      if (s.status === 'fulfilled') return s.value
      return null // Failed operations return null
    })

    return { results: orderedResults, errors, batchId }
  }

  /**
   * Process next tasks from queue
   *
   * Core processing loop that:
   * - Checks if new tasks can start (respects concurrency limit)
   * - Starts task execution
   * - Handles task completion/errors
   * - Recursively processes next tasks
   *
   * @private
   */
  processNext () {
    if (this.paused || this.stopped || this.queue.length === 0) {
      this._pendingDrain = false
      return
    }

    if (this._drainInProgress) {
      this._pendingDrain = true
      return
    }

    this._drainInProgress = true
    do {
      this._pendingDrain = false
      this._drainQueue()
    } while (this._pendingDrain && !this.paused && !this.stopped && this.queue.length > 0)
    this._drainInProgress = false
  }

  /**
   * Internal draining loop executed on the next microtask
   * @private
   */
  _drainQueue () {
    while (this._canProcessNext()) {
      const task = this.queue.dequeue()
      if (!task) break
      this.stats.queueSize = this.queue.length

      const taskPromise = this._executeTaskWithRetry(task)
      this.active.set(taskPromise, task)
      this.stats.activeCount = this.active.size
      this.emit('pool:taskStarted', task)

      taskPromise
        .then((result) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.processedCount++
          task.resolve(result)
          this.emit('pool:taskCompleted', task, result)
        })
        .catch((error) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.errorCount++
          task.reject(error)
          this.emit('pool:taskError', task, error)
        })
        .finally(() => {
          this._notifyActiveWaiters()
          this.processNext()

          if (this.active.size === 0 && this.queue.length === 0) {
            this.emit('pool:drained')
          }
        })
    }
  }

  /**
   * Whether a new task can be started right now
   * @private
   */
  _canProcessNext () {
    return (
      !this.paused &&
      !this.stopped &&
      this.active.size < this.effectiveConcurrency &&
      this.queue.length > 0
    )
  }

  /**
   * Execute task with retry logic
   *
   * Implements exponential backoff retry strategy:
   * - Retry delays: 1s, 2s, 4s, 8s, ...
   * - Only retries errors in retryableErrors list
   * - Records metrics for each attempt
   *
   * @private
   * @param {Object} task - Task to execute
   * @returns {Promise} Promise that resolves with result or rejects with final error
   */
  async _executeTaskWithRetry (task) {
    let lastError

    for (let attempt = 0; attempt <= task.retries; attempt++) {
      task.attemptCount = attempt + 1

      // Record start time on first attempt
      if (attempt === 0) {
        task.startedAt = Date.now()
        task.timings.queueWait = task.startedAt - task.createdAt
      }

      // Capture pre-execution metrics
      if (task.collectMetrics && this.memorySampler) {
        task.performance.heapUsedBefore = this._readHeapUsage('before')
      }

      const attemptStartTime = Date.now()
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      task.controller = controller
      task.delayController = null

      try {
        // Execute with timeout and abort support
        const context = this._buildTaskContext(task, controller)
        const executionPromise = Promise.resolve().then(() => task.fn(context))
        const result = await this._executeWithTimeout(
          executionPromise,
          task.timeout,
          task,
          controller
        )

        // Record execution time
        const attemptEndTime = Date.now()
        task.timings.execution = attemptEndTime - attemptStartTime

        // Capture post-execution metrics
        if (task.collectMetrics && this.memorySampler) {
          task.performance.heapUsedAfter = this._readHeapUsage('after')
          task.performance.heapDelta = this._computeHeapDelta(
            task.performance.heapUsedBefore,
            task.performance.heapUsedAfter
          )
        }

        task.controller = null
        return result
      } catch (error) {
        lastError = error

        const attemptEndTime = Date.now()
        const attemptDuration = attemptEndTime - attemptStartTime

        // Record failed attempt
        task.timings.failedAttempts.push({
          attempt: attempt + 1,
          duration: attemptDuration,
          error: error.message
        })

        // Check if retryable
        const isRetryable = this._isErrorRetryable(error)
        const hasRetriesLeft = attempt < task.retries

        if (isRetryable && hasRetriesLeft) {
          this.stats.retryCount++
          this.emit('pool:taskRetry', task, attempt + 1)

          // Adaptive backoff delay
          const delay = this._computeRetryDelay(task, attempt, error)
          if (delay == null) {
            throw error
          }
          const delayStartTime = Date.now()

          const delayController =
            typeof AbortController !== 'undefined' ? new AbortController() : null
          task.delayController = delayController

          await this._sleep(delay, delayController?.signal)

          const delayEndTime = Date.now()
          task.timings.retryDelays.push(delayEndTime - delayStartTime)
          task.delayController = null
        } else {
          // No more retries or not retryable
          throw error
        }
      } finally {
        task.controller = null
        task.delayController = null
      }
    }

    throw lastError
  }

  /**
   * Execute promise with timeout
   *
   * Races the operation against a timeout timer.
   * Automatically clears timeout on completion to prevent memory leaks.
   *
   * @private
   * @param {Promise} promise - Promise to execute
   * @param {number} timeout - Timeout in ms
   * @param {Object} task - Task metadata
   * @returns {Promise} Promise that resolves with result or rejects with timeout error
   */
  async _executeWithTimeout (promise, timeout, task, controller) {
    let timerId

    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        const timeoutError = new Error(`Task ${task.id} timed out after ${timeout}ms`)
        timeoutError.name = 'TimeoutError'
        timeoutError.code = 'EOPERATIONS_TIMEOUT'
        if (controller && typeof controller.abort === 'function') {
          controller.abort(timeoutError)
        }
        reject(timeoutError)
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
   *
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if error should be retried
   */
  _isErrorRetryable (error) {
    // If no retryableErrors list, retry all errors
    if (this.retryableErrors.length === 0) {
      return true
    }

    // Check if error matches any retryable type
    return this.retryableErrors.some((errorType) => {
      return (
        error.name === errorType ||
        error.constructor.name === errorType ||
        error.message.includes(errorType)
      )
    })
  }

  /**
   * Insert task into queue by priority
   *
   * Higher priority tasks are inserted before lower priority.
   * Tasks with same priority maintain FIFO order.
   *
   * @private
   * @param {Object} task - Task to insert
   */
  _insertByPriority (task) {
    this.queue.enqueue(task)
  }

  /**
   * Record task completion metrics
   *
   * @private
   * @param {Object} task - Completed task
   * @param {*} result - Task result (if successful)
   * @param {Error} error - Task error (if failed)
   */
  _recordTaskCompletion (task, result, error) {
    task.completedAt = Date.now()
    task.timings.total = task.completedAt - task.createdAt

    // Calculate overhead (non-execution time)
    const totalRetryDelay = task.timings.retryDelays.reduce((a, b) => a + b, 0)
    task.timings.overhead = task.timings.total - (task.timings.execution || 0) - totalRetryDelay

    // Feed to auto-tuner if enabled
    if (this.tuner) {
      this.tuner.recordTaskMetrics({
        id: task.id,
        startTime: task.startedAt,
        endTime: task.completedAt,
        latency: task.timings.execution || 0,
        queueWait: task.timings.queueWait,
        success: !error,
        retries: task.attemptCount - 1,
        heapDelta: task.performance.heapDelta || 0
      })
    }

    // Persist metrics snapshot if requested
    if (this.monitoring.collectMetrics && task.collectMetrics) {
      this._storeTaskMetrics(task, error)
    }

    // Emit metrics event
    if (this.monitoring.enabled) {
      this.emit('pool:taskMetrics', {
        taskId: task.id,
        timings: task.timings,
        performance: task.performance,
        metadata: task.metadata
      })
    }

    this._recordRollingMetrics(task, error)
  }

  /**
   * Store lightweight snapshot of task metrics without retaining closures
   * @private
   */
  _storeTaskMetrics (task, error) {
    const timingsSnapshot = {
      ...task.timings,
      retryDelays: task.timings.retryDelays.slice(0),
      failedAttempts: task.timings.failedAttempts.map((attempt) => ({ ...attempt }))
    }

    const performanceSnapshot = task.performance
      ? { ...task.performance }
      : { heapUsedBefore: null, heapUsedAfter: null, heapDelta: null }

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
    })

    if (this.taskMetrics.size > 1000) {
      const oldestKey = this.taskMetrics.keys().next().value
      this.taskMetrics.delete(oldestKey)
    }
  }

  _recordRollingMetrics (task, error) {
    const entry = {
      queueWait: task.timings.queueWait || 0,
      execution: task.timings.execution || 0,
      retries: (task.attemptCount || 1) - 1,
      success: !error
    }

    this.rollingMetrics?.push(entry)
    this.rollingWindow?.record(task.completedAt || Date.now(), entry.success)
    this._syncQueueAging()
  }

  /**
   * Pause queue processing
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
    this.emit('pool:paused')
  }

  /**
   * Resume queue processing
   */
  resume () {
    this.paused = false
    this.processNext()
    this.emit('pool:resumed')
  }

  /**
   * Stop queue processing
   *
   * Cancels all pending tasks with rejection.
   * Active tasks will complete.
   */
  stop () {
    this.stopped = true

    // Reject all pending tasks
    this.queue.flush((task) => {
      task.reject(new Error('Task cancelled by stop()'))
    })
    this.stats.queueSize = this.queue.length

    this.active.forEach((task) => {
      if (task.controller && typeof task.controller.abort === 'function') {
        task.controller.abort(new Error('Task cancelled by stop()'))
      }
      if (task.delayController && typeof task.delayController.abort === 'function') {
        task.delayController.abort(new Error('Task cancelled by stop()'))
      }
    })

    this.emit('pool:stopped')
  }

  /**
   * Drain queue (wait for all tasks to complete)
   *
   * Waits for both queued and active tasks to finish.
   * Resolves when queue is empty and no tasks are active.
   *
   * @returns {Promise<void>}
   */
  async drain () {
    while (this.queue.length > 0 || this.active.size > 0) {
      await this._waitForActive()
    }
    this.emit('pool:drained')
  }

  /**
   * Wait for active tasks to complete
   *
   * @private
   * @returns {Promise<void>}
   */
  async _waitForActive () {
    if (this.active.size === 0) return
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
   * Set concurrency limit
   *
   * Can be called at runtime to adjust concurrency.
   * New limit takes effect immediately.
   *
   * @param {number} n - New concurrency limit (must be >= 1)
   */
  setConcurrency (n) {
    if (n === 'auto') {
      this.autoConcurrency = true
      this._configuredConcurrency = 'auto'
      this._effectiveConcurrency = this._defaultAutoConcurrency()
      this.processNext()
      return
    }

    if (typeof n !== 'number' || n < 1) {
      throw new Error('Concurrency must be >= 1')
    }

    const normalized = this._normalizeConcurrency(n)
    this.autoConcurrency = false
    this._configuredConcurrency = normalized
    this._effectiveConcurrency = normalized
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
      queueSize: this.queue.length,
      activeCount: this.active.size,
      concurrency: this.concurrency,
      effectiveConcurrency: this.effectiveConcurrency,
      paused: this.paused,
      stopped: this.stopped,
      rolling: this.getRollingMetrics()
    }
  }

  /**
   * Get task metrics by ID
   *
   * @param {string} taskId - Task ID
   * @returns {Object|undefined} Task metrics
   */
  getTaskMetrics (taskId) {
    return this.taskMetrics.get(taskId)
  }

  getRollingMetrics () {
    return {
      samples: this.rollingMetrics?.snapshot() || null,
      throughput: this.rollingWindow?.snapshot() || null
    }
  }

  /**
   * Get aggregate metrics
   *
   * @param {number} [since=0] - Only include tasks completed after this timestamp
   * @returns {Object|null} Aggregate metrics
   */
  getAggregateMetrics (since = 0) {
    const tasks = Array.from(this.taskMetrics.values()).filter(
      (t) => t.completedAt && t.completedAt > since
    )

    if (tasks.length === 0) return null

    return {
      count: tasks.length,

      // Timing stats
      avgQueueWait: this._avg(tasks.map((t) => t.timings.queueWait)),
      avgExecution: this._avg(tasks.map((t) => t.timings.execution || 0)),
      avgTotal: this._avg(tasks.map((t) => t.timings.total)),

      p50Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.5),
      p95Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.95),
      p99Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.99),

      // Performance stats
      avgHeapDelta: this._avg(tasks.map((t) => t.performance.heapDelta || 0)),

      // Error stats
      errorRate: tasks.filter((t) => t.timings.failedAttempts?.length > 0).length / tasks.length,
      avgRetries: this._avg(tasks.map((t) => (t.attemptCount || 1) - 1)),

      // Auto-tuning stats
      autoTuning: this.tuner ? this.tuner.getMetrics() : null
    }
  }

  /**
   * Calculate average
   * @private
   */
  _avg (arr) {
    if (arr.length === 0) return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  /**
   * Calculate percentile
   * @private
   */
  _percentile (arr, p) {
    if (arr.length === 0) return 0
    const sorted = arr.slice().sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[Math.max(0, index)]
  }

  /**
   * Sleep for specified duration
   * @private
   */
  _sleep (ms, signal) {
    if (signal && typeof signal.aborted !== 'undefined') {
      return delay(ms, undefined, { signal })
    }
    return delay(ms)
  }

  /**
   * Create the context object passed to task functions.
   * Includes AbortSignal so callers can cancel upstream operations.
   * @private
   */
  _buildTaskContext (task, controller) {
    return {
      id: task.id,
      attempt: task.attemptCount,
      retries: task.retries,
      metadata: task.metadata,
      signal: controller?.signal
    }
  }

  _readHeapUsage (stage) {
    if (!this.memorySampler) return null
    if (this.monitoring.mode === 'full') {
      return this.memorySampler.sampleNow()
    }
    if (this.monitoring.mode === 'balanced') {
      return stage === 'after'
        ? this.memorySampler.maybeSample()
        : this.memorySampler.snapshot()
    }
    return this.memorySampler.snapshot()
  }

  _computeHeapDelta (before, after) {
    if (typeof before !== 'number' || typeof after !== 'number') {
      return null
    }
    return after - before
  }

  _computeRetryDelay (task, attempt, error) {
    const base = this.retryDelay * Math.pow(2, attempt)
    const saturation =
      (this.queue.length + this.active.size) / Math.max(1, this.effectiveConcurrency)

    if (saturation >= this.retryStrategy.pressureSkipThreshold) {
      return null
    }

    let delay = base
    const latencyTarget = this._latencyTargetMs()

    if (
      saturation >= this.retryStrategy.pressureClampThreshold ||
      (task.timings.queueWait || 0) > latencyTarget
    ) {
      delay = Math.min(delay, this.retryStrategy.clampDelay)
    }

    if (this._isTransientNetworkError(error)) {
      delay = Math.max(this.retryStrategy.minDelay, delay * 0.5)
    }

    if (this.retryStrategy.jitter) {
      const jitterWindow = Math.max(1, delay * 0.2)
      delay = delay - jitterWindow / 2 + Math.random() * jitterWindow
    }

    delay = Math.min(Math.max(delay, this.retryStrategy.minDelay), this.retryStrategy.maxDelay)
    return delay
  }

  _isTransientNetworkError (error = {}) {
    const message = `${error.name || ''} ${error.code || ''} ${error.message || ''}`
    return /timeout|network|throttl|slowdown|temporarily unavailable/i.test(message)
  }

  _latencyTargetMs () {
    if (this.tuner && typeof this.tuner.getTargetLatency === 'function') {
      const target = this.tuner.getTargetLatency()
      if (typeof target === 'number' && target > 0) {
        return target
      }
    }
    if (this.autoTuningConfig?.targetLatency) {
      return this.autoTuningConfig.targetLatency
    }
    return this.retryStrategy.latencyTarget
  }

  _syncQueueAging () {
    if (!this.queue?.setAgingMultiplier || !this.rollingMetrics) {
      return
    }
    const snapshot = this.rollingMetrics.snapshot()
    if (!snapshot.sampleSize) return
    const target = this._latencyTargetMs()
    if (!target) return
    const ratio = snapshot.avgQueueWait / Math.max(1, target)
    const multiplier = Math.min(4, Math.max(0.25, ratio || 1))
    this.queue.setAgingMultiplier(multiplier)
  }
}

class PriorityTaskQueue {
  constructor (options = {}) {
    this.heap = []
    this.counter = 0
    this.agingMs = options.agingMs ?? 0
    this.maxAgingBoost = options.maxAgingBoost ?? 0
    this.agingMultiplier = 1
  }

  get length () {
    return this.heap.length
  }

  enqueue (task) {
    const node = {
      task,
      priority: task.priority || 0,
      order: this.counter++,
      enqueuedAt: Date.now()
    }
    this.heap.push(node)
    this._bubbleUp(this.heap.length - 1)
  }

  dequeue () {
    if (this.heap.length === 0) {
      return null
    }
    const topNode = this.heap[0]
    const lastNode = this.heap.pop()
    if (this.heap.length > 0 && lastNode) {
      this.heap[0] = lastNode
      this._bubbleDown(0)
    }
    return topNode.task
  }

  flush (callback) {
    if (typeof callback === 'function') {
      for (const node of this.heap) {
        callback(node.task)
      }
    }
    this.clear()
  }

  clear () {
    this.heap.length = 0
  }

  setAgingMultiplier (multiplier) {
    if (typeof multiplier !== 'number' || Number.isNaN(multiplier)) {
      return
    }
    this.agingMultiplier = Math.min(4, Math.max(0.25, multiplier))
  }

  _bubbleUp (index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this._isHigherPriority(this.heap[parentIndex], this.heap[index])) {
        break
      }
      this._swap(index, parentIndex)
      index = parentIndex
    }
  }

  _bubbleDown (index) {
    const length = this.heap.length
    while (true) {
      const left = index * 2 + 1
      const right = index * 2 + 2
      let largest = index

      if (left < length && this._isHigherPriority(this.heap[left], this.heap[largest])) {
        largest = left
      }

      if (right < length && this._isHigherPriority(this.heap[right], this.heap[largest])) {
        largest = right
      }

      if (largest === index) {
        break
      }

      this._swap(index, largest)
      index = largest
    }
  }

  _isHigherPriority (nodeA, nodeB) {
    if (!nodeB) return true
    const priorityA = this._effectivePriority(nodeA)
    const priorityB = this._effectivePriority(nodeB)
    if (priorityA === priorityB) {
      return nodeA.order < nodeB.order
    }
    return priorityA > priorityB
  }

  _swap (i, j) {
    const tmp = this.heap[i]
    this.heap[i] = this.heap[j]
    this.heap[j] = tmp
  }

  _effectivePriority (node) {
    const agingBase = this.agingMs * this.agingMultiplier
    if (!agingBase || this.maxAgingBoost <= 0) {
      return node.priority
    }
    const waited = Math.max(0, Date.now() - node.enqueuedAt)
    const bonus = Math.min(this.maxAgingBoost, waited / agingBase)
    return node.priority + bonus
  }
}

class MemorySampler {
  constructor (interval = 100) {
    this.interval = Math.max(25, interval)
    this.lastSampleTime = 0
    this.lastSample = { heapUsed: 0 }
    this.sampleNow()
  }

  snapshot () {
    return this.lastSample.heapUsed
  }

  maybeSample () {
    if (Date.now() - this.lastSampleTime >= this.interval) {
      return this.sampleNow()
    }
    return this.snapshot()
  }

  sampleNow () {
    this.lastSample = process.memoryUsage()
    this.lastSampleTime = Date.now()
    return this.lastSample.heapUsed
  }
}

class RollingMetrics {
  constructor (size = 256) {
    this.size = size
    this.entries = new Array(size)
    this.index = 0
    this.length = 0
    this.sums = {
      queueWait: 0,
      execution: 0,
      retries: 0
    }
    this.errorCount = 0
  }

  push (entry) {
    const old = this.entries[this.index]
    if (old) {
      this.sums.queueWait -= old.queueWait
      this.sums.execution -= old.execution
      this.sums.retries -= old.retries
      if (!old.success) {
        this.errorCount--
      }
    }

    this.entries[this.index] = entry
    this.index = (this.index + 1) % this.size
    if (this.length < this.size) {
      this.length++
    }

    this.sums.queueWait += entry.queueWait
    this.sums.execution += entry.execution
    this.sums.retries += entry.retries
    if (!entry.success) {
      this.errorCount++
    }
  }

  snapshot () {
    if (this.length === 0) {
      return {
        sampleSize: 0,
        avgQueueWait: 0,
        avgExecution: 0,
        avgRetries: 0,
        errorRate: 0
      }
    }
    return {
      sampleSize: this.length,
      avgQueueWait: this.sums.queueWait / this.length,
      avgExecution: this.sums.execution / this.length,
      avgRetries: this.sums.retries / this.length,
      errorRate: this.errorCount / this.length
    }
  }
}

class RollingWindow {
  constructor (windowMs = 1000) {
    this.windowMs = Math.max(250, windowMs)
    this.events = []
  }

  record (timestamp = Date.now(), success = true) {
    this.events.push({ timestamp, success })
    this._prune()
  }

  snapshot () {
    this._prune()
    const count = this.events.length
    if (count === 0) {
      return {
        windowMs: this.windowMs,
        throughputPerSec: 0,
        successRate: 1
      }
    }
    const now = Date.now()
    const effectiveWindow = Math.max(1, Math.min(this.windowMs, now - this.events[0].timestamp))
    const throughputPerSec = (count / effectiveWindow) * 1000
    const successCount = this.events.filter((e) => e.success).length
    return {
      windowMs: this.windowMs,
      throughputPerSec,
      successRate: successCount / count
    }
  }

  _prune () {
    const cutoff = Date.now() - this.windowMs
    while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
      this.events.shift()
    }
  }
}
