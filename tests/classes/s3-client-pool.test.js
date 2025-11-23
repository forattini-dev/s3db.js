import { describe, test, expect } from '@jest/globals'
import { S3Client } from '#src/clients/s3-client.class.js'

describe('TasksPool in S3Client', () => {
  let client

  afterEach(async () => {
    if (client && client.taskExecutor) {
      await client.drainPool()
      client.stopPool()
    }
  })

  test('should work without TasksPool by default', () => {
    client = new S3Client({
      connectionString: 'memory://test-no-pool/db'
    })

    expect(client.taskExecutor).toBeNull()
    expect(client.taskExecutorConfig.enabled).toBe(false)
  })

  test('should enable TasksPool when configured', () => {
    client = new S3Client({
      connectionString: 'memory://test-with-pool/db',
      taskExecutor: {
        enabled: true,
        concurrency: 25
      }
    })

    expect(client.taskExecutor).not.toBeNull()
    expect(client.taskExecutorConfig.enabled).toBe(true)
    expect(client.taskExecutorConfig.concurrency).toBe(25)
  })

  test('should work with explicit disabled config', () => {
    client = new S3Client({
      connectionString: 'memory://test-disabled/db',
      taskExecutor: false
    })

    expect(client.taskExecutor).toBeNull()
    expect(client.taskExecutorConfig.enabled).toBe(false)
  })

  test('should provide pool statistics methods', () => {
    client = new S3Client({
      connectionString: 'memory://test-stats/db',
      taskExecutor: {
        enabled: true,
        concurrency: 10
      }
    })

    expect(typeof client.getQueueStats).toBe('function')
    expect(typeof client.getAggregateMetrics).toBe('function')
    expect(typeof client.pausePool).toBe('function')
    expect(typeof client.resumePool).toBe('function')
    expect(typeof client.drainPool).toBe('function')
    expect(typeof client.stopPool).toBe('function')

    const stats = client.getQueueStats()
    expect(stats).not.toBeNull()
    expect(stats.queueSize).toBe(0)
    expect(stats.activeCount).toBe(0)
    expect(stats.processedCount).toBe(0)
  })

  test('should return null for stats when pool disabled', () => {
    client = new S3Client({
      connectionString: 'memory://test-no-stats/db'
    })

    const stats = client.getQueueStats()
    expect(stats).toBeNull()

    const metrics = client.getAggregateMetrics()
    expect(metrics).toBeNull()
  })

  test('should handle auto concurrency', () => {
    client = new S3Client({
      connectionString: 'memory://test-auto/db',
      taskExecutor: {
        enabled: true,
        concurrency: 'auto'
      }
    })

    expect(client.taskExecutor).not.toBeNull()
    expect(client.taskExecutor.autotune).not.toBeNull()
    expect(client.taskExecutor.concurrency).toBeGreaterThan(0)
  })

  test('should handle manual concurrency with autotune', () => {
    client = new S3Client({
      connectionString: 'memory://test-manual-tune/db',
      taskExecutor: {
        enabled: true,
        concurrency: 50,
        autotune: {
          enabled: true,
          targetLatency: 100,
          minConcurrency: 10,
          maxConcurrency: 200
        }
      }
    })

    expect(client.taskExecutor).not.toBeNull()
    expect(client.taskExecutor.autotune).not.toBeNull()
    expect(client.taskExecutor.concurrency).toBe(50)
  })

  test('should forward pool events to client', (done) => {
    client = new S3Client({
      connectionString: 'memory://test-events/db',
      taskExecutor: {
        enabled: true,
        concurrency: 5
      }
    })

    const events = []

    client.on('pool:taskStarted', (task) => {
      events.push({ type: 'start', task: task.id })
    })

    client.on('pool:taskCompleted', (task, result) => {
      events.push({ type: 'complete', task: task.id })

      // Check that both events were emitted
      expect(events.some(e => e.type === 'start')).toBe(true)
      expect(events.some(e => e.type === 'complete')).toBe(true)
      done()
    })

    // Enqueue a simple operation
    client.taskExecutor.enqueue(async () => {
      return 'test result'
    })
  })

  test('should configure retry and timeout options', () => {
    client = new S3Client({
      connectionString: 'memory://test-retry/db',
      taskExecutor: {
        enabled: true,
        concurrency: 10,
        retries: 5,
        retryDelay: 500,
        timeout: 10000,
        retryableErrors: ['NetworkError', 'TimeoutError']
      }
    })

    expect(client.taskExecutorConfig.retries).toBe(5)
    expect(client.taskExecutorConfig.retryDelay).toBe(500)
    expect(client.taskExecutorConfig.timeout).toBe(10000)
    expect(client.taskExecutorConfig.retryableErrors).toEqual(['NetworkError', 'TimeoutError'])
  })

  test('should execute operations through pool', async () => {
    client = new S3Client({
      connectionString: 'memory://test-execute/db',
      taskExecutor: {
        enabled: true,
        concurrency: 5
      }
    })

    // Execute multiple operations
    const results = await Promise.all([
      client._executeOperation(async () => 'result1'),
      client._executeOperation(async () => 'result2'),
      client._executeOperation(async () => 'result3')
    ])

    expect(results).toEqual(['result1', 'result2', 'result3'])

    const stats = client.getQueueStats()
    expect(stats.processedCount).toBe(3)
    expect(stats.errorCount).toBe(0)
  })

  test('should bypass pool when bypassPool option is true', async () => {
    client = new S3Client({
      connectionString: 'memory://test-bypass/db',
      taskExecutor: {
        enabled: true,
        concurrency: 5
      }
    })

    // Execute with bypass
    const result = await client._executeOperation(
      async () => 'bypassed',
      { bypassPool: true }
    )

    expect(result).toBe('bypassed')

    // Should not count towards pool stats
    const stats = client.getQueueStats()
    expect(stats.processedCount).toBe(0)
  })

  test('should handle priority options', async () => {
    client = new S3Client({
      connectionString: 'memory://test-priority/db',
      taskExecutor: {
        enabled: true,
        concurrency: 1 // Low concurrency to test priority
      }
    })

    const executionOrder = []

    // Pause the pool first so tasks queue up
    await client.pausePool()

    // Enqueue low priority tasks
    const lowPriority = [
      client._executeOperation(async () => {
        executionOrder.push('low1')
        return 'low1'
      }, { priority: 0 }),
      client._executeOperation(async () => {
        executionOrder.push('low2')
        return 'low2'
      }, { priority: 0 })
    ]

    // Enqueue high priority task
    const highPriority = client._executeOperation(async () => {
      executionOrder.push('high')
      return 'high'
    }, { priority: 100 })

    // Resume pool - now all tasks are queued and will execute in priority order
    client.resumePool()

    await Promise.all([...lowPriority, highPriority])

    // High priority should execute first (after pool is resumed)
    expect(executionOrder).toEqual(['high', 'low1', 'low2'])
  })
})
