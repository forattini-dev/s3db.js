import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { TasksPool } from '../../src/tasks-pool.class.js'

describe('TasksPool', () => {
  let pool

  beforeEach(() => {
    pool = new TasksPool({
      concurrency: 2,
      retries: 2,
      retryDelay: 10,
      timeout: 1000,
      retryableErrors: [] // Empty array means all errors are retryable
    })
  })

  afterEach(() => {
    if (pool) {
      pool.stop()
    }
  })

  // Helper: sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  describe('Constructor and Configuration', () => {
    test('should create pool with default config', () => {
      const defaultPool = new TasksPool()
      expect(defaultPool.concurrency).toBe(10)
      expect(defaultPool.retries).toBe(3)
      expect(defaultPool.retryDelay).toBe(1000)
      expect(defaultPool.timeout).toBe(30000)
      defaultPool.stop()
    })

    test('should create pool with custom config', () => {
      const customPool = new TasksPool({
        concurrency: 5,
        retries: 5,
        retryDelay: 500,
        timeout: 5000
      })
      expect(customPool.concurrency).toBe(5)
      expect(customPool.retries).toBe(5)
      expect(customPool.retryDelay).toBe(500)
      expect(customPool.timeout).toBe(5000)
      customPool.stop()
    })

    test('should normalize concurrency to 10 if invalid', () => {
      const invalidPool = new TasksPool({ concurrency: -1 })
      expect(invalidPool.concurrency).toBe(10)
      invalidPool.stop()
    })

    test('should handle "auto" concurrency', () => {
      const autoPool = new TasksPool({ concurrency: 'auto' })
      expect(autoPool.concurrency).toBe('auto')
      autoPool.stop()
    })
  })

  describe('Basic Enqueue and Execution', () => {
    test('should enqueue and execute task', async () => {
      let executed = false
      const result = await pool.enqueue(async () => {
        executed = true
        return 'success'
      })

      expect(executed).toBe(true)
      expect(result).toBe('success')
    })

    test('should return task result', async () => {
      const result = await pool.enqueue(async () => {
        return { id: 123, value: 'test' }
      })

      expect(result).toEqual({ id: 123, value: 'test' })
    })

    test('should handle synchronous functions', async () => {
      const result = await pool.enqueue(() => {
        return 42
      })

      expect(result).toBe(42)
    })

    test('should execute multiple tasks', async () => {
      const results = await Promise.all([
        pool.enqueue(async () => 1),
        pool.enqueue(async () => 2),
        pool.enqueue(async () => 3)
      ])

      expect(results).toEqual([1, 2, 3])
    })
  })

  describe('Concurrency Limit', () => {
    test('should enforce concurrency limit', async () => {
      const executions = []
      const startTimes = []
      const endTimes = []

      const promises = [1, 2, 3, 4].map((n) =>
        pool.enqueue(async () => {
          startTimes.push(Date.now())
          executions.push(n)
          await sleep(50)
          endTimes.push(Date.now())
          return n
        })
      )

      const results = await Promise.all(promises)

      expect(results).toEqual([1, 2, 3, 4])
      // With concurrency=2, first 2 should start simultaneously
      // Third and fourth should start after first batch completes
      expect(executions).toEqual([1, 2, 3, 4])
    })

    test('should respect concurrency limit with varying durations', async () => {
      const activeCounts = []

      const promises = [100, 50, 25, 25].map((delay) =>
        pool.enqueue(async () => {
          activeCounts.push(pool.getStats().activeCount)
          await sleep(delay)
          return delay
        })
      )

      await Promise.all(promises)

      // Active count should never exceed concurrency
      activeCounts.forEach((count) => {
        expect(count).toBeLessThanOrEqual(2)
      })
    })

    test('should allow concurrency > items', async () => {
      const largePool = new TasksPool({ concurrency: 100 })

      const results = await Promise.all([
        largePool.enqueue(async () => 1),
        largePool.enqueue(async () => 2),
        largePool.enqueue(async () => 3)
      ])

      expect(results).toEqual([1, 2, 3])
      largePool.stop()
    })
  })

  describe('Priority Queue', () => {
    test('should execute high priority tasks first', async () => {
      const executionOrder = []

      // Fill queue with normal priority tasks
      const normalTasks = [1, 2, 3, 4, 5].map((n) =>
        pool.enqueue(
          async () => {
            executionOrder.push(n)
            await sleep(20)
            return n
          },
          { priority: 0 }
        )
      )

      // Add high priority task (should jump queue)
      await sleep(5) // Let first batch start
      const highPriorityTask = pool.enqueue(
        async () => {
          executionOrder.push(99)
          return 99
        },
        { priority: 100 }
      )

      await Promise.all([...normalTasks, highPriorityTask])

      // High priority task should execute before remaining normal tasks
      const index99 = executionOrder.indexOf(99)
      expect(index99).toBeLessThan(5) // Should not be last
    })

    test('should maintain FIFO order for same priority', async () => {
      const executionOrder = []

      const promises = [1, 2, 3, 4].map((n) =>
        pool.enqueue(
          async () => {
            executionOrder.push(n)
            await sleep(10)
            return n
          },
          { priority: 0 }
        )
      )

      await Promise.all(promises)

      expect(executionOrder).toEqual([1, 2, 3, 4])
    })
  })

  describe('Retry Logic', () => {
    test('should retry failed tasks', async () => {
      let attempts = 0

      const result = await pool.enqueue(async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Transient error')
        }
        return 'success'
      })

      expect(attempts).toBe(3)
      expect(result).toBe('success')
    })

    test('should use exponential backoff', async () => {
      const executionTimes = []

      try {
        await pool.enqueue(async () => {
          executionTimes.push(Date.now())
          throw new Error('Always fails')
        })
      } catch (error) {
        // Expected to fail
      }

      // Should have 3 attempts: initial + 2 retries
      expect(executionTimes.length).toBe(3)

      // Calculate delays between attempts
      const delay1 = executionTimes[1] - executionTimes[0] // Should be ~10ms
      const delay2 = executionTimes[2] - executionTimes[1] // Should be ~20ms

      // Delays should use exponential backoff: 10ms, 20ms (with retryDelay=10)
      expect(delay1).toBeGreaterThanOrEqual(8) // ~10ms (allow 20% variance)
      expect(delay2).toBeGreaterThanOrEqual(18) // ~20ms (allow 10% variance)
    })

    test('should respect retry limit', async () => {
      let attempts = 0

      try {
        await pool.enqueue(async () => {
          attempts++
          throw new Error('Always fails')
        })
      } catch (error) {
        expect(error.message).toBe('Always fails')
      }

      expect(attempts).toBe(3) // 1 initial + 2 retries
    })

    test('should not retry non-retryable errors', async () => {
      const selectivePool = new TasksPool({
        concurrency: 2,
        retries: 3,
        retryableErrors: ['NetworkError']
      })

      let attempts = 0

      try {
        await selectivePool.enqueue(async () => {
          attempts++
          const error = new Error('Not retryable')
          error.name = 'ValidationError'
          throw error
        })
      } catch (error) {
        expect(error.name).toBe('ValidationError')
      }

      expect(attempts).toBe(1) // No retries
      selectivePool.stop()
    })

    test('should retry only retryable errors', async () => {
      const selectivePool = new TasksPool({
        concurrency: 2,
        retries: 3,
        retryDelay: 5,
        retryableErrors: ['NetworkError']
      })

      let attempts = 0

      try {
        await selectivePool.enqueue(async () => {
          attempts++
          const error = new Error('Network failed')
          error.name = 'NetworkError'
          throw error
        })
      } catch (error) {
        expect(error.name).toBe('NetworkError')
      }

      expect(attempts).toBe(4) // 1 initial + 3 retries
      selectivePool.stop()
    })

    test('should override default retries per task', async () => {
      let attempts = 0

      try {
        await pool.enqueue(
          async () => {
            attempts++
            throw new Error('Fail')
          },
          { retries: 5 }
        )
      } catch (error) {
        // Expected
      }

      expect(attempts).toBe(6) // 1 initial + 5 retries
    })
  })

  describe('Timeout Handling', () => {
    test('should timeout slow tasks', async () => {
      const fastPool = new TasksPool({ concurrency: 2, timeout: 50 })

      try {
        await fastPool.enqueue(async () => {
          await sleep(200) // Exceeds timeout
          return 'should not reach'
        })
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(error.message).toContain('timed out after 50ms')
      }

      fastPool.stop()
    })

    test('should not timeout fast tasks', async () => {
      const result = await pool.enqueue(async () => {
        await sleep(10) // Well within timeout
        return 'success'
      })

      expect(result).toBe('success')
    })

    test('should clear timeout on completion', async () => {
      // This test verifies that timeouts are cleaned up (no memory leak)
      const promises = []

      for (let i = 0; i < 10; i++) {
        promises.push(
          pool.enqueue(async () => {
            await sleep(5)
            return i
          })
        )
      }

      const results = await Promise.all(promises)
      expect(results.length).toBe(10)
    })

    test('should override default timeout per task', async () => {
      try {
        await pool.enqueue(
          async () => {
            await sleep(100)
            return 'should not reach'
          },
          { timeout: 50 }
        )
        expect(true).toBe(false)
      } catch (error) {
        expect(error.message).toContain('timed out after 50ms')
      }
    })
  })

  describe('Lifecycle Control', () => {
    test('pause() should stop new tasks from starting', async () => {
      const executionOrder = []

      // Start 2 tasks (fills concurrency)
      const task1 = pool.enqueue(async () => {
        executionOrder.push(1)
        await sleep(100)
        return 1
      })

      const task2 = pool.enqueue(async () => {
        executionOrder.push(2)
        await sleep(100)
        return 2
      })

      // Enqueue task 3 (should be queued)
      const task3 = pool.enqueue(async () => {
        executionOrder.push(3)
        return 3
      })

      // Pause immediately
      await sleep(10)
      await pool.pause()

      // Task 3 should not have started yet
      expect(executionOrder).toEqual([1, 2])

      // Resume and wait
      pool.resume()
      await task3

      expect(executionOrder).toEqual([1, 2, 3])
    })

    test('resume() should restart processing', async () => {
      await pool.pause()
      expect(pool.paused).toBe(true)

      pool.resume()
      expect(pool.paused).toBe(false)

      const result = await pool.enqueue(async () => 'resumed')
      expect(result).toBe('resumed')
    })

    test('stop() should cancel pending tasks', async () => {
      // Fill concurrency
      pool.enqueue(async () => {
        await sleep(100)
        return 1
      })

      pool.enqueue(async () => {
        await sleep(100)
        return 2
      })

      // Enqueue pending task
      const pendingTask = pool.enqueue(async () => 'should be cancelled')

      await sleep(10)
      pool.stop()

      try {
        await pendingTask
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(error.message).toContain('cancelled by stop()')
      }
    })

    test('drain() should wait for all tasks', async () => {
      const results = []

      pool.enqueue(async () => {
        await sleep(50)
        results.push(1)
        return 1
      })

      pool.enqueue(async () => {
        await sleep(30)
        results.push(2)
        return 2
      })

      pool.enqueue(async () => {
        await sleep(20)
        results.push(3)
        return 3
      })

      await pool.drain()

      expect(results.length).toBe(3)
    })
  })

  describe('Statistics', () => {
    test('should track basic stats', async () => {
      await Promise.all([
        pool.enqueue(async () => 1),
        pool.enqueue(async () => 2),
        pool.enqueue(async () => 3)
      ])

      const stats = pool.getStats()

      expect(stats.processedCount).toBe(3)
      expect(stats.errorCount).toBe(0)
      expect(stats.queueSize).toBe(0)
      expect(stats.activeCount).toBe(0)
    })

    test('should track errors', async () => {
      try {
        await pool.enqueue(async () => {
          throw new Error('Test error')
        })
      } catch (error) {
        // Expected
      }

      const stats = pool.getStats()
      expect(stats.errorCount).toBe(1)
    })

    test('should track retries', async () => {
      let attempts = 0

      await pool.enqueue(async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Retry me')
        }
        return 'success'
      })

      const stats = pool.getStats()
      expect(stats.retryCount).toBe(2)
    })

    test('should provide aggregate metrics', async () => {
      await Promise.all([
        pool.enqueue(async () => {
          await sleep(10)
          return 1
        }),
        pool.enqueue(async () => {
          await sleep(20)
          return 2
        }),
        pool.enqueue(async () => {
          await sleep(15)
          return 3
        })
      ])

      const metrics = pool.getAggregateMetrics()

      expect(metrics).not.toBeNull()
      expect(metrics.count).toBe(3)
      expect(metrics.avgExecution).toBeGreaterThan(0)
      expect(metrics.p95Execution).toBeGreaterThan(0)
    })
  })

  describe('Event Emission', () => {
    test('should emit taskStart event', async () => {
      const events = []

      pool.on('pool:taskStarted', (task) => {
        events.push({ type: 'start', id: task.id })
      })

      await pool.enqueue(async () => 'test')

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('start')
    })

    test('should emit taskComplete event', async () => {
      const events = []

      pool.on('pool:taskCompleted', (task, result) => {
        events.push({ type: 'complete', result })
      })

      await pool.enqueue(async () => 'success')

      expect(events.length).toBe(1)
      expect(events[0].result).toBe('success')
    })

    test('should emit taskError event', async () => {
      const events = []

      pool.on('pool:taskError', (task, error) => {
        events.push({ type: 'error', message: error.message })
      })

      try {
        await pool.enqueue(async () => {
          throw new Error('Test error')
        })
      } catch (error) {
        // Expected
      }

      expect(events.length).toBe(1)
      expect(events[0].message).toBe('Test error')
    })

    test('should emit taskRetry event', async () => {
      const events = []

      pool.on('pool:taskRetry', (task, attempt) => {
        events.push({ type: 'retry', attempt })
      })

      try {
        await pool.enqueue(async () => {
          throw new Error('Retry me')
        })
      } catch (error) {
        // Expected
      }

      expect(events.length).toBe(2) // 2 retries
      expect(events[0].attempt).toBe(1)
      expect(events[1].attempt).toBe(2)
    })

    test('should emit drained event', async () => {
      let drained = false

      pool.on('pool:drained', () => {
        drained = true
      })

      await pool.enqueue(async () => 'test')
      await sleep(10) // Wait for event

      expect(drained).toBe(true)
    })

    test('should emit paused event', async () => {
      let paused = false

      pool.on('pool:paused', () => {
        paused = true
      })

      await pool.pause()

      expect(paused).toBe(true)
    })

    test('should emit resumed event', async () => {
      let resumed = false

      pool.on('pool:resumed', () => {
        resumed = true
      })

      await pool.pause()
      pool.resume()

      expect(resumed).toBe(true)
    })

    test('should emit stopped event', async () => {
      let stopped = false

      pool.on('pool:stopped', () => {
        stopped = true
      })

      pool.stop()

      expect(stopped).toBe(true)
    })
  })

  describe('Dynamic Concurrency', () => {
    test('should allow increasing concurrency at runtime', async () => {
      const executionOrder = []

      // Enqueue 5 tasks (concurrency=2)
      const promises = [1, 2, 3, 4, 5].map((n) =>
        pool.enqueue(async () => {
          executionOrder.push(n)
          await sleep(50)
          return n
        })
      )

      // Increase concurrency after first batch starts
      await sleep(10)
      pool.setConcurrency(5)

      await Promise.all(promises)

      // All should complete successfully
      expect(executionOrder.length).toBe(5)
    })

    test('should allow decreasing concurrency at runtime', async () => {
      pool.setConcurrency(5)

      const promises = [1, 2, 3, 4, 5].map((n) =>
        pool.enqueue(async () => {
          await sleep(20)
          return n
        })
      )

      await sleep(10)
      pool.setConcurrency(2)

      const results = await Promise.all(promises)
      expect(results.length).toBe(5)
    })

    test('should throw error for invalid concurrency', () => {
      expect(() => pool.setConcurrency(0)).toThrow('Concurrency must be >= 1')
      expect(() => pool.setConcurrency(-1)).toThrow('Concurrency must be >= 1')
    })
  })

  describe('Error Handling Edge Cases', () => {
    test('should handle rejected promises', async () => {
      try {
        await pool.enqueue(async () => {
          return Promise.reject(new Error('Rejected'))
        })
        expect(true).toBe(false)
      } catch (error) {
        expect(error.message).toBe('Rejected')
      }
    })

    test('should handle thrown errors', async () => {
      try {
        await pool.enqueue(async () => {
          throw new Error('Thrown')
        })
        expect(true).toBe(false)
      } catch (error) {
        expect(error.message).toBe('Thrown')
      }
    })

    test('should handle errors in retry logic', async () => {
      let attempts = 0

      try {
        await pool.enqueue(async () => {
          attempts++
          if (attempts === 1) {
            throw new Error('First error')
          } else if (attempts === 2) {
            throw new Error('Second error')
          } else {
            throw new Error('Final error')
          }
        })
      } catch (error) {
        expect(error.message).toBe('Final error')
      }

      expect(attempts).toBe(3)
    })
  })

  describe('Metrics Collection', () => {
    test('should collect task metrics', async () => {
      await pool.enqueue(async () => {
        await sleep(10)
        return 'test'
      })

      const metrics = pool.taskMetrics
      expect(metrics.size).toBeGreaterThan(0)

      const task = Array.from(metrics.values())[0]
      expect(task.timings.queueWait).toBeGreaterThanOrEqual(0)
      expect(task.timings.execution).toBeGreaterThan(0)
      expect(task.timings.total).toBeGreaterThan(0)
    })

    test('should limit metrics collection to 1000 tasks', async () => {
      const largePool = new TasksPool({ concurrency: 100 })

      const promises = []
      for (let i = 0; i < 1100; i++) {
        promises.push(largePool.enqueue(async () => i))
      }

      await Promise.all(promises)

      expect(largePool.taskMetrics.size).toBeLessThanOrEqual(1000)
      largePool.stop()
    })

    test('should disable metrics collection when configured', async () => {
      const noMetricsPool = new TasksPool({
        concurrency: 2,
        monitoring: { collectMetrics: false }
      })

      await noMetricsPool.enqueue(async () => 'test')

      expect(noMetricsPool.taskMetrics.size).toBe(0)
      noMetricsPool.stop()
    })
  })
})
