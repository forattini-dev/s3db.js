import os from 'os'

/**
 * AdaptiveTuning - Auto-tuning engine for OperationPool concurrency
 *
 * Adjusts concurrency based on observed performance metrics:
 * - Latency (target: keep operations fast)
 * - Memory usage (target: avoid pressure)
 * - Throughput (target: maximize work done)
 *
 * Strategy:
 * 1. Start conservative (50% of memory-based estimate)
 * 2. Monitor latency, memory, throughput
 * 3. Adjust every N seconds based on conditions
 * 4. Respect min/max bounds
 *
 * @class AdaptiveTuning
 */
export class AdaptiveTuning {
  /**
   * Create AdaptiveTuning instance
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.minConcurrency=1] - Minimum concurrency
   * @param {number} [options.maxConcurrency=100] - Maximum concurrency
   * @param {number} [options.targetLatency=200] - Target average latency (ms)
   * @param {number} [options.targetMemoryPercent=0.7] - Target max memory usage (0-1)
   * @param {number} [options.adjustmentInterval=5000] - Re-evaluate interval (ms)
   */
  constructor (options = {}) {
    this.minConcurrency = options.minConcurrency || 1
    this.maxConcurrency = options.maxConcurrency || 100
    this.targetLatency = options.targetLatency || 200
    this.targetMemoryPercent = options.targetMemoryPercent || 0.7
    this.adjustmentInterval = options.adjustmentInterval || 5000

    // Metrics tracking
    this.metrics = {
      latencies: [],
      throughputs: [],
      memoryUsages: [],
      errorRates: [],
      concurrencyHistory: []
    }

    // Current state
    this.currentConcurrency = this.suggestInitial()
    this.lastAdjustment = Date.now()

    // Monitoring loop
    this.intervalId = null
    this.startMonitoring()
  }

  /**
   * Suggest initial concurrency based on system memory
   *
   * Formula:
   * - <512MB: 2
   * - <1GB: 5
   * - <2GB: 10
   * - <4GB: 20
   * - <8GB: 30
   * - >=8GB: 50
   *
   * Then reduce to 50% for conservative start
   *
   * @returns {number} Suggested initial concurrency
   */
  suggestInitial () {
    const totalMemoryMB = os.totalmem() / 1024 / 1024
    const freeMemoryMB = os.freemem() / 1024 / 1024
    const usedPercent = (totalMemoryMB - freeMemoryMB) / totalMemoryMB

    let suggested

    if (totalMemoryMB < 512) {
      suggested = 2
    } else if (totalMemoryMB < 1024) {
      suggested = 5
    } else if (totalMemoryMB < 2048) {
      suggested = 10
    } else if (totalMemoryMB < 4096) {
      suggested = 20
    } else if (totalMemoryMB < 8192) {
      suggested = 30
    } else {
      // Cap max suggestion to 20 to prevent freezing on high-memory machines
      suggested = 20
    }

    // Reduce if memory usage is already high
    if (usedPercent > 0.8) {
      suggested = Math.max(1, Math.floor(suggested * 0.5))
    } else if (usedPercent > 0.7) {
      suggested = Math.max(1, Math.floor(suggested * 0.7))
    }

    // Start conservative (50% of suggestion), but hard cap at 20
    suggested = Math.min(Math.max(this.minConcurrency, Math.floor(suggested * 0.5)), 20)

    return suggested
  }

  /**
   * Record task metrics for analysis
   *
   * Called by OperationPool after each task completes.
   *
   * @param {Object} task - Task metrics
   * @param {number} task.latency - Execution time (ms)
   * @param {number} task.queueWait - Time in queue (ms)
   * @param {boolean} task.success - Whether task succeeded
   * @param {number} task.retries - Number of retries
   * @param {number} task.heapDelta - Memory delta (bytes)
   */
  recordTaskMetrics (task) {
    const memoryUsed = process.memoryUsage().heapUsed / os.totalmem()

    this.metrics.latencies.push(task.latency)
    this.metrics.memoryUsages.push(memoryUsed)

    // Keep only last 100 measurements
    if (this.metrics.latencies.length > 100) {
      this.metrics.latencies.shift()
      this.metrics.memoryUsages.shift()
    }

    // Calculate throughput (tasks per second over last 1s window)
    const now = Date.now()
    const windowMs = 1000
    const recentTasks = this.metrics.latencies.filter((_, i) => {
      // Approximate: assume uniform distribution
      return i >= this.metrics.latencies.length - 10
    }).length

    const throughput = (recentTasks / windowMs) * 1000
    this.metrics.throughputs.push(throughput)
    if (this.metrics.throughputs.length > 100) {
      this.metrics.throughputs.shift()
    }
  }

