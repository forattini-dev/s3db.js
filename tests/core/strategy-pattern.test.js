/**
 * Strategy Pattern Tests - Verify TaskManager and OperationsPool implement TaskExecutor interface
 */

import { TasksRunner } from '../../src/tasks/tasks-runner.class.js'
import { TasksPool } from '../../src/tasks/tasks-pool.class.js'
import { TaskExecutor } from '../../src/concurrency/index.js'

describe('TaskExecutor Strategy Pattern', () => {
  describe('Interface Implementation', () => {
    test('TasksRunner implements TaskExecutor interface', () => {
      const runner = new TasksRunner()

      // Verify all required methods exist
      expect(typeof runner.enqueue).toBe('function')
      expect(typeof runner.process).toBe('function')
      expect(typeof runner.setConcurrency).toBe('function')
      expect(typeof runner.getConcurrency).toBe('function')
      expect(typeof runner.pause).toBe('function')
      expect(typeof runner.resume).toBe('function')
      expect(typeof runner.stop).toBe('function')
      expect(typeof runner.destroy).toBe('function')
      expect(typeof runner.getStats).toBe('function')

      runner.destroy()
    })

    test('TasksPool implements TaskExecutor interface', () => {
      const pool = new TasksPool()

      // Verify all required methods exist
      expect(typeof pool.enqueue).toBe('function')
      expect(typeof pool.addBatch).toBe('function')
      expect(typeof pool.setConcurrency).toBe('function')
      expect(typeof pool.getConcurrency).toBe('function')
      expect(typeof pool.pause).toBe('function')
      expect(typeof pool.resume).toBe('function')
      expect(typeof pool.stop).toBe('function')
      expect(typeof pool.drain).toBe('function')
      expect(typeof pool.getStats).toBe('function')

      pool.stop()
    })
  })

  describe('Interchangeability - Basic Operations', () => {
    test('TasksRunner and TasksPool both execute single tasks', async () => {
      const runner = new TasksRunner({ concurrency: 2 })
      const pool = new TasksPool({ concurrency: 2 })

      let runnerResult = null
      let poolResult = null

      // TasksRunner enqueue
      runnerResult = await runner.enqueue(async () => {
        return 'runner-executed'
      })

      // TasksPool enqueue
      poolResult = await pool.enqueue(async () => {
        return 'pool-executed'
      })

      expect(runnerResult).toBe('runner-executed')
      expect(poolResult).toBe('pool-executed')

      runner.destroy()
      pool.stop()
    })

    test('TasksRunner and TasksPool both process batches', async () => {
      const runner = new TasksRunner({ concurrency: 2 })
      const pool = new TasksPool({ concurrency: 2 })

      const items = [1, 2, 3]

      // TasksRunner batch processing
      const runnerResult = await runner.process(items, async (item) => {
        return item * 2
      })

      // TasksPool batch processing
      const poolResult = await pool.addBatch(
        items.map(item => async () => item * 2)
      )

      expect(runnerResult.results).toEqual([2, 4, 6])
      expect(poolResult.results).toEqual([2, 4, 6])

      runner.destroy()
      pool.stop()
    })
  })

  describe('Interchangeability - Concurrency Management', () => {
    test('Both implementations support getting/setting concurrency', () => {
      const runner = new TasksRunner({ concurrency: 3 })
      const pool = new TasksPool({ concurrency: 3 })

      expect(runner.getConcurrency()).toBe(3)
      expect(pool.getConcurrency()).toBe(3)

      runner.setConcurrency(5)
      pool.setConcurrency(5)

      expect(runner.getConcurrency()).toBe(5)
      expect(pool.getConcurrency()).toBe(5)

      runner.destroy()
      pool.stop()
    })

    test('Both implementations throw on invalid concurrency', () => {
      const runner = new TasksRunner()
      const pool = new TasksPool()

      expect(() => runner.setConcurrency(0)).toThrow()
      expect(() => pool.setConcurrency(0)).toThrow()

      runner.destroy()
      pool.stop()
    })
  })

  describe('Interchangeability - Lifecycle Control', () => {
    test('Both implementations support pause/resume', async () => {
      const runner = new TasksRunner({ concurrency: 1 })
      const pool = new TasksPool({ concurrency: 1 })

      // TasksRunner pause/resume
      runner.pause()
      expect(runner.paused).toBe(true)
      runner.resume()
      expect(runner.paused).toBe(false)

      // TasksPool pause/resume
      pool.pause()
      expect(pool.paused).toBe(true)
      pool.resume()
      expect(pool.paused).toBe(false)

      runner.destroy()
      pool.stop()
    })

    test('Both implementations support stop', async () => {
      const runner = new TasksRunner()
      const pool = new TasksPool()

      runner.stop()
      expect(runner.stopped).toBe(true)

      pool.stop()
      expect(pool.stopped).toBe(true)
    })
  })

  describe('Interchangeability - Statistics', () => {
    test('Both implementations provide statistics', async () => {
      const runner = new TasksRunner({ concurrency: 2 })
      const pool = new TasksPool({ concurrency: 2 })

      // Execute some tasks
      await runner.enqueue(async () => 'test')
      await pool.enqueue(async () => 'test')

      const runnerStats = runner.getStats()
      const poolStats = pool.getStats()

      // Both should have core stat fields
      expect(runnerStats).toHaveProperty('queueSize')
      expect(runnerStats).toHaveProperty('activeCount')
      expect(runnerStats).toHaveProperty('processedCount')
      expect(runnerStats).toHaveProperty('errorCount')

      expect(poolStats).toHaveProperty('queueSize')
      expect(poolStats).toHaveProperty('activeCount')
      expect(poolStats).toHaveProperty('processedCount')
      expect(poolStats).toHaveProperty('errorCount')

      runner.destroy()
      pool.stop()
    })
  })

  describe('Client Integration - MemoryClient with TaskExecutor', () => {
    test('MemoryClient can use TasksRunner via taskExecutor config', async () => {
      const { MemoryClient } = await import('../../src/clients/memory-client.class.js')

      const customRunner = new TasksRunner({ concurrency: 3 })
      const client = new MemoryClient({
        taskExecutor: customRunner,
        bucket: 'test-bucket'
      })

      // Verify the client uses the provided executor
      expect(client.taskManager).toBe(customRunner)
      expect(client.taskManager.getConcurrency()).toBe(3)

      customRunner.destroy()
    })

    test('MemoryClient creates default TasksRunner when not provided', async () => {
      const { MemoryClient } = await import('../../src/clients/memory-client.class.js')

      const client = new MemoryClient({
        bucket: 'test-bucket',
        concurrency: 4
      })

      // Verify default TasksRunner was created with config
      expect(client.taskManager).toBeInstanceOf(TasksRunner)
      expect(client.taskManager.getConcurrency()).toBe(4)

      client.taskManager.destroy()
    })
  })

  describe('Client Integration - FileSystemClient with TaskExecutor', () => {
    test('FileSystemClient can use TasksRunner via taskExecutor config', async () => {
      const { FileSystemClient } = await import('../../src/clients/filesystem-client.class.js')

      const customRunner = new TasksRunner({ concurrency: 3 })
      const client = new FileSystemClient({
        taskExecutor: customRunner,
        basePath: './test-fs'
      })

      // Verify the client uses the provided executor
      expect(client.taskManager).toBe(customRunner)
      expect(client.taskManager.getConcurrency()).toBe(3)

      customRunner.destroy()
    })

    test('FileSystemClient creates default TasksRunner when not provided', async () => {
      const { FileSystemClient } = await import('../../src/clients/filesystem-client.class.js')

      const client = new FileSystemClient({
        basePath: './test-fs',
        concurrency: 4
      })

      // Verify default TasksRunner was created with config
      expect(client.taskManager).toBeInstanceOf(TasksRunner)
      expect(client.taskManager.getConcurrency()).toBe(4)

      client.taskManager.destroy()
    })
  })
})
