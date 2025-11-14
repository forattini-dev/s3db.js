/**
 * Strategy Pattern Tests - Verify TaskManager and OperationsPool implement TaskExecutor interface
 */

import { TaskManager } from '../src/task-manager.class.js'
import { OperationsPool } from '../src/concerns/operations-pool.js'
import { TaskExecutor } from '../src/concurrency/index.js'

describe('TaskExecutor Strategy Pattern', () => {
  describe('Interface Implementation', () => {
    test('TaskManager implements TaskExecutor interface', () => {
      const manager = new TaskManager()

      // Verify all required methods exist
      expect(typeof manager.enqueue).toBe('function')
      expect(typeof manager.process).toBe('function')
      expect(typeof manager.setConcurrency).toBe('function')
      expect(typeof manager.getConcurrency).toBe('function')
      expect(typeof manager.pause).toBe('function')
      expect(typeof manager.resume).toBe('function')
      expect(typeof manager.stop).toBe('function')
      expect(typeof manager.destroy).toBe('function')
      expect(typeof manager.getStats).toBe('function')

      manager.destroy()
    })

    test('OperationsPool implements TaskExecutor interface', () => {
      const pool = new OperationsPool()

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
    test('TaskManager and OperationsPool both execute single tasks', async () => {
      const manager = new TaskManager({ concurrency: 2 })
      const pool = new OperationsPool({ concurrency: 2 })

      let managerResult = null
      let poolResult = null

      // TaskManager enqueue
      managerResult = await manager.enqueue(async () => {
        return 'manager-executed'
      })

      // OperationsPool enqueue
      poolResult = await pool.enqueue(async () => {
        return 'pool-executed'
      })

      expect(managerResult).toBe('manager-executed')
      expect(poolResult).toBe('pool-executed')

      manager.destroy()
      pool.stop()
    })

    test('TaskManager and OperationsPool both process batches', async () => {
      const manager = new TaskManager({ concurrency: 2 })
      const pool = new OperationsPool({ concurrency: 2 })

      const items = [1, 2, 3]

      // TaskManager batch processing
      const managerResult = await manager.process(items, async (item) => {
        return item * 2
      })

      // OperationsPool batch processing
      const poolResult = await pool.addBatch(
        items.map(item => async () => item * 2)
      )

      expect(managerResult.results).toEqual([2, 4, 6])
      expect(poolResult.results).toEqual([2, 4, 6])

      manager.destroy()
      pool.stop()
    })
  })

  describe('Interchangeability - Concurrency Management', () => {
    test('Both implementations support getting/setting concurrency', () => {
      const manager = new TaskManager({ concurrency: 3 })
      const pool = new OperationsPool({ concurrency: 3 })

      expect(manager.getConcurrency()).toBe(3)
      expect(pool.getConcurrency()).toBe(3)

      manager.setConcurrency(5)
      pool.setConcurrency(5)

      expect(manager.getConcurrency()).toBe(5)
      expect(pool.getConcurrency()).toBe(5)

      manager.destroy()
      pool.stop()
    })

    test('Both implementations throw on invalid concurrency', () => {
      const manager = new TaskManager()
      const pool = new OperationsPool()

      expect(() => manager.setConcurrency(0)).toThrow()
      expect(() => pool.setConcurrency(0)).toThrow()

      manager.destroy()
      pool.stop()
    })
  })

  describe('Interchangeability - Lifecycle Control', () => {
    test('Both implementations support pause/resume', async () => {
      const manager = new TaskManager({ concurrency: 1 })
      const pool = new OperationsPool({ concurrency: 1 })

      // TaskManager pause/resume
      manager.pause()
      expect(manager.paused).toBe(true)
      manager.resume()
      expect(manager.paused).toBe(false)

      // OperationsPool pause/resume
      pool.pause()
      expect(pool.paused).toBe(true)
      pool.resume()
      expect(pool.paused).toBe(false)

      manager.destroy()
      pool.stop()
    })

    test('Both implementations support stop', async () => {
      const manager = new TaskManager()
      const pool = new OperationsPool()

      manager.stop()
      expect(manager.stopped).toBe(true)

      pool.stop()
      expect(pool.stopped).toBe(true)
    })
  })

  describe('Interchangeability - Statistics', () => {
    test('Both implementations provide statistics', async () => {
      const manager = new TaskManager({ concurrency: 2 })
      const pool = new OperationsPool({ concurrency: 2 })

      // Execute some tasks
      await manager.enqueue(async () => 'test')
      await pool.enqueue(async () => 'test')

      const managerStats = manager.getStats()
      const poolStats = pool.getStats()

      // Both should have core stat fields
      expect(managerStats).toHaveProperty('queueSize')
      expect(managerStats).toHaveProperty('activeCount')
      expect(managerStats).toHaveProperty('processedCount')
      expect(managerStats).toHaveProperty('errorCount')

      expect(poolStats).toHaveProperty('queueSize')
      expect(poolStats).toHaveProperty('activeCount')
      expect(poolStats).toHaveProperty('processedCount')
      expect(poolStats).toHaveProperty('errorCount')

      manager.destroy()
      pool.stop()
    })
  })

  describe('Client Integration - MemoryClient with TaskExecutor', () => {
    test('MemoryClient can use TaskManager via taskExecutor config', async () => {
      const { MemoryClient } = await import('../src/clients/memory-client.class.js')

      const customTaskManager = new TaskManager({ concurrency: 3 })
      const client = new MemoryClient({
        taskExecutor: customTaskManager,
        bucket: 'test-bucket'
      })

      // Verify the client uses the provided executor
      expect(client.taskManager).toBe(customTaskManager)
      expect(client.taskManager.getConcurrency()).toBe(3)

      customTaskManager.destroy()
    })

    test('MemoryClient creates default TaskManager when not provided', async () => {
      const { MemoryClient } = await import('../src/clients/memory-client.class.js')

      const client = new MemoryClient({
        bucket: 'test-bucket',
        concurrency: 4
      })

      // Verify default TaskManager was created with config
      expect(client.taskManager).toBeInstanceOf(TaskManager)
      expect(client.taskManager.getConcurrency()).toBe(4)

      client.taskManager.destroy()
    })
  })

  describe('Client Integration - FileSystemClient with TaskExecutor', () => {
    test('FileSystemClient can use TaskManager via taskExecutor config', async () => {
      const { FileSystemClient } = await import('../src/clients/filesystem-client.class.js')

      const customTaskManager = new TaskManager({ concurrency: 3 })
      const client = new FileSystemClient({
        taskExecutor: customTaskManager,
        basePath: './test-fs'
      })

      // Verify the client uses the provided executor
      expect(client.taskManager).toBe(customTaskManager)
      expect(client.taskManager.getConcurrency()).toBe(3)

      customTaskManager.destroy()
    })

    test('FileSystemClient creates default TaskManager when not provided', async () => {
      const { FileSystemClient } = await import('../src/clients/filesystem-client.class.js')

      const client = new FileSystemClient({
        basePath: './test-fs',
        concurrency: 4
      })

      // Verify default TaskManager was created with config
      expect(client.taskManager).toBeInstanceOf(TaskManager)
      expect(client.taskManager.getConcurrency()).toBe(4)

      client.taskManager.destroy()
    })
  })
})