  /**
   * Start monitoring loop
   *
   * Calls adjust() every adjustmentInterval
   * @private
   */
  startMonitoring () {
    // Use unref() to prevent the interval from keeping the process alive
    // This is critical for tests - without unref(), Jest workers hang
    this.intervalId = setInterval(() => {
      this.adjust()
    }, this.adjustmentInterval)

    // Allow Node.js to exit even if interval is running
    if (this.intervalId.unref) {
      this.intervalId.unref()
    }
  }

  /**
   * Adjust concurrency based on metrics
   *
   * Decision logic:
   * 1. Memory pressure (highest priority) → decrease 20%
   * 2. High latency (1.5x target) → decrease 10%
   * 3. Good performance (low latency, low memory) → increase 20%
   * 4. Slight latency increase (1.2x target) → decrease 5%
   *
   * @returns {number|null} New concurrency (or null if no change)
   */
  adjust () {
    // Need at least 10 data points
    if (this.metrics.latencies.length < 10) {
      return null
    }

    // Calculate averages
    const avgLatency = this._avg(this.metrics.latencies)
    const avgMemory = this._avg(this.metrics.memoryUsages)
    const avgThroughput = this._avg(this.metrics.throughputs)

    let adjustment = 0
    let reason = ''

    // === DECISION LOGIC ===

    // 1. Memory pressure (highest priority)
    if (avgMemory > this.targetMemoryPercent) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.2) // reduce 20%
      reason = `memory pressure (${(avgMemory * 100).toFixed(1)}%)`
    }

    // 2. Latency too high (second priority)
    else if (avgLatency > this.targetLatency * 1.5) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.1) // reduce 10%
      reason = `high latency (${avgLatency.toFixed(0)}ms)`
    }

    // 3. Latency good, memory OK → try increasing
    else if (avgLatency < this.targetLatency * 0.5 && avgMemory < this.targetMemoryPercent * 0.8) {
      adjustment = Math.ceil(this.currentConcurrency * 0.2) // increase 20%
      reason = 'good performance, scaling up'
    }

    // 4. Latency slightly high but not critical
    else if (avgLatency > this.targetLatency * 1.2) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.05) // reduce 5%
      reason = 'slight latency increase'
    }

    // Apply adjustment
    if (adjustment !== 0) {
      const newConcurrency = Math.max(
        this.minConcurrency,
        Math.min(this.maxConcurrency, this.currentConcurrency + adjustment)
      )

      if (newConcurrency !== this.currentConcurrency) {
        const oldConcurrency = this.currentConcurrency
        this.currentConcurrency = newConcurrency
        this.lastAdjustment = Date.now()

        // Record adjustment in history
        this.metrics.concurrencyHistory.push({
          timestamp: Date.now(),
          old: oldConcurrency,
          new: newConcurrency,
          reason,
          metrics: {
            avgLatency,
            avgMemory,
            avgThroughput
          }
        })

        // Keep only last 100 adjustments
        if (this.metrics.concurrencyHistory.length > 100) {
          this.metrics.concurrencyHistory.shift()
        }

        return newConcurrency
      }
    }

    return null // no adjustment
  }

  /**
   * Get current concurrency
   *
   * @returns {number} Current concurrency value
   */
  getConcurrency () {
    return this.currentConcurrency
  }

  /**
   * Get metrics summary
   *
   * @returns {Object} Metrics summary
   */
  getMetrics () {
    if (this.metrics.latencies.length === 0) {
      return {
        current: this.currentConcurrency,
        avgLatency: 0,
        avgMemory: 0,
        avgThroughput: 0,
        history: []
      }
    }

    return {
      current: this.currentConcurrency,
      avgLatency: this._avg(this.metrics.latencies),
      avgMemory: this._avg(this.metrics.memoryUsages),
      avgThroughput: this._avg(this.metrics.throughputs),
      history: this.metrics.concurrencyHistory.slice(-10) // last 10 adjustments
    }
  }

  /**
   * Stop monitoring loop
   */
  stop () {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
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
}
