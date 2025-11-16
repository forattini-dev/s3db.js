/**
 * Benchmark - Performance measurement utilities
 *
 * Provides timing utilities for measuring function execution:
 * - Single measurements
 * - Repeated measurements with statistics
 * - Percentile calculations (p50, p95, p99)
 * - Formatted reporting
 *
 * 🪵 INTENTIONAL CONSOLE USAGE
 * This file uses console.log for benchmark reporting and formatted
 * performance output. These calls are NOT migrated to Pino logger as
 * they are designed for direct terminal output with performance metrics.
 *
 * @class Benchmark
 *
 * @example
 * const bench = new Benchmark('My Operation')
 * await bench.measure(async () => {
 *   await someOperation()
 * })
 * bench.report()
 */
export class Benchmark {
  /**
   * Create Benchmark instance
   *
   * @param {string} name - Benchmark name
   */
  constructor (name) {
    this.name = name
    this.startTime = null
    this.endTime = null
    this.results = []
  }

  /**
   * Start timing
   */
  start () {
    this.startTime = Date.now()
  }

  /**
   * End timing
   *
   * @returns {number} Elapsed time in ms
   */
  end () {
    this.endTime = Date.now()
    return this.elapsed()
  }

  /**
   * Get elapsed time
   *
   * @returns {number} Elapsed time in ms
   */
  elapsed () {
    return this.endTime - this.startTime
  }

  /**
   * Measure single execution
   *
   * @param {Function} fn - Async function to measure
   * @returns {Promise<*>} Function result
   *
   * @example
   * const result = await bench.measure(async () => {
   *   return await operation()
   * })
   */
  async measure (fn) {
    this.start()
    const result = await fn()
    this.end()

    this.results.push({
      duration: this.elapsed(),
      timestamp: Date.now()
    })

    return result
  }

  /**
   * Measure repeated executions
   *
   * Returns statistics including avg, min, max, percentiles.
   *
   * @param {Function} fn - Async function to measure
   * @param {number} [iterations=10] - Number of iterations
   * @returns {Promise<Object>} Statistics object
   *
   * @example
   * const stats = await bench.measureRepeated(
   *   async () => await operation(),
   *   100
   * )
   * console.log(stats.avg, stats.p95)
   */
  async measureRepeated (fn, iterations = 10) {
    const results = []

    for (let i = 0; i < iterations; i++) {
      this.start()
      await fn()
      this.end()

      results.push(this.elapsed())
    }

    return {
      iterations,
      results,
      avg: results.reduce((a, b) => a + b, 0) / results.length,
      min: Math.min(...results),
      max: Math.max(...results),
      p50: this.percentile(results, 0.5),
      p95: this.percentile(results, 0.95),
      p99: this.percentile(results, 0.99)
    }
  }

  /**
   * Calculate percentile
   *
   * @param {Array<number>} arr - Array of numbers
   * @param {number} p - Percentile (0-1)
   * @returns {number} Percentile value
   *
   * @example
   * const p95 = bench.percentile([10, 20, 30, 40, 50], 0.95)
   */
  percentile (arr, p) {
    if (arr.length === 0) return 0
    const sorted = arr.slice().sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[Math.max(0, index)]
  }

  /**
   * Report results
   *
   * Logs formatted benchmark report to console.
   */
  report () {
    console.log(`\n[Benchmark] ${this.name}`)
    console.log(`  Duration: ${this.elapsed()}ms`)
    console.log(`  Runs: ${this.results.length}`)

    if (this.results.length > 1) {
      const durations = this.results.map((r) => r.duration)
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)}ms`)
      console.log(`  Min: ${Math.min(...durations)}ms`)
      console.log(`  Max: ${Math.max(...durations)}ms`)
    }
  }
}

/**
 * Quick benchmark helper (one-liner)
 *
 * @param {string} name - Benchmark name
 * @param {Function} fn - Async function to measure
 * @returns {Promise<Benchmark>} Benchmark instance
 *
 * @example
 * await benchmark('Bulk Insert', async () => {
 *   await users.insertMany(items)
 * })
 */
export async function benchmark (name, fn) {
  const b = new Benchmark(name)
  await b.measure(fn)
  b.report()
  return b
}
