import { EventEmitter } from 'events'
import { nanoid } from 'nanoid'
import { TaskExecutor } from './concurrency/task-executor.interface.js' // eslint-disable-line no-unused-vars

class PriorityTaskQueue {
  constructor () {
    this.heap = []
    this.counter = 0
  }

  get length () {
    return this.heap.length
  }

  enqueue (task) {
    const node = {
      task,
      priority: task.priority || 0,
      order: this.counter++
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
    if (nodeA.priority === nodeB.priority) {
      return nodeA.order < nodeB.order
    }
    return nodeA.priority > nodeB.priority
  }

  _swap (i, j) {
    const tmp = this.heap[i]
    this.heap[i] = this.heap[j]
    this.heap[j] = tmp
  }
}

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

    this.concurrency = options.concurrency || 5
    this.retries = options.retries ?? 3
    this.retryDelay = options.retryDelay || 1000
    this.timeout = options.timeout ?? 30000
    this.retryableErrors = options.retryableErrors || []

    this.queue = new PriorityTaskQueue()
    this.active = new Map()
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

    this.processedItems = []
    this.taskMetrics = new Map()
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
   * @returns {Promise} Promise that resolves with result
   *
   * @example
   * const result = await manager.enqueue(
   *   async () => await someOperation(),
   *   { priority: 10, retries: 5 }
   * )
   */
  async enqueue (fn, options = {}) {
    const task = {
      id: nanoid(),
      fn,
      priority: options.priority || 0,
      retries: options.retries ?? this.retries,
      timeout: options.timeout ?? this.timeout,
      metadata: options.metadata || {},
      attemptCount: 0,
      createdAt: Date.now()
    }

    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    task.promise = promise
    task.resolve = resolve
    task.reject = reject

    this._insertByPriority(task)
    this.stats.queueSize = this.queue.length

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

      const promise = this.enqueue(
        async () => {
          return await processor(item, index, this)
        },
        {
          priority: options.priority,
          retries: options.retries,
          timeout: options.timeout,
          metadata: { item, index }
        }
      )
        .then((result) => {
          results.push(result)
          options.onItemComplete?.(item, result)
          reportProgress(item)
        })
        .catch((error) => {
          errors.push({ item, error, index })
          options.onItemError?.(item, error)
          reportProgress(item)
        })

      index++

      // Don't consume next item until there's a slot
      await this._waitForSlot()
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
          metadata: { item, index }
        }
      )
        .then((result) => {
          results[index] = result
        })
        .catch((error) => {
          results[index] = TasksRunner.failed
          options.onItemError?.(item, error)
        })

      await this._waitForSlot()
    }

    await this.drain()

    return results
  }

  /**
   * Process next tasks from queue
   * @private
   */
  processNext () {
    while (!this.paused && !this.stopped && this.active.size < this.concurrency && this.queue.length > 0) {
      const task = this.queue.dequeue()
      this.stats.queueSize = this.queue.length

      const taskPromise = this._executeTaskWithRetry(task)

      this.active.set(taskPromise, task)
      this.stats.activeCount = this.active.size
      this.emit('taskStart', task)

      taskPromise
        .then((result) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.processedCount++
          this.processedItems.push(task.metadata.item)
          task.resolve(result)
          this.emit('taskComplete', task, result)
        })
        .catch((error) => {
          this.active.delete(taskPromise)
          this.stats.activeCount = this.active.size
          this.stats.errorCount++
          task.reject(error)
          this.emit('taskError', task, error)
        })
        .finally(() => {
          this._notifyActiveWaiters()
          this.processNext()

          if (this.active.size === 0 && this.queue.length === 0) {
            this.emit('drained')
          }
        })
    }
  }

  /**
   * Execute task with retry logic
   * @private
   */
  async _executeTaskWithRetry (task) {
    let lastError

    for (let attempt = 0; attempt <= task.retries; attempt++) {
      task.attemptCount = attempt + 1

      try {
        const result = await this._executeWithTimeout(task.fn(), task.timeout, task)
        return result
      } catch (error) {
        lastError = error

        const isRetryable = this._isErrorRetryable(error)
        const hasRetriesLeft = attempt < task.retries

        if (isRetryable && hasRetriesLeft) {
          this.stats.retryCount++
          this.emit('taskRetry', task, attempt + 1)

          const delay = this.retryDelay * Math.pow(2, attempt)
          await this._sleep(delay)
        } else {
          throw error
        }
      }
    }

    throw lastError
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
    if (this.retryableErrors.length === 0) {
      return true
    }

    return this.retryableErrors.some((errorType) => {
      return error.name === errorType || error.constructor.name === errorType || error.message.includes(errorType)
    })
  }

  /**
   * Insert task by priority
   * @private
   */
  _insertByPriority (task) {
    this.queue.enqueue(task)
  }

  /**
   * Wait for processing slot
   * @private
   */
  async _waitForSlot () {
    while (this.active.size >= this.concurrency) {
      await this._waitForActive()
    }
  }

  /**
   * Wait for active tasks
   * @private
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
   * Sleep
   * @private
   */
  _sleep (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
    this.emit('paused')
  }

  /**
   * Resume processing
   */
  resume () {
    this.paused = false
    this.processNext()
    this.emit('resumed')
  }

  /**
   * Stop processing
   *
   * Cancels all pending tasks with rejection.
   * Active tasks will complete.
   */
  stop () {
    this.stopped = true

    this.queue.flush((task) => {
      task.reject(new Error('Task cancelled by stop()'))
    })
    this.stats.queueSize = this.queue.length
    this.emit('stopped')
  }

  /**
   * Drain queue (wait for all tasks to complete)
   *
   * @returns {Promise<void>}
   */
  async drain () {
    while (this.queue.length > 0 || this.active.size > 0) {
      await this._waitForActive()
    }
    this.emit('drained')
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
      queueSize: this.queue.length,
      activeCount: this.active.size
    }
  }

  /**
   * Get progress information
   *
   * @returns {Object} Progress information
   */
  getProgress () {
    const total = this.stats.processedCount + this.stats.errorCount + this.queue.length + this.active.size
    const completed = this.stats.processedCount + this.stats.errorCount

    return {
      total,
      completed,
      pending: this.queue.length,
      active: this.active.size,
      percentage: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
    }
  }

  /**
   * Reset manager (clear state)
   */
  reset () {
    this.queue = new PriorityTaskQueue()
    this.active.clear()
    this.paused = false
    this.stopped = false
    this.processedItems = []
    this.taskMetrics.clear()
    this._activeWaiters = []

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
