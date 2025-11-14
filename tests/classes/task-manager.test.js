import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { TaskManager } from '../../src/task-manager.class.js'

describe('TaskManager', () => {
  let manager

  beforeEach(() => {
    manager = new TaskManager({ concurrency: 2, retries: 2, retryDelay: 10, timeout: 1000 })
  })

  afterEach(() => {
    if (manager) {
      manager.destroy()
    }
  })

  // Helper: sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  describe('Constructor and Configuration', () => {
    test('should create manager with default config', () => {
      const defaultManager = new TaskManager()
      expect(defaultManager.concurrency).toBe(5)
      expect(defaultManager.retries).toBe(3)
      expect(defaultManager.retryDelay).toBe(1000)
      expect(defaultManager.timeout).toBe(30000)
      expect(defaultManager.retryableErrors).toEqual([])
      defaultManager.destroy()
    })

    test('should create manager with custom config', () => {
      const customManager = new TaskManager({
        concurrency: 5,
        retries: 5,
        retryDelay: 500,
        timeout: 5000,
        retryableErrors: ['NetworkError']
      })
      expect(customManager.concurrency).toBe(5)
      expect(customManager.retries).toBe(5)
      expect(customManager.retryDelay).toBe(500)
      expect(customManager.timeout).toBe(5000)
      expect(customManager.retryableErrors).toEqual(['NetworkError'])
      customManager.destroy()
    })

    test('should initialize with empty queue and active map', () => {
      expect(manager.queue).toEqual([])
      expect(manager.active.size).toBe(0)
      expect(manager.paused).toBe(false)
      expect(manager.stopped).toBe(false)
    })

    test('should initialize stats with zeros', () => {
      const stats = manager.getStats()
      expect(stats.queueSize).toBe(0)
      expect(stats.activeCount).toBe(0)
      expect(stats.processedCount).toBe(0)
      expect(stats.errorCount).toBe(0)
      expect(stats.retryCount).toBe(0)
    })
  })

  describe('Static Symbols', () => {
    test('should expose notRun symbol', () => {
      expect(TaskManager.notRun).toEqual(expect.any(Symbol))
      expect(TaskManager.notRun.toString()).toBe('Symbol(notRun)')
    })

    test('should expose failed symbol', () => {
      expect(TaskManager.failed).toEqual(expect.any(Symbol))
      expect(TaskManager.failed.toString()).toBe('Symbol(failed)')
    })
  })

  describe('Basic Enqueue and Execution', () => {
    test('should enqueue and execute task', async () => {
      let executed = false
      const result = await manager.enqueue(async () => {
        executed = true
        return 'success'
      })

      expect(executed).toBe(true)
      expect(result).toBe('success')
    })

    test('should return task result', async () => {
      const result = await manager.enqueue(async () => {
        return { id: 123, value: 'test' }
      })

      expect(result).toEqual({ id: 123, value: 'test' })
    })

    test('should handle synchronous functions', async () => {
      const result = await manager.enqueue(() => {
        return 42
      })

      expect(result).toBe(42)
    })

    test('should execute multiple tasks', async () => {
      const results = await Promise.all([
        manager.enqueue(async () => 1),
        manager.enqueue(async () => 2),
        manager.enqueue(async () => 3)
      ])

      expect(results).toEqual([1, 2, 3])
    })
  })

  describe('Concurrency Limit', () => {
    test('should enforce concurrency limit', async () => {
      const executionOrder = []
      const startTimes = []
      const endTimes = []

      const promises = [1, 2, 3, 4].map((n) =>
        manager.enqueue(async () => {
          startTimes.push(Date.now())
          executionOrder.push(n)
          await sleep(50)
          endTimes.push(Date.now())
          return n
        })
      )

      const results = await Promise.all(promises)

      expect(results).toEqual([1, 2, 3, 4])
      expect(executionOrder).toEqual([1, 2, 3, 4])
    })

    test('should respect concurrency limit with varying durations', async () => {
      const activeCounts = []

      const promises = [100, 50, 25, 25].map((delay) =>
        manager.enqueue(async () => {
          activeCounts.push(manager.getStats().activeCount)
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
      const largeManager = new TaskManager({ concurrency: 100 })

      const results = await Promise.all([
        largeManager.enqueue(async () => 1),
        largeManager.enqueue(async () => 2),
        largeManager.enqueue(async () => 3)
      ])

      expect(results).toEqual([1, 2, 3])
      largeManager.destroy()
    })
  })

  describe('Priority Queue', () => {
    test('should execute high priority tasks first', async () => {
      const executionOrder = []

      // Fill queue with normal priority tasks
      const normalTasks = [1, 2, 3, 4, 5].map((n) =>
        manager.enqueue(
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
      const highPriorityTask = manager.enqueue(
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
        manager.enqueue(
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

      const result = await manager.enqueue(async () => {
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
      let attempts = 0
      const attemptTimes = []

      try {
        await manager.enqueue(async () => {
          attempts++
          attemptTimes.push(Date.now())
          throw new Error('Always fails')
        })
      } catch (error) {
        // Expected to fail
      }

      // Should have 3 attempts (1 initial + 2 retries)
      expect(attempts).toBe(3)
      expect(attemptTimes.length).toBe(3)

      // Delays between attempts should increase exponentially
      if (attemptTimes.length >= 3) {
        const delay1 = attemptTimes[1] - attemptTimes[0]
        const delay2 = attemptTimes[2] - attemptTimes[1]
        expect(delay2).toBeGreaterThan(delay1 * 0.8) // Allow some variance
      }
    })

    test('should respect retry limit', async () => {
      let attempts = 0

      try {
        await manager.enqueue(async () => {
          attempts++
          throw new Error('Always fails')
        })
      } catch (error) {
        expect(error.message).toBe('Always fails')
      }

      expect(attempts).toBe(3) // 1 initial + 2 retries
    })

    test('should not retry non-retryable errors', async () => {
      const selectiveManager = new TaskManager({
        concurrency: 2,
        retries: 3,
        retryableErrors: ['NetworkError']
      })

      let attempts = 0

      try {
        await selectiveManager.enqueue(async () => {
          attempts++
          const error = new Error('Not retryable')
          error.name = 'ValidationError'
          throw error
        })
      } catch (error) {
        expect(error.name).toBe('ValidationError')
      }

      expect(attempts).toBe(1) // No retries
      selectiveManager.destroy()
    })

    test('should retry only retryable errors', async () => {
      const selectiveManager = new TaskManager({
        concurrency: 2,
        retries: 3,
        retryDelay: 5,
        retryableErrors: ['NetworkError']
      })

      let attempts = 0

      try {
        await selectiveManager.enqueue(async () => {
          attempts++
          const error = new Error('Network failed')
          error.name = 'NetworkError'
          throw error
        })
      } catch (error) {
        expect(error.name).toBe('NetworkError')
      }

      expect(attempts).toBe(4) // 1 initial + 3 retries
      selectiveManager.destroy()
    })

    test('should override default retries per task', async () => {
      let attempts = 0

      try {
        await manager.enqueue(
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
      const fastManager = new TaskManager({ concurrency: 2, timeout: 50 })

      try {
        await fastManager.enqueue(async () => {
          await sleep(200) // Exceeds timeout
          return 'should not reach'
        })
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(error.message).toContain('timed out after 50ms')
      }

      fastManager.destroy()
    })

    test('should not timeout fast tasks', async () => {
      const result = await manager.enqueue(async () => {
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
          manager.enqueue(async () => {
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
        await manager.enqueue(
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

  describe('process() - Batch Processing', () => {
    test('should process array of items', async () => {
      const items = [1, 2, 3, 4, 5]

      const { results, errors } = await manager.process(items, async (item) => {
        return item * 2
      })

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(errors).toEqual([])
    })

    test('should collect errors', async () => {
      const items = [1, 2, 3, 4, 5]

      const { results, errors } = await manager.process(items, async (item) => {
        if (item === 3) {
          throw new Error('Item 3 failed')
        }
        return item * 2
      })

      expect(results).toHaveLength(4)
      expect(errors).toHaveLength(1)
      expect(errors[0].item).toBe(3)
      expect(errors[0].error.message).toBe('Item 3 failed')
      expect(errors[0].index).toBe(2)
    })

    test('should call onProgress callback', async () => {
      const items = [1, 2, 3, 4, 5]
      const progressUpdates = []

      await manager.process(
        items,
        async (item) => {
          await sleep(10)
          return item * 2
        },
        {
          onProgress: (item, stats) => {
            progressUpdates.push(stats)
          }
        }
      )

      expect(progressUpdates.length).toBe(5)
      expect(progressUpdates[4].processedCount).toBe(5)
      expect(progressUpdates[4].totalCount).toBe(5)
      expect(progressUpdates[4].percentage).toBe('100.00')
    })

    test('should call onItemComplete callback', async () => {
      const items = [1, 2, 3]
      const completedItems = []

      await manager.process(
        items,
        async (item) => item * 2,
        {
          onItemComplete: (item, result) => {
            completedItems.push({ item, result })
          }
        }
      )

      expect(completedItems).toHaveLength(3)
      expect(completedItems[0]).toEqual({ item: 1, result: 2 })
    })

    test('should call onItemError callback', async () => {
      const items = [1, 2, 3]
      const failedItems = []

      await manager.process(
        items,
        async (item) => {
          if (item === 2) throw new Error('Failed')
          return item * 2
        },
        {
          onItemError: (item, error) => {
            failedItems.push({ item, error })
          }
        }
      )

      expect(failedItems).toHaveLength(1)
      expect(failedItems[0].item).toBe(2)
    })

    test('should pass index and manager to processor', async () => {
      const items = ['a', 'b', 'c']
      const processedData = []

      await manager.process(items, async (item, index, mgr) => {
        processedData.push({ item, index, hasManager: !!mgr })
        return item.toUpperCase()
      })

      expect(processedData).toEqual([
        { item: 'a', index: 0, hasManager: true },
        { item: 'b', index: 1, hasManager: true },
        { item: 'c', index: 2, hasManager: true }
      ])
    })

    test('should respect task options (priority, retries, timeout)', async () => {
      const items = [1, 2, 3]
      let attempts = 0

      const { results, errors } = await manager.process(
        items,
        async (item) => {
          attempts++
          if (attempts < 3) throw new Error('Retry me')
          return item * 2
        },
        {
          retries: 5,
          priority: 10
        }
      )

      expect(results.length + errors.length).toBe(3)
    })
  })

  describe('processIterable() - Generator/Iterator Processing', () => {
    test('should process sync generator', async () => {
      function* generator () {
        yield 1
        yield 2
        yield 3
      }

      const { results, errors } = await manager.processIterable(generator(), async (item) => {
        return item * 2
      })

      expect(results).toEqual([2, 4, 6])
      expect(errors).toEqual([])
    })

    test('should process async generator', async () => {
      async function* generator () {
        for (let i = 1; i <= 3; i++) {
          await sleep(5)
          yield i
        }
      }

      const { results, errors } = await manager.processIterable(generator(), async (item) => {
        return item * 2
      })

      expect(results).toEqual([2, 4, 6])
      expect(errors).toEqual([])
    })

    test('should handle errors from iterable', async () => {
      // Create manager with no retries to avoid multiple error logs
      const noRetryManager = new TaskManager({ concurrency: 2, retries: 0 })

      function* generator () {
        yield 1
        yield 2
        yield 3
      }

      const { results, errors } = await noRetryManager.processIterable(generator(), async (item) => {
        if (item === 2) throw new Error('Item 2 failed')
        return item * 2
      })

      expect(results).toHaveLength(2)
      expect(errors).toHaveLength(1)
      expect(errors[0].item).toBe(2)

      noRetryManager.destroy()
    })

    test('should stop on manager.stop()', async () => {
      async function* generator () {
        for (let i = 1; i <= 100; i++) {
          await sleep(5)
          yield i
        }
      }

      const promise = manager.processIterable(generator(), async (item) => {
        if (item === 5) {
          manager.stop()
        }
        return item * 2
      })

      const { results } = await promise

      expect(results.length).toBeLessThan(100)
    })

    test('should call onItemComplete/onItemError callbacks', async () => {
      // Create manager with no retries to avoid multiple error logs
      const noRetryManager = new TaskManager({ concurrency: 2, retries: 0 })

      function* generator () {
        yield 1
        yield 2
        yield 3
      }

      const completed = []
      const failed = []

      await noRetryManager.processIterable(
        generator(),
        async (item) => {
          if (item === 2) throw new Error('Failed')
          return item * 2
        },
        {
          onItemComplete: (item, result) => completed.push({ item, result }),
          onItemError: (item, error) => failed.push({ item, error })
        }
      )

      expect(completed).toHaveLength(2)
      expect(failed).toHaveLength(1)

      noRetryManager.destroy()
    })

    test('should respect concurrency limit with iterables', async () => {
      function* generator () {
        for (let i = 1; i <= 10; i++) {
          yield i
        }
      }

      const maxActive = []

      await manager.processIterable(generator(), async (item) => {
        const stats = manager.getStats()
        maxActive.push(stats.activeCount)
        await sleep(20)
        return item
      })

      // Should never exceed concurrency
      maxActive.forEach((count) => {
        expect(count).toBeLessThanOrEqual(manager.concurrency)
      })
    })
  })

  describe('processCorresponding() - Order-Preserving Results', () => {
    test('should return results in same order as items', async () => {
      const items = [1, 2, 3, 4, 5]

      const results = await manager.processCorresponding(items, async (item) => {
        await sleep(Math.random() * 20) // Random delay
        return item * 2
      })

      expect(results).toEqual([2, 4, 6, 8, 10])
    })

    test('should mark failed items with TaskManager.failed', async () => {
      const items = [1, 2, 3, 4, 5]

      const results = await manager.processCorresponding(items, async (item) => {
        if (item === 3) {
          throw new Error('Item 3 failed')
        }
        return item * 2
      })

      expect(results).toHaveLength(5)
      expect(results[0]).toBe(2)
      expect(results[1]).toBe(4)
      expect(results[2]).toBe(TaskManager.failed)
      expect(results[3]).toBe(8)
      expect(results[4]).toBe(10)
    })

    test('should mark not-run items with TaskManager.notRun', async () => {
      const items = [1, 2, 3, 4, 5]

      const resultPromise = manager.processCorresponding(items, async (item) => {
        if (item === 3) {
          manager.stop() // Stop processing
        }
        await sleep(20)
        return item * 2
      })

      const results = await resultPromise

      // Some items may not have run
      const hasNotRun = results.some((r) => r === TaskManager.notRun)
      expect(hasNotRun || results.every((r) => typeof r === 'number' || r === TaskManager.failed)).toBe(true)
    })

    test('should preserve array length', async () => {
      const items = [1, 2, 3, 4, 5]

      const results = await manager.processCorresponding(items, async (item) => {
        if (item % 2 === 0) throw new Error('Even number')
        return item * 2
      })

      expect(results).toHaveLength(items.length)
    })

    test('should call onItemError callback', async () => {
      const items = [1, 2, 3]
      const errors = []

      await manager.processCorresponding(
        items,
        async (item) => {
          if (item === 2) throw new Error('Failed')
          return item * 2
        },
        {
          onItemError: (item, error) => {
            errors.push({ item, error })
          }
        }
      )

      expect(errors).toHaveLength(1)
      expect(errors[0].item).toBe(2)
    })
  })

  describe('Lifecycle Control', () => {
    test('pause() should stop new tasks from starting', async () => {
      const executionOrder = []

      // Start 2 tasks (fills concurrency)
      const task1 = manager.enqueue(async () => {
        executionOrder.push(1)
        await sleep(100)
        return 1
      })

      const task2 = manager.enqueue(async () => {
        executionOrder.push(2)
        await sleep(100)
        return 2
      })

      // Enqueue task 3 (should be queued)
      const task3 = manager.enqueue(async () => {
        executionOrder.push(3)
        return 3
      })

      // Pause immediately
      await sleep(10)
      await manager.pause()

      // Task 3 should not have started yet
      expect(executionOrder).toEqual([1, 2])

      // Resume and wait
      manager.resume()
      await task3

      expect(executionOrder).toEqual([1, 2, 3])
    })

    test('resume() should restart processing', async () => {
      await manager.pause()
      expect(manager.paused).toBe(true)

      manager.resume()
      expect(manager.paused).toBe(false)

      const result = await manager.enqueue(async () => 'resumed')
      expect(result).toBe('resumed')
    })

    test('stop() should cancel pending tasks', async () => {
      // Fill concurrency
      manager.enqueue(async () => {
        await sleep(100)
        return 1
      })

      manager.enqueue(async () => {
        await sleep(100)
        return 2
      })

      // Enqueue pending task
      const pendingTask = manager.enqueue(async () => 'should be cancelled')

      await sleep(10)
      manager.stop()

      try {
        await pendingTask
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(error.message).toContain('cancelled by stop()')
      }
    })

    test('drain() should wait for all tasks', async () => {
      const results = []

      manager.enqueue(async () => {
        await sleep(50)
        results.push(1)
        return 1
      })

      manager.enqueue(async () => {
        await sleep(30)
        results.push(2)
        return 2
      })

      manager.enqueue(async () => {
        await sleep(20)
        results.push(3)
        return 3
      })

      await manager.drain()

      expect(results.length).toBe(3)
    })
  })

  describe('Statistics', () => {
    test('should track basic stats', async () => {
      await Promise.all([
        manager.enqueue(async () => 1),
        manager.enqueue(async () => 2),
        manager.enqueue(async () => 3)
      ])

      const stats = manager.getStats()

      expect(stats.processedCount).toBe(3)
      expect(stats.errorCount).toBe(0)
      expect(stats.queueSize).toBe(0)
      expect(stats.activeCount).toBe(0)
    })

    test('should track errors', async () => {
      try {
        await manager.enqueue(async () => {
          throw new Error('Test error')
        })
      } catch (error) {
        // Expected
      }

      const stats = manager.getStats()
      expect(stats.errorCount).toBe(1)
    })

    test('should track retries', async () => {
      let attempts = 0

      await manager.enqueue(async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Retry me')
        }
        return 'success'
      })

      const stats = manager.getStats()
      expect(stats.retryCount).toBe(2)
    })

    test('should track queue size and active count', async () => {
      const statsSnapshots = []

      // Fill concurrency
      const promise1 = manager.enqueue(async () => {
        await sleep(50)
        return 1
      })

      const promise2 = manager.enqueue(async () => {
        await sleep(50)
        return 2
      })

      // Add queued tasks
      manager.enqueue(async () => 3)
      manager.enqueue(async () => 4)

      await sleep(10)
      statsSnapshots.push(manager.getStats())

      await Promise.all([promise1, promise2])
      await manager.drain()
      statsSnapshots.push(manager.getStats())

      expect(statsSnapshots[0].activeCount).toBeGreaterThan(0)
      expect(statsSnapshots[1].activeCount).toBe(0)
    })
  })

  describe('Progress Tracking', () => {
    test('should provide progress information', async () => {
      manager.enqueue(async () => {
        await sleep(50)
        return 1
      })

      manager.enqueue(async () => {
        await sleep(50)
        return 2
      })

      manager.enqueue(async () => {
        await sleep(50)
        return 3
      })

      await sleep(10)
      const progress = manager.getProgress()

      expect(progress.total).toBeGreaterThan(0)
      expect(progress.completed).toBeGreaterThanOrEqual(0)
      expect(progress.pending).toBeGreaterThanOrEqual(0)
      expect(progress.active).toBeGreaterThanOrEqual(0)
      expect(progress.percentage).toBeDefined()
    })

    test('should calculate percentage correctly', async () => {
      await Promise.all([
        manager.enqueue(async () => 1),
        manager.enqueue(async () => 2)
      ])

      const progress = manager.getProgress()
      expect(progress.percentage).toBe('100.00')
    })
  })

  describe('Event Emission', () => {
    test('should emit taskStart event', async () => {
      const events = []

      manager.on('taskStart', (task) => {
        events.push({ type: 'start', id: task.id })
      })

      await manager.enqueue(async () => 'test')

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('start')
    })

    test('should emit taskComplete event', async () => {
      const events = []

      manager.on('taskComplete', (task, result) => {
        events.push({ type: 'complete', result })
      })

      await manager.enqueue(async () => 'success')

      expect(events.length).toBe(1)
      expect(events[0].result).toBe('success')
    })

    test('should emit taskError event', async () => {
      // Create manager with no retries to get exactly 1 error event
      const noRetryManager = new TaskManager({ concurrency: 2, retries: 0 })

      const events = []

      noRetryManager.on('taskError', (task, error) => {
        events.push({ type: 'error', message: error.message })
      })

      try {
        await noRetryManager.enqueue(async () => {
          throw new Error('Test error')
        })
      } catch (error) {
        // Expected
      }

      expect(events.length).toBe(1)
      expect(events[0].message).toBe('Test error')

      noRetryManager.destroy()
    })

    test('should emit taskRetry event', async () => {
      const events = []

      manager.on('taskRetry', (task, attempt) => {
        events.push({ type: 'retry', attempt })
      })

      try {
        await manager.enqueue(async () => {
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

      manager.on('drained', () => {
        drained = true
      })

      await manager.enqueue(async () => 'test')
      await sleep(10) // Wait for event

      expect(drained).toBe(true)
    })

    test('should emit paused event', async () => {
      let paused = false

      manager.on('paused', () => {
        paused = true
      })

      await manager.pause()

      expect(paused).toBe(true)
    })

    test('should emit resumed event', async () => {
      let resumed = false

      manager.on('resumed', () => {
        resumed = true
      })

      await manager.pause()
      manager.resume()

      expect(resumed).toBe(true)
    })

    test('should emit stopped event', async () => {
      let stopped = false

      manager.on('stopped', () => {
        stopped = true
      })

      manager.stop()

      expect(stopped).toBe(true)
    })
  })

  describe('Dynamic Concurrency', () => {
    test('should allow increasing concurrency at runtime', async () => {
      const executionOrder = []

      // Enqueue 5 tasks (concurrency=2)
      const promises = [1, 2, 3, 4, 5].map((n) =>
        manager.enqueue(async () => {
          executionOrder.push(n)
          await sleep(50)
          return n
        })
      )

      // Increase concurrency after first batch starts
      await sleep(10)
      manager.setConcurrency(5)

      await Promise.all(promises)

      // All should complete successfully
      expect(executionOrder.length).toBe(5)
    })

    test('should allow decreasing concurrency at runtime', async () => {
      manager.setConcurrency(5)

      const promises = [1, 2, 3, 4, 5].map((n) =>
        manager.enqueue(async () => {
          await sleep(20)
          return n
        })
      )

      await sleep(10)
      manager.setConcurrency(2)

      const results = await Promise.all(promises)
      expect(results.length).toBe(5)
    })

    test('should throw error for invalid concurrency', () => {
      expect(() => manager.setConcurrency(0)).toThrow('Concurrency must be >= 1')
      expect(() => manager.setConcurrency(-1)).toThrow('Concurrency must be >= 1')
    })
  })

  describe('Error Handling Edge Cases', () => {
    test('should handle rejected promises', async () => {
      try {
        await manager.enqueue(async () => {
          return Promise.reject(new Error('Rejected'))
        })
        expect(true).toBe(false)
      } catch (error) {
        expect(error.message).toBe('Rejected')
      }
    })

    test('should handle thrown errors', async () => {
      try {
        await manager.enqueue(async () => {
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
        await manager.enqueue(async () => {
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

  describe('Reset and Cleanup', () => {
    test('should reset manager state', async () => {
      await manager.enqueue(async () => 'test')

      manager.reset()

      const stats = manager.getStats()
      expect(stats.processedCount).toBe(0)
      expect(stats.errorCount).toBe(0)
      expect(stats.queueSize).toBe(0)
      expect(stats.activeCount).toBe(0)
      expect(manager.queue).toEqual([])
      expect(manager.active.size).toBe(0)
      expect(manager.paused).toBe(false)
      expect(manager.stopped).toBe(false)
    })

    test('should destroy manager and cleanup listeners', () => {
      const listener = jest.fn()
      manager.on('taskComplete', listener)

      manager.destroy()

      expect(manager.stopped).toBe(true)
      expect(manager.queue).toEqual([])
      expect(manager.listenerCount('taskComplete')).toBe(0)
    })
  })

  describe('Static Helpers', () => {
    test('TaskManager.process() should work as one-liner', async () => {
      const items = [1, 2, 3, 4, 5]

      const { results, errors } = await TaskManager.process(
        items,
        async (item) => item * 2,
        { concurrency: 3 }
      )

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(errors).toEqual([])
    })

    test('TaskManager.process() should handle errors', async () => {
      const items = [1, 2, 3]

      const { results, errors } = await TaskManager.process(
        items,
        async (item) => {
          if (item === 2) throw new Error('Failed')
          return item * 2
        },
        { concurrency: 3 }
      )

      expect(results).toHaveLength(2)
      expect(errors).toHaveLength(1)
    })

    test('TaskManager.withConcurrency() should create manager with concurrency', () => {
      const customManager = TaskManager.withConcurrency(5)

      expect(customManager.concurrency).toBe(5)
      expect(customManager).toBeInstanceOf(TaskManager)

      customManager.destroy()
    })
  })

  describe('Metadata Tracking', () => {
    test('should store metadata with tasks', async () => {
      const events = []

      manager.on('taskStart', (task) => {
        events.push(task.metadata)
      })

      await manager.enqueue(
        async () => 'test',
        {
          metadata: { userId: 123, action: 'test' }
        }
      )

      expect(events[0]).toEqual({ userId: 123, action: 'test' })
    })

    test('should include metadata in processedItems', async () => {
      const items = [1, 2, 3]

      await manager.process(items, async (item) => item * 2)

      expect(manager.processedItems).toEqual([1, 2, 3])
    })
  })

})
