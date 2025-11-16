import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { PerformanceMonitor } from '../../src/concerns/performance-monitor.js'

describe('PerformanceMonitor', () => {
  let monitor
  let mockDatabase

  beforeEach(() => {
    // Mock database with client methods
    mockDatabase = {
      client: {
        getQueueStats: jest.fn(() => ({
          queueSize: 10,
          activeCount: 5,
          processedCount: 100,
          errorCount: 2,
          concurrency: 10
        })),
        getAggregateMetrics: jest.fn(() => ({
          count: 100,
          avgExecution: 50,
          p95Execution: 95,
          avgQueueWait: 10
        }))
      }
    }

    monitor = new PerformanceMonitor(mockDatabase)
  })

  afterEach(() => {
    if (monitor) {
      monitor.stop()
    }
  })

  // Helper: sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  describe('Constructor', () => {
    test('should create monitor with database', () => {
      expect(monitor.db).toBe(mockDatabase)
      expect(monitor.snapshots).toEqual([])
      expect(monitor.intervalId).toBeNull()
    })
  })

  describe('start() - Start Monitoring', () => {
    test('should start monitoring with default interval', async () => {
      monitor.start(100) // 100ms for faster testing

      await sleep(120)

      expect(monitor.intervalId).not.toBeNull()
      expect(monitor.snapshots.length).toBeGreaterThan(0)
    })

    test('should use default 10s interval', async () => {
      monitor.start()

      expect(monitor.intervalId).not.toBeNull()
    })

    test('should take snapshots at specified interval', async () => {
      monitor.start(50) // 50ms intervals

      await sleep(160)

      expect(monitor.snapshots.length).toBeGreaterThanOrEqual(2)
    })

    test('should call takeSnapshot periodically', async () => {
      const takeSnapshotSpy = jest.spyOn(monitor, 'takeSnapshot')

      monitor.start(50)
      await sleep(120)

      expect(takeSnapshotSpy).toHaveBeenCalledTimes(2)

      takeSnapshotSpy.mockRestore()
    })
  })

  describe('stop() - Stop Monitoring', () => {
    test('should stop monitoring', async () => {
      monitor.start(100)

      await sleep(50)
      monitor.stop()

      const snapshotCountAfterStop = monitor.snapshots.length

      await sleep(150)

      expect(monitor.intervalId).toBeNull()
      expect(monitor.snapshots.length).toBe(snapshotCountAfterStop)
    })

    test('should clear interval', () => {
      monitor.start(100)
      const intervalId = monitor.intervalId

      monitor.stop()

      expect(monitor.intervalId).toBeNull()
      expect(intervalId).not.toBeNull()
    })

    test('should be safe to call multiple times', () => {
      monitor.start(100)
      monitor.stop()
      monitor.stop()

      expect(monitor.intervalId).toBeNull()
    })

    test('should be safe to call without starting', () => {
      expect(() => monitor.stop()).not.toThrow()
      expect(monitor.intervalId).toBeNull()
    })
  })

  describe('takeSnapshot() - Snapshot Collection', () => {
    test('should take snapshot with all metrics', () => {
      const beforeSnapshot = Date.now()
      const snapshot = monitor.takeSnapshot()
      const afterSnapshot = Date.now()

      expect(snapshot.timestamp).toBeGreaterThanOrEqual(beforeSnapshot)
      expect(snapshot.timestamp).toBeLessThanOrEqual(afterSnapshot)
      expect(snapshot.taskQueue).toBeDefined()
      expect(snapshot.performance).toBeDefined()
      expect(snapshot.system).toBeDefined()
    })

    test('should collect task queue metrics', () => {
      const snapshot = monitor.takeSnapshot()

      expect(snapshot.taskQueue).toEqual({
        queueSize: 10,
        activeCount: 5,
        processedCount: 100,
        errorCount: 2,
        concurrency: 10
      })

      expect(mockDatabase.client.getQueueStats).toHaveBeenCalled()
    })

    test('should collect performance metrics', () => {
      const snapshot = monitor.takeSnapshot()

      expect(snapshot.performance).toEqual({
        count: 100,
        avgExecution: 50,
        p95Execution: 95,
        avgQueueWait: 10
      })

      expect(mockDatabase.client.getAggregateMetrics).toHaveBeenCalled()
    })

    test('should collect system metrics', () => {
      const snapshot = monitor.takeSnapshot()

      expect(snapshot.system.memoryUsage).toBeDefined()
      expect(snapshot.system.memoryUsage.heapUsed).toBeGreaterThan(0)
      expect(snapshot.system.cpuUsage).toBeDefined()
      expect(snapshot.system.uptime).toBeGreaterThan(0)
    })

    test('should handle missing getQueueStats', () => {
      const dbWithoutQueueStats = { client: {} }
      const monitorWithoutQueueStats = new PerformanceMonitor(dbWithoutQueueStats)

      const snapshot = monitorWithoutQueueStats.takeSnapshot()

      expect(snapshot.taskQueue).toBeNull()
      expect(snapshot.system).toBeDefined()

      monitorWithoutQueueStats.stop()
    })

    test('should handle missing getAggregateMetrics', () => {
      const dbWithoutAggregateMetrics = {
        client: {
          getQueueStats: jest.fn(() => ({ queueSize: 5 }))
        }
      }
      const monitorWithoutAggregateMetrics = new PerformanceMonitor(dbWithoutAggregateMetrics)

      const snapshot = monitorWithoutAggregateMetrics.takeSnapshot()

      expect(snapshot.performance).toBeNull()
      expect(snapshot.taskQueue).toBeDefined()

      monitorWithoutAggregateMetrics.stop()
    })

    test('should add snapshot to snapshots array', () => {
      expect(monitor.snapshots.length).toBe(0)

      monitor.takeSnapshot()

      expect(monitor.snapshots.length).toBe(1)
    })

    test('should return snapshot object', () => {
      const snapshot = monitor.takeSnapshot()

      expect(snapshot).toBeDefined()
      expect(typeof snapshot).toBe('object')
      expect(snapshot.timestamp).toBeDefined()
    })

    test('should handle missing database reference', () => {
      const orphanMonitor = new PerformanceMonitor()
      const snapshot = orphanMonitor.takeSnapshot()

      expect(snapshot.taskQueue).toBeNull()
      expect(snapshot.performance).toBeNull()
      expect(snapshot.system).toBeDefined()

      orphanMonitor.stop()
    })
  })

  describe('Snapshot Retention', () => {
    test('should keep only last 100 snapshots', () => {
      for (let i = 0; i < 150; i++) {
        monitor.takeSnapshot()
      }

      expect(monitor.snapshots.length).toBe(100)
    })

    test('should remove oldest snapshots first', () => {
      const firstSnapshot = monitor.takeSnapshot()
      const firstTimestamp = firstSnapshot.timestamp

      for (let i = 0; i < 100; i++) {
        monitor.takeSnapshot()
      }

      const timestamps = monitor.snapshots.map((s) => s.timestamp)
      expect(timestamps).not.toContain(firstTimestamp)
    })

    test('should maintain chronological order', () => {
      for (let i = 0; i < 10; i++) {
        monitor.takeSnapshot()
      }

      const timestamps = monitor.snapshots.map((s) => s.timestamp)

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1])
      }
    })
  })

  describe('Console Logging', () => {
    test('should log snapshot summary', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      monitor.takeSnapshot()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[PerformanceMonitor]'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Queue:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Performance:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Concurrency:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Memory:'))

      consoleSpy.mockRestore()
    })

    test('should not log when taskQueue is null', () => {
      const dbWithoutQueueStats = { client: {} }
      const monitorWithoutQueueStats = new PerformanceMonitor(dbWithoutQueueStats)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      monitorWithoutQueueStats.takeSnapshot()

      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
      monitorWithoutQueueStats.stop()
    })

    test('should format memory in MB', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      monitor.takeSnapshot()

      const memoryCall = consoleSpy.mock.calls.find((call) => call[0].includes('Memory:'))
      expect(memoryCall[0]).toMatch(/\d+MB/)

      consoleSpy.mockRestore()
    })

    test('should format latencies with toFixed(0)', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      monitor.takeSnapshot()

      const perfCall = consoleSpy.mock.calls.find((call) => call[0].includes('Performance:'))
      expect(perfCall[0]).toMatch(/\d+ms/)

      consoleSpy.mockRestore()
    })
  })

  describe('getReport() - Aggregate Reporting', () => {
    test('should return null when no snapshots', () => {
      const report = monitor.getReport()

      expect(report).toBeNull()
    })

    test('should return report with duration', () => {
      monitor.takeSnapshot()
      sleep(50)
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.duration).toBeGreaterThanOrEqual(0)
      expect(report.snapshots).toBe(2)
    })

    test('should aggregate task queue metrics', () => {
      mockDatabase.client.getQueueStats
        .mockReturnValueOnce({
          queueSize: 10,
          activeCount: 5,
          processedCount: 100,
          errorCount: 2,
          concurrency: 10
        })
        .mockReturnValueOnce({
          queueSize: 15,
          activeCount: 8,
          processedCount: 200,
          errorCount: 5,
          concurrency: 10
        })

      monitor.takeSnapshot()
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.taskQueue).toBeDefined()
      expect(report.taskQueue.totalProcessed).toBe(100) // 200 - 100
      expect(report.taskQueue.totalErrors).toBe(3) // 5 - 2
      expect(report.taskQueue.avgQueueSize).toBeGreaterThan(0)
      expect(report.taskQueue.avgConcurrency).toBe(10)
    })

    test('should aggregate performance metrics', () => {
      mockDatabase.client.getAggregateMetrics
        .mockReturnValueOnce({
          count: 100,
          avgExecution: 50,
          p95Execution: 95
        })
        .mockReturnValueOnce({
          count: 200,
          avgExecution: 60,
          p95Execution: 100
        })

      monitor.takeSnapshot()
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.performance).toBeDefined()
      expect(report.performance.avgLatency).toBeGreaterThan(0)
      expect(report.performance.p95Latency).toBeGreaterThan(0)
    })

    test('should aggregate system metrics', () => {
      for (let i = 0; i < 5; i++) {
        monitor.takeSnapshot()
      }

      const report = monitor.getReport()

      expect(report.system).toBeDefined()
      expect(report.system.avgMemoryMB).toBeGreaterThan(0)
      expect(report.system.peakMemoryMB).toBeGreaterThan(0)
      expect(report.system.peakMemoryMB).toBeGreaterThanOrEqual(report.system.avgMemoryMB)
    })

    test('should handle null taskQueue', () => {
      const dbWithoutQueueStats = { client: {} }
      const monitorWithoutQueueStats = new PerformanceMonitor(dbWithoutQueueStats)

      monitorWithoutQueueStats.takeSnapshot()
      monitorWithoutQueueStats.takeSnapshot()

      const report = monitorWithoutQueueStats.getReport()

      expect(report.taskQueue).toBeNull()
      expect(report.system).toBeDefined()

      monitorWithoutQueueStats.stop()
    })

    test('should handle null performance', () => {
      const dbWithoutAggregateMetrics = {
        client: {
          getQueueStats: jest.fn(() => ({ queueSize: 5 }))
        }
      }
      const monitorWithoutAggregateMetrics = new PerformanceMonitor(dbWithoutAggregateMetrics)

      monitorWithoutAggregateMetrics.takeSnapshot()
      monitorWithoutAggregateMetrics.takeSnapshot()

      const report = monitorWithoutAggregateMetrics.getReport()

      expect(report.performance).toBeNull()
      expect(report.system).toBeDefined()

      monitorWithoutAggregateMetrics.stop()
    })

    test('should include snapshot count', () => {
      for (let i = 0; i < 10; i++) {
        monitor.takeSnapshot()
      }

      const report = monitor.getReport()

      expect(report.snapshots).toBe(10)
    })
  })

  describe('_avg() - Average Calculation', () => {
    test('should calculate average', () => {
      const avg = monitor._avg([10, 20, 30, 40, 50])
      expect(avg).toBe(30)
    })

    test('should handle empty array', () => {
      const avg = monitor._avg([])
      expect(avg).toBe(0)
    })

    test('should handle single element', () => {
      const avg = monitor._avg([42])
      expect(avg).toBe(42)
    })

    test('should handle decimal numbers', () => {
      const avg = monitor._avg([1.5, 2.5, 3.5])
      expect(avg).toBeCloseTo(2.5)
    })

    test('should handle negative numbers', () => {
      const avg = monitor._avg([-10, 0, 10])
      expect(avg).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    test('should handle rapid snapshot taking', () => {
      for (let i = 0; i < 50; i++) {
        monitor.takeSnapshot()
      }

      expect(monitor.snapshots.length).toBe(50)
    })

    test('should handle very long monitoring sessions', async () => {
      monitor.start(10) // Very fast snapshots

      await sleep(150)

      expect(monitor.snapshots.length).toBeGreaterThan(5)

      monitor.stop()
    })

    test('should handle database with partial client methods', () => {
      const partialDb = {
        client: {
          getQueueStats: jest.fn(() => ({ queueSize: 5 }))
          // Missing getAggregateMetrics
        }
      }

      const partialMonitor = new PerformanceMonitor(partialDb)
      const snapshot = partialMonitor.takeSnapshot()

      expect(snapshot.taskQueue).toBeDefined()
      expect(snapshot.performance).toBeNull()

      partialMonitor.stop()
    })

    test('should handle memory pressure scenarios', () => {
      for (let i = 0; i < 150; i++) {
        monitor.takeSnapshot()
      }

      const report = monitor.getReport()

      expect(report.system.avgMemoryMB).toBeGreaterThan(0)
      expect(report.system.peakMemoryMB).toBeGreaterThan(0)
    })
  })

  describe('Integration Scenarios', () => {
    test('should track queue growth over time', () => {
      mockDatabase.client.getQueueStats
        .mockReturnValueOnce({ queueSize: 10, activeCount: 5, processedCount: 100, errorCount: 0, concurrency: 10 })
        .mockReturnValueOnce({ queueSize: 20, activeCount: 5, processedCount: 100, errorCount: 0, concurrency: 10 })
        .mockReturnValueOnce({ queueSize: 30, activeCount: 5, processedCount: 100, errorCount: 0, concurrency: 10 })

      monitor.takeSnapshot()
      monitor.takeSnapshot()
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.taskQueue.avgQueueSize).toBe(20)
    })

    test('should track error rate over time', () => {
      mockDatabase.client.getQueueStats
        .mockReturnValueOnce({ queueSize: 10, activeCount: 5, processedCount: 100, errorCount: 0, concurrency: 10 })
        .mockReturnValueOnce({ queueSize: 10, activeCount: 5, processedCount: 150, errorCount: 5, concurrency: 10 })
        .mockReturnValueOnce({ queueSize: 10, activeCount: 5, processedCount: 200, errorCount: 10, concurrency: 10 })

      monitor.takeSnapshot()
      monitor.takeSnapshot()
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.taskQueue.totalErrors).toBe(10)
    })

    test('should track performance degradation', () => {
      mockDatabase.client.getAggregateMetrics
        .mockReturnValueOnce({ count: 100, avgExecution: 50, p95Execution: 80 })
        .mockReturnValueOnce({ count: 100, avgExecution: 100, p95Execution: 150 })
        .mockReturnValueOnce({ count: 100, avgExecution: 150, p95Execution: 200 })

      monitor.takeSnapshot()
      monitor.takeSnapshot()
      monitor.takeSnapshot()

      const report = monitor.getReport()

      expect(report.performance.avgLatency).toBeGreaterThan(50)
      expect(report.performance.p95Latency).toBeGreaterThan(80)
    })

    test('should work with real monitoring cycle', async () => {
      monitor.start(50)

      await sleep(160)

      monitor.stop()

      const report = monitor.getReport()

      expect(report).not.toBeNull()
      expect(report.snapshots).toBeGreaterThanOrEqual(2)
      expect(report.duration).toBeGreaterThan(0)
    })
  })

  describe('Start/Stop Cycles', () => {
    test('should support multiple start/stop cycles', async () => {
      monitor.start(50)
      await sleep(60)
      monitor.stop()

      const firstSnapshotCount = monitor.snapshots.length

      monitor.start(50)
      await sleep(60)
      monitor.stop()

      expect(monitor.snapshots.length).toBeGreaterThan(firstSnapshotCount)
    })

    test('should preserve snapshots across stop/start', async () => {
      monitor.start(50)
      await sleep(60)
      monitor.stop()

      const snapshotCountAfterFirstCycle = monitor.snapshots.length

      monitor.start(50)
      await sleep(60)
      monitor.stop()

      expect(monitor.snapshots.length).toBeGreaterThanOrEqual(snapshotCountAfterFirstCycle)
    })
  })
})
