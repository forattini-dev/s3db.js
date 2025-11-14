/**
 * PerformanceMonitor - Production monitoring with periodic snapshots
 *
 * Collects periodic snapshots of:
 * - Task queue performance (queue size, active count, throughput)
 * - System metrics (memory, CPU)
 * - Aggregate statistics (avg latency, error rate)
 *
 * Use for production monitoring and performance analysis.
 *
 * @class PerformanceMonitor
 *
 * @example
 * const monitor = new PerformanceMonitor(database)
 * monitor.start(10000) // snapshot every 10s
 *
 * setTimeout(() => {
 *   const report = monitor.getReport()
 *   console.log(report)
 *   monitor.stop()
 * }, 3600000) // 1 hour
 */
export class PerformanceMonitor {
  /**
   * Create PerformanceMonitor instance
   *
   * @param {Database} database - Database instance to monitor
   */
  constructor (database) {
    this.db = database
    this.snapshots = []
    this.intervalId = null
  }

  /**
   * Start monitoring
   *
   * Takes snapshots at specified interval.
   *
   * @param {number} [intervalMs=10000] - Snapshot interval in ms
   */
  start (intervalMs = 10000) {
    this.intervalId = setInterval(() => {
      this.takeSnapshot()
    }, intervalMs)
  }

  /**
   * Stop monitoring
   */
  stop () {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Take snapshot
   *
   * Captures current state of task queue, performance metrics, and system.
   *
   * @returns {Object} Snapshot object
   */
  takeSnapshot () {
    const snapshot = {
      timestamp: Date.now(),

      // Task queue metrics (if available)
      taskQueue: this.db.client.getQueueStats ? this.db.client.getQueueStats() : null,

      // Aggregate performance (if available)
      performance: this.db.client.getAggregateMetrics ? this.db.client.getAggregateMetrics() : null,

      // System metrics
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      }
    }

    this.snapshots.push(snapshot)

    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots.shift()
    }

    // Log summary
    if (snapshot.taskQueue) {
      console.log(`[PerformanceMonitor] ${new Date().toISOString()}`)
      console.log(
        `  Queue: ${snapshot.taskQueue.queueSize} pending, ${snapshot.taskQueue.activeCount} active`
      )
      if (snapshot.performance) {
        console.log(
          `  Performance: ${snapshot.performance.avgExecution.toFixed(0)}ms avg, ${snapshot.performance.p95Execution.toFixed(0)}ms p95`
        )
      }
      console.log(`  Concurrency: ${snapshot.taskQueue.concurrency}`)
      console.log(`  Memory: ${(snapshot.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`)
    }

    return snapshot
  }

  /**
   * Get aggregate report
   *
   * Aggregates metrics across all snapshots.
   *
   * @returns {Object|null} Report object (or null if no snapshots)
   */
  getReport () {
    if (this.snapshots.length === 0) return null

    const first = this.snapshots[0]
    const last = this.snapshots[this.snapshots.length - 1]

    // Calculate task queue aggregates
    let taskQueue = null
    if (first.taskQueue && last.taskQueue) {
      taskQueue = {
        totalProcessed: last.taskQueue.processedCount - first.taskQueue.processedCount,
        totalErrors: last.taskQueue.errorCount - first.taskQueue.errorCount,
        avgQueueSize: this._avg(this.snapshots.map((s) => s.taskQueue?.queueSize || 0)),
        avgConcurrency: this._avg(this.snapshots.map((s) => s.taskQueue?.concurrency || 0))
      }
    }

    // Calculate performance aggregates
    let performance = null
    if (this.snapshots.some((s) => s.performance)) {
      const perfSnapshots = this.snapshots.filter((s) => s.performance)
      performance = {
        avgLatency: this._avg(perfSnapshots.map((s) => s.performance.avgExecution)),
        p95Latency: this._avg(perfSnapshots.map((s) => s.performance.p95Execution))
      }
    }

    // Calculate system aggregates
    const system = {
      avgMemoryMB: this._avg(this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024,
      peakMemoryMB: Math.max(...this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024
    }

    return {
      duration: last.timestamp - first.timestamp,
      snapshots: this.snapshots.length,
      taskQueue,
      performance,
      system
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
