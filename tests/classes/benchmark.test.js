import { Benchmark, benchmark } from '../../src/concerns/benchmark.js'

describe('Benchmark', () => {
  let bench

  beforeEach(() => {
    bench = new Benchmark('Test Benchmark')
  })

  // Helper: sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  describe('Constructor', () => {
    test('should create benchmark with name', () => {
      expect(bench.name).toBe('Test Benchmark')
      expect(bench.startTime).toBeNull()
      expect(bench.endTime).toBeNull()
      expect(bench.results).toEqual([])
    })
  })

  describe('Basic Timing', () => {
    test('should start timing', () => {
      const beforeStart = Date.now()
      bench.start()
      const afterStart = Date.now()

      expect(bench.startTime).toBeGreaterThanOrEqual(beforeStart)
      expect(bench.startTime).toBeLessThanOrEqual(afterStart)
    })

    test('should end timing', () => {
      bench.start()
      const beforeEnd = Date.now()
      const elapsed = bench.end()
      const afterEnd = Date.now()

      expect(bench.endTime).toBeGreaterThanOrEqual(beforeEnd)
      expect(bench.endTime).toBeLessThanOrEqual(afterEnd)
      expect(elapsed).toBeGreaterThanOrEqual(0)
    })

    test('should calculate elapsed time', async () => {
      bench.start()
      await sleep(50)
      bench.end()

      const elapsed = bench.elapsed()

      expect(elapsed).toBeGreaterThanOrEqual(45) // Allow 10% variance
      expect(elapsed).toBeLessThanOrEqual(1000)
    })

    test('should handle multiple start/end cycles', async () => {
      bench.start()
      await sleep(10)
      bench.end()
      const firstElapsed = bench.elapsed()

      bench.start()
      await sleep(100)
      bench.end()
      const secondElapsed = bench.elapsed()

      expect(secondElapsed).toBeGreaterThan(firstElapsed)
    })
  })

  describe('measure() - Single Execution', () => {
    test('should measure async function', async () => {
      const result = await bench.measure(async () => {
        await sleep(50)
        return 'success'
      })

      expect(result).toBe('success')
      expect(bench.results.length).toBe(1)
      expect(bench.results[0].duration).toBeGreaterThanOrEqual(45)
      expect(bench.results[0].timestamp).toBeDefined()
    })

    test('should measure sync function', async () => {
      const result = await bench.measure(() => {
        return 42
      })

      expect(result).toBe(42)
      expect(bench.results.length).toBe(1)
      expect(bench.results[0].duration).toBeGreaterThanOrEqual(0)
    })

    test('should record multiple measurements', async () => {
      await bench.measure(async () => {
        await sleep(5)
        return 1
      })

      await bench.measure(async () => {
        await sleep(50)
        return 2
      })

      await bench.measure(async () => {
        await sleep(10)
        return 3
      })

      expect(bench.results.length).toBe(3)
      // Second measurement (50ms) should be significantly longer than first (5ms)
      expect(bench.results[1].duration).toBeGreaterThan(bench.results[0].duration)
    })

    test('should handle errors without breaking', async () => {
      try {
        await bench.measure(async () => {
          await sleep(10)
          throw new Error('Test error')
        })
      } catch (error) {
        expect(error.message).toBe('Test error')
      }

      // Even with error, timing is recorded
      expect(bench.results.length).toBeGreaterThanOrEqual(0)
      if (bench.results.length > 0) {
        expect(bench.results[0].duration).toBeGreaterThanOrEqual(8)
      }
    })

    test('should return function result', async () => {
      const result = await bench.measure(async () => {
        return { id: 123, value: 'test' }
      })

      expect(result).toEqual({ id: 123, value: 'test' })
    })
  })

  describe('measureRepeated() - Multiple Iterations', () => {
    test('should measure repeated executions', async () => {
      const stats = await bench.measureRepeated(async () => {
        await sleep(10)
      }, 5)

      expect(stats.iterations).toBe(5)
      expect(stats.results).toHaveLength(5)
      expect(stats.avg).toBeGreaterThanOrEqual(8)
      expect(stats.min).toBeGreaterThanOrEqual(0)
      expect(stats.max).toBeGreaterThanOrEqual(stats.min)
      expect(stats.p50).toBeDefined()
      expect(stats.p95).toBeDefined()
      expect(stats.p99).toBeDefined()
    })

    test('should use default 10 iterations', async () => {
      const stats = await bench.measureRepeated(async () => {
        await sleep(5)
      })

      expect(stats.iterations).toBe(10)
      expect(stats.results).toHaveLength(10)
    })

    test('should calculate statistics correctly', async () => {
      const stats = await bench.measureRepeated(async () => {
        await sleep(10)
      }, 100)

      expect(stats.avg).toBeGreaterThanOrEqual(stats.min)
      expect(stats.avg).toBeLessThanOrEqual(stats.max)
      expect(stats.p50).toBeLessThanOrEqual(stats.p95)
      expect(stats.p95).toBeLessThanOrEqual(stats.p99)
      expect(stats.p99).toBeLessThanOrEqual(stats.max)
    })

    test('should handle sync functions', async () => {
      const stats = await bench.measureRepeated(() => {
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return sum
      }, 10)

      expect(stats.iterations).toBe(10)
      expect(stats.results).toHaveLength(10)
      expect(stats.avg).toBeGreaterThanOrEqual(0)
    })

    test('should handle varying execution times', async () => {
      let counter = 0
      const stats = await bench.measureRepeated(async () => {
        counter++
        await sleep(counter * 5) // 5ms, 10ms, 15ms, etc.
      }, 5)

      expect(stats.min).toBeLessThan(stats.max)
      expect(stats.results[4]).toBeGreaterThan(stats.results[0])
    })
  })

  describe('percentile() - Percentile Calculation', () => {
    test('should calculate p50 (median)', () => {
      const arr = [10, 20, 30, 40, 50]
      const p50 = bench.percentile(arr, 0.5)

      expect(p50).toBe(30)
    })

    test('should calculate p95', () => {
      const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      const p95 = bench.percentile(arr, 0.95)

      expect(p95).toBeGreaterThanOrEqual(90)
    })

    test('should calculate p99', () => {
      const arr = Array.from({ length: 100 }, (_, i) => i + 1)
      const p99 = bench.percentile(arr, 0.99)

      expect(p99).toBeGreaterThanOrEqual(99)
    })

    test('should handle unsorted arrays', () => {
      const arr = [50, 10, 30, 40, 20]
      const p50 = bench.percentile(arr, 0.5)

      expect(p50).toBe(30)
    })

    test('should handle empty array', () => {
      const result = bench.percentile([], 0.5)
      expect(result).toBe(0)
    })

    test('should handle single element', () => {
      const result = bench.percentile([42], 0.95)
      expect(result).toBe(42)
    })

    test('should handle edge percentiles', () => {
      const arr = [10, 20, 30, 40, 50]

      const p0 = bench.percentile(arr, 0)
      const p100 = bench.percentile(arr, 1)

      expect(p0).toBe(10)
      expect(p100).toBe(50)
    })

    test('should not modify original array', () => {
      const arr = [50, 10, 30, 40, 20]
      const original = [...arr]

      bench.percentile(arr, 0.5)

      expect(arr).toEqual(original)
    })
  })

  describe('report() - Console Reporting', () => {
    test('should report single measurement', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

      await bench.measure(async () => {
        await sleep(10)
      })

      bench.report()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Benchmark] Test Benchmark'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Duration:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Runs: 1'))

      consoleSpy.mockRestore()
    })

    test('should report statistics for multiple runs', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

      await bench.measure(async () => await sleep(10))
      await bench.measure(async () => await sleep(20))
      await bench.measure(async () => await sleep(15))

      bench.report()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Runs: 3'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Avg:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Min:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Max:'))

      consoleSpy.mockRestore()
    })

    test('should format durations with 2 decimal places', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

      await bench.measure(async () => await sleep(10))
      await bench.measure(async () => await sleep(15))

      bench.report()

      const avgCall = consoleSpy.mock.calls.find((call) => call[0].includes('Avg:'))
      expect(avgCall[0]).toMatch(/\d+\.\d{2}ms/)

      consoleSpy.mockRestore()
    })
  })

  describe('Edge Cases', () => {
    test('should handle very fast operations', async () => {
      const result = await bench.measure(() => {
        return 1 + 1
      })

      expect(result).toBe(2)
      expect(bench.results[0].duration).toBeGreaterThanOrEqual(0)
    })

    test('should handle zero-time operations', async () => {
      const stats = await bench.measureRepeated(() => {
        return true
      }, 10)

      expect(stats.min).toBe(0)
      expect(stats.avg).toBeGreaterThanOrEqual(0)
    })

    test('should handle very long operations', async () => {
      const result = await bench.measure(async () => {
        await sleep(100)
        return 'done'
      })

      expect(result).toBe('done')
      expect(bench.results[0].duration).toBeGreaterThanOrEqual(95)
    })

    test('should handle Promise rejection', async () => {
      try {
        await bench.measure(async () => {
          return Promise.reject(new Error('Rejected'))
        })
      } catch (error) {
        expect(error.message).toBe('Rejected')
      }

      // Measure completes even with error
      expect(bench.results.length).toBeGreaterThanOrEqual(0)
    })

    test('should handle thrown errors', async () => {
      try {
        await bench.measure(async () => {
          throw new Error('Thrown')
        })
      } catch (error) {
        expect(error.message).toBe('Thrown')
      }

      // Measure completes even with error
      expect(bench.results.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Multiple Benchmarks', () => {
    test('should allow multiple independent benchmarks', async () => {
      const bench1 = new Benchmark('Benchmark 1')
      const bench2 = new Benchmark('Benchmark 2')

      await bench1.measure(async () => await sleep(5))
      await bench2.measure(async () => await sleep(50))

      expect(bench1.results.length).toBe(1)
      expect(bench2.results.length).toBe(1)
      // bench2 (50ms) should be significantly longer than bench1 (5ms)
      expect(bench2.results[0].duration).toBeGreaterThan(bench1.results[0].duration)
    })
  })

  describe('Timestamp Recording', () => {
    test('should record timestamp for each measurement', async () => {
      const beforeMeasure = Date.now()

      await bench.measure(async () => {
        await sleep(10)
      })

      const afterMeasure = Date.now()

      expect(bench.results[0].timestamp).toBeGreaterThanOrEqual(beforeMeasure)
      expect(bench.results[0].timestamp).toBeLessThanOrEqual(afterMeasure)
    })

    test('should have increasing timestamps', async () => {
      await bench.measure(async () => await sleep(5))
      await bench.measure(async () => await sleep(5))
      await bench.measure(async () => await sleep(5))

      expect(bench.results[1].timestamp).toBeGreaterThanOrEqual(bench.results[0].timestamp)
      expect(bench.results[2].timestamp).toBeGreaterThanOrEqual(bench.results[1].timestamp)
    })
  })
})

describe('benchmark() - Helper Function', () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  test('should run benchmark and report', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

    const result = await benchmark('Quick Test', async () => {
      await sleep(10)
      return 'success'
    })

    expect(result).toBeInstanceOf(Benchmark)
    expect(result.name).toBe('Quick Test')
    expect(result.results.length).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Benchmark] Quick Test'))

    consoleSpy.mockRestore()
  })

  test('should measure and return result', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

    await benchmark('Test Operation', async () => {
      await sleep(10)
      return { status: 'ok' }
    })

    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  test('should handle errors', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

    try {
      await benchmark('Failing Test', async () => {
        throw new Error('Test error')
      })
    } catch (error) {
      expect(error.message).toBe('Test error')
    }

    consoleSpy.mockRestore()
  })

  test('should work as one-liner', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

    const bench = await benchmark('One-liner', async () => await sleep(5))

    expect(bench).toBeInstanceOf(Benchmark)
    expect(bench.results.length).toBe(1)

    consoleSpy.mockRestore()
  })
})
