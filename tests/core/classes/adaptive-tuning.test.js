import { AdaptiveTuning } from '../../../src/concerns/adaptive-tuning.js'
import os from 'os'

describe('AdaptiveTuning', () => {
  let tuner

  beforeEach(() => {
    tuner = new AdaptiveTuning({
      minConcurrency: 1,
      maxConcurrency: 50,
      targetLatency: 200,
      targetMemoryPercent: 0.7,
      adjustmentInterval: 100 // Fast for tests
    })
  })

  afterEach(() => {
    if (tuner) {
      tuner.stop()
    }
  })

  // Helper: sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  describe('Constructor and Configuration', () => {
    test('should create tuner with default config', () => {
      const defaultTuner = new AdaptiveTuning()
      expect(defaultTuner.minConcurrency).toBe(1)
      expect(defaultTuner.maxConcurrency).toBe(100)
      expect(defaultTuner.targetLatency).toBe(200)
      expect(defaultTuner.targetMemoryPercent).toBe(0.7)
      expect(defaultTuner.adjustmentInterval).toBe(5000)
      defaultTuner.stop()
    })

    test('should create tuner with custom config', () => {
      const customTuner = new AdaptiveTuning({
        minConcurrency: 5,
        maxConcurrency: 200,
        targetLatency: 100,
        targetMemoryPercent: 0.8,
        adjustmentInterval: 1000
      })
      expect(customTuner.minConcurrency).toBe(5)
      expect(customTuner.maxConcurrency).toBe(200)
      expect(customTuner.targetLatency).toBe(100)
      expect(customTuner.targetMemoryPercent).toBe(0.8)
      expect(customTuner.adjustmentInterval).toBe(1000)
      customTuner.stop()
    })

    test('should start with suggested initial concurrency', () => {
      expect(tuner.currentConcurrency).toBeGreaterThan(0)
      expect(tuner.currentConcurrency).toBeGreaterThanOrEqual(tuner.minConcurrency)
      expect(tuner.currentConcurrency).toBeLessThanOrEqual(tuner.maxConcurrency)
    })

    test('should start monitoring loop on construction', () => {
      expect(tuner.intervalId).not.toBeNull()
    })
  })

  describe('Initial Concurrency Suggestion', () => {
    test('should suggest concurrency based on system memory', () => {
      const suggested = tuner.suggestInitial()
      expect(suggested).toBeGreaterThan(0)
      expect(suggested).toBeGreaterThanOrEqual(tuner.minConcurrency)
    })

    test('should return lower concurrency for low memory systems', () => {
      // Mock low memory
      const originalTotalmem = os.totalmem
      const originalFreemem = os.freemem

      os.totalmem = vi.fn(() => 512 * 1024 * 1024) // 512MB
      os.freemem = vi.fn(() => 256 * 1024 * 1024) // 256MB free

      const lowMemTuner = new AdaptiveTuning({ minConcurrency: 1 })
      const suggested = lowMemTuner.suggestInitial()

      expect(suggested).toBeLessThanOrEqual(2)
      lowMemTuner.stop()

      // Restore
      os.totalmem = originalTotalmem
      os.freemem = originalFreemem
    })

    test('should return higher concurrency for high memory systems', () => {
      // Mock high memory
      const originalTotalmem = os.totalmem
      const originalFreemem = os.freemem

      os.totalmem = vi.fn(() => 16 * 1024 * 1024 * 1024) // 16GB
      os.freemem = vi.fn(() => 8 * 1024 * 1024 * 1024) // 8GB free

      const highMemTuner = new AdaptiveTuning({ minConcurrency: 1, maxConcurrency: 100 })
      const suggested = highMemTuner.suggestInitial()

      expect(suggested).toBeGreaterThanOrEqual(10)
      highMemTuner.stop()

      // Restore
      os.totalmem = originalTotalmem
      os.freemem = originalFreemem
    })

    test('should reduce suggestion if memory usage is high', () => {
      // Mock high memory usage
      const originalTotalmem = os.totalmem
      const originalFreemem = os.freemem

      os.totalmem = vi.fn(() => 4 * 1024 * 1024 * 1024) // 4GB
      os.freemem = vi.fn(() => 400 * 1024 * 1024) // Only 400MB free (90% used)

      const tuner = new AdaptiveTuning({ minConcurrency: 1 })
      const suggested = tuner.suggestInitial()

      // Should be reduced due to high usage
      expect(suggested).toBeLessThan(20)
      tuner.stop()

      // Restore
      os.totalmem = originalTotalmem
      os.freemem = originalFreemem
    })
  })

  describe('Task Metrics Recording', () => {
    test('should record task metrics', () => {
      tuner.recordTaskMetrics({
        latency: 150,
        queueWait: 10,
        success: true,
        retries: 0,
        heapDelta: 1000
      })

      expect(tuner.metrics.latencies.length).toBe(1)
      expect(tuner.metrics.latencies[0]).toBe(150)
    })

    test('should keep only last 100 measurements', () => {
      for (let i = 0; i < 150; i++) {
        tuner.recordTaskMetrics({
          latency: i,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      expect(tuner.metrics.latencies.length).toBe(100)
      expect(tuner.metrics.memoryUsages.length).toBe(100)
    })

    test('should record memory usage', () => {
      tuner.recordTaskMetrics({
        latency: 100,
        queueWait: 0,
        success: true,
        retries: 0,
        heapDelta: 0
      })

      expect(tuner.metrics.memoryUsages.length).toBe(1)
      expect(tuner.metrics.memoryUsages[0]).toBeGreaterThanOrEqual(0)
      expect(tuner.metrics.memoryUsages[0]).toBeLessThanOrEqual(1)
    })

    test('should record throughput', () => {
      tuner.recordTaskMetrics({
        latency: 50,
        queueWait: 0,
        success: true,
        retries: 0,
        heapDelta: 0
      })

      expect(tuner.metrics.throughputs.length).toBeGreaterThan(0)
    })
  })

  describe('Adaptive Adjustment Logic', () => {
    test('should not adjust with insufficient data (<10 tasks)', () => {
      // Record only 5 metrics
      for (let i = 0; i < 5; i++) {
        tuner.recordTaskMetrics({
          latency: 100,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const result = tuner.adjust()
      expect(result).toBeNull()
    })

    test('should decrease concurrency on memory pressure', () => {
      const initialConcurrency = tuner.currentConcurrency

      // Simulate high memory usage
      const originalMemUsage = process.memoryUsage
      const originalTotalmem = os.totalmem

      os.totalmem = vi.fn(() => 4 * 1024 * 1024 * 1024) // 4GB
      process.memoryUsage = vi.fn(() => ({
        heapUsed: 3 * 1024 * 1024 * 1024 // 3GB used (75%)
      }))

      // Record metrics
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 100,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const newConcurrency = tuner.adjust()

      expect(newConcurrency).not.toBeNull()
      expect(newConcurrency).toBeLessThan(initialConcurrency)

      // Restore
      process.memoryUsage = originalMemUsage
      os.totalmem = originalTotalmem
    })

    test('should decrease concurrency on high latency (1.5x target)', () => {
      const initialConcurrency = tuner.currentConcurrency

      // Record high latency metrics (>300ms, target is 200ms)
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 350, // 1.75x target
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const newConcurrency = tuner.adjust()

      expect(newConcurrency).not.toBeNull()
      expect(newConcurrency).toBeLessThan(initialConcurrency)
    })

    test('should increase concurrency on good performance', () => {
      const initialConcurrency = tuner.currentConcurrency

      // Mock low memory usage
      const originalMemUsage = process.memoryUsage
      const originalTotalmem = os.totalmem

      os.totalmem = vi.fn(() => 8 * 1024 * 1024 * 1024) // 8GB
      process.memoryUsage = vi.fn(() => ({
        heapUsed: 2 * 1024 * 1024 * 1024 // 2GB used (25%)
      }))

      // Record low latency metrics (<100ms, target is 200ms)
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 80, // 0.4x target
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const newConcurrency = tuner.adjust()

      expect(newConcurrency).not.toBeNull()
      expect(newConcurrency).toBeGreaterThan(initialConcurrency)

      // Restore
      process.memoryUsage = originalMemUsage
      os.totalmem = originalTotalmem
    })

    test('should decrease slightly on moderate latency increase (1.2x target)', () => {
      const initialConcurrency = tuner.currentConcurrency

      // Record moderate latency increase (240ms, target is 200ms)
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 250, // 1.25x target
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const newConcurrency = tuner.adjust()

      expect(newConcurrency).not.toBeNull()
      expect(newConcurrency).toBeLessThan(initialConcurrency)
    })

    test('should not adjust if performance is acceptable', () => {
      const initialConcurrency = tuner.currentConcurrency

      // Record acceptable latency (around target)
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 190, // Close to target
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const newConcurrency = tuner.adjust()

      // Should not adjust or minimal adjustment
      if (newConcurrency !== null) {
        expect(Math.abs(newConcurrency - initialConcurrency)).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('Concurrency Bounds', () => {
    test('should respect minConcurrency', () => {
      tuner.currentConcurrency = 2

      // Force decrease
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 500, // Very high
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      tuner.adjust()

      expect(tuner.currentConcurrency).toBeGreaterThanOrEqual(tuner.minConcurrency)
    })

    test('should respect maxConcurrency', () => {
      tuner.currentConcurrency = 48

      // Mock low memory and latency
      const originalMemUsage = process.memoryUsage
      const originalTotalmem = os.totalmem

      os.totalmem = vi.fn(() => 32 * 1024 * 1024 * 1024) // 32GB
      process.memoryUsage = vi.fn(() => ({
        heapUsed: 1 * 1024 * 1024 * 1024 // 1GB used (very low)
      }))

      // Force increase
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 50, // Very low
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      tuner.adjust()

      expect(tuner.currentConcurrency).toBeLessThanOrEqual(tuner.maxConcurrency)

      // Restore
      process.memoryUsage = originalMemUsage
      os.totalmem = originalTotalmem
    })
  })

  describe('Adjustment History', () => {
    test('should record adjustment history', () => {
      // Record metrics to trigger adjustment
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 400,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      tuner.adjust()

      expect(tuner.metrics.concurrencyHistory.length).toBeGreaterThan(0)

      const lastAdjustment = tuner.metrics.concurrencyHistory[tuner.metrics.concurrencyHistory.length - 1]
      expect(lastAdjustment.old).toBeDefined()
      expect(lastAdjustment.new).toBeDefined()
      expect(lastAdjustment.reason).toBeDefined()
      expect(lastAdjustment.timestamp).toBeDefined()
      expect(lastAdjustment.metrics).toBeDefined()
    })

    test('should keep only last 100 adjustments', () => {
      // Force many adjustments
      for (let j = 0; j < 150; j++) {
        for (let i = 0; i < 15; i++) {
          tuner.recordTaskMetrics({
            latency: j % 2 === 0 ? 50 : 400, // Oscillate to force adjustments
            queueWait: 0,
            success: true,
            retries: 0,
            heapDelta: 0
          })
        }
        tuner.adjust()
      }

      expect(tuner.metrics.concurrencyHistory.length).toBeLessThanOrEqual(100)
    })
  })

  describe('Monitoring Loop', () => {
    test('should call adjust() periodically', async () => {
      const fastTuner = new AdaptiveTuning({
        minConcurrency: 1,
        maxConcurrency: 50,
        adjustmentInterval: 50 // Very fast for testing
      })

      // Record metrics
      for (let i = 0; i < 15; i++) {
        fastTuner.recordTaskMetrics({
          latency: 100,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const initialConcurrency = fastTuner.currentConcurrency

      // Wait for monitoring loop to run
      await sleep(150)

      // Concurrency may have been adjusted
      expect(fastTuner.currentConcurrency).toBeDefined()

      fastTuner.stop()
    })

    test('should stop monitoring loop on stop()', () => {
      const intervalId = tuner.intervalId
      expect(intervalId).not.toBeNull()

      tuner.stop()

      expect(tuner.intervalId).toBeNull()
    })
  })

  describe('Getter Methods', () => {
    test('getConcurrency() should return current value', () => {
      const concurrency = tuner.getConcurrency()
      expect(concurrency).toBe(tuner.currentConcurrency)
      expect(concurrency).toBeGreaterThan(0)
    })

    test('getMetrics() should return metrics summary', () => {
      // Record some metrics
      for (let i = 0; i < 10; i++) {
        tuner.recordTaskMetrics({
          latency: 100 + i * 10,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const metrics = tuner.getMetrics()

      expect(metrics.current).toBe(tuner.currentConcurrency)
      expect(metrics.avgLatency).toBeGreaterThan(0)
      expect(metrics.avgMemory).toBeGreaterThanOrEqual(0)
      expect(metrics.avgThroughput).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(metrics.history)).toBe(true)
    })

    test('getMetrics() should return defaults with no data', () => {
      const emptyTuner = new AdaptiveTuning({ adjustmentInterval: 10000 })
      emptyTuner.metrics.latencies = []

      const metrics = emptyTuner.getMetrics()

      expect(metrics.current).toBeGreaterThan(0)
      expect(metrics.avgLatency).toBe(0)
      expect(metrics.avgMemory).toBe(0)
      expect(metrics.avgThroughput).toBe(0)
      expect(metrics.history).toEqual([])

      emptyTuner.stop()
    })

    test('getMetrics() should return last 10 adjustments', () => {
      // Force multiple adjustments
      for (let j = 0; j < 20; j++) {
        for (let i = 0; i < 15; i++) {
          tuner.recordTaskMetrics({
            latency: j % 2 === 0 ? 50 : 400,
            queueWait: 0,
            success: true,
            retries: 0,
            heapDelta: 0
          })
        }
        tuner.adjust()
      }

      const metrics = tuner.getMetrics()
      expect(metrics.history.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Edge Cases', () => {
    test('should handle zero latency gracefully', () => {
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 0,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const result = tuner.adjust()
      expect(tuner.currentConcurrency).toBeGreaterThan(0)
    })

    test('should handle very high latency', () => {
      for (let i = 0; i < 15; i++) {
        tuner.recordTaskMetrics({
          latency: 10000, // 10 seconds
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      const result = tuner.adjust()
      expect(tuner.currentConcurrency).toBeGreaterThan(0)
    })

    test('should handle rapid metric recording', () => {
      // Rapid fire metrics
      for (let i = 0; i < 200; i++) {
        tuner.recordTaskMetrics({
          latency: Math.random() * 500,
          queueWait: 0,
          success: true,
          retries: 0,
          heapDelta: 0
        })
      }

      expect(tuner.metrics.latencies.length).toBeLessThanOrEqual(100)

      const metrics = tuner.getMetrics()
      expect(metrics.avgLatency).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Integration with OperationPool', () => {
    test('should provide concurrency value for pool', () => {
      const concurrency = tuner.getConcurrency()
      expect(typeof concurrency).toBe('number')
      expect(concurrency).toBeGreaterThan(0)
    })

    test('should accept task metrics in expected format', () => {
      const mockTaskMetric = {
        id: 'task-123',
        startTime: Date.now() - 100,
        endTime: Date.now(),
        latency: 95,
        queueWait: 5,
        success: true,
        retries: 0,
        heapDelta: 1024
      }

      expect(() => {
        tuner.recordTaskMetrics(mockTaskMetric)
      }).not.toThrow()

      expect(tuner.metrics.latencies.length).toBe(1)
    })
  })
})
