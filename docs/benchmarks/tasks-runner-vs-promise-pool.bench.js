/**
 * Benchmark: TasksRunner vs @supercharge/promise-pool
 *
 * Usage:
 *   node docs/benchmarks/tasks-runner-vs-promise-pool.bench.js
 *
 * Tuning knobs (env):
 *   BENCH_CONCURRENCY=50
 *   BENCH_RUNS_PER_SCENARIO=3
 *   BENCH_UNIFORM_VECTOR_LENGTH=2000
 *   BENCH_MIXED_TASKS=250
 *   BENCH_MIXED_VECTOR_MIN=256
 *   BENCH_MIXED_VECTOR_MAX=4096
 *
 * Profiling helpers:
 *   BENCH_PROFILE=1                     # capture CPU profiles (first run per scenario)
 *   BENCH_PROFILE_FILTER="Runner"       # optional filter for scenario labels
 *   BENCH_PROFILE_EACH_RUN=1            # capture all RUNS_PER_SCENARIO iterations
 *   BENCH_PROFILE_DIR=tmp/benchmarks    # custom output directory
 */

import { TasksRunner } from '../../src/tasks/tasks-runner.class.js'
import { TasksPool } from '../../src/tasks/tasks-pool.class.js'
import { Benchmark } from '../../src/concerns/benchmark.js'
import { PerformanceMonitor } from '../../src/concerns/performance-monitor.js'
import { PromisePool } from '@supercharge/promise-pool'
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { Session } from 'node:inspector'
import { promises as fs } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CONCURRENCY = toPositiveInt(process.env.BENCH_CONCURRENCY, 50)
const RUNS_PER_SCENARIO = toPositiveInt(
  process.env.BENCH_RUNS_PER_SCENARIO ?? process.env.BENCH_RUNS,
  5
)
const UNIFORM_VECTOR_LENGTH = toPositiveInt(process.env.BENCH_UNIFORM_VECTOR_LENGTH, 5000)
const MIXED_TASKS = toPositiveInt(process.env.BENCH_MIXED_TASKS, 1000)
const UNIFORM_TASKS = toPositiveInt(process.env.BENCH_UNIFORM_TASKS, 1000)
const MIXED_VECTOR_MIN = toPositiveInt(process.env.BENCH_MIXED_VECTOR_MIN, 500)
const MIXED_VECTOR_MAX = toPositiveInt(process.env.BENCH_MIXED_VECTOR_MAX, 2000)
const PROFILE_ENABLED = parseBoolean(process.env.BENCH_PROFILE)
const PROFILE_FILTERS = parseList(process.env.BENCH_PROFILE_FILTER)
const PROFILE_ALL_RUNS = parseBoolean(process.env.BENCH_PROFILE_EACH_RUN)
const PROFILE_DIR = resolveProfileDir()

function parseBoolean (value) {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parseList (value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveProfileDir () {
  const customDir = process.env.BENCH_PROFILE_DIR
  if (customDir) {
    return resolve(process.cwd(), customDir)
  }
  return resolve(__dirname, '../../tmp/benchmarks/profiles')
}

function toPositiveInt (value, fallback) {
  if (value == null) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return fallback
}

function shouldProfileScenario (label, runIndex) {
  if (!PROFILE_ENABLED) {
    return false
  }
  if (!PROFILE_ALL_RUNS && runIndex > 0) {
    return false
  }
  if (PROFILE_FILTERS.length === 0) {
    return true
  }
  const normalized = label.toLowerCase()
  return PROFILE_FILTERS.some((filter) => normalized.includes(filter.toLowerCase()))
}

async function withCpuProfile (label, runIndex, fn) {
  const session = new Session()
  session.connect()
  try {
    await inspectorPost(session, 'Profiler.enable')
    await inspectorPost(session, 'Profiler.start')
  } catch (error) {
    session.disconnect()
    console.warn(`⚠️ Unable to start CPU profiler for ${label}:`, error)
    return await fn()
  }

  let result
  let runError
  try {
    result = await fn()
  } catch (err) {
    runError = err
  } finally {
    let profile = null
    try {
      const stopResult = await inspectorPost(session, 'Profiler.stop')
      profile = stopResult?.profile || stopResult
    } catch (stopError) {
      console.warn(`⚠️ Unable to stop CPU profiler for ${label}:`, stopError)
    } finally {
      session.disconnect()
    }

    if (profile) {
      try {
        await persistProfile(label, runIndex, profile)
      } catch (persistError) {
        console.warn(`⚠️ Unable to persist CPU profile for ${label}:`, persistError)
      }
    }
  }

  if (runError) {
    throw runError
  }
  return result
}

async function persistProfile (label, runIndex, profile) {
  const safeLabel = sanitizeLabel(label)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${safeLabel}-run${runIndex + 1}-${timestamp}.cpuprofile`
  const fullPath = join(PROFILE_DIR, filename)
  await fs.mkdir(PROFILE_DIR, { recursive: true })
  await fs.writeFile(fullPath, JSON.stringify(profile))
  console.log(
    `🧠 Saved CPU profile for ${label} (run ${runIndex + 1}) → ${relative(process.cwd(), fullPath)}`
  )
}

function sanitizeLabel (label) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile'
  )
}

function inspectorPost (session, method, params = {}) {
  return new Promise((resolve, reject) => {
    session.post(method, params, (err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

function randomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function fingerprintVector (values) {
  const hash = createHash('sha1')
  for (const value of values) {
    hash.update(value.toString())
    hash.update(',')
  }
  return hash.digest('hex').slice(0, 12)
}

function createUniformWorkload () {
  const values = new Array(UNIFORM_VECTOR_LENGTH)
  for (let i = 0; i < values.length; i++) {
    values[i] = randomInt(1, 100)
  }
  const fingerprint = fingerprintVector(values)
  const tasks = Array.from({ length: UNIFORM_TASKS }, (_, index) => `uniform-${index + 1}`)
  return {
    name: 'Uniform vector (5k random)',
    totalTasks: tasks.length,
    tasks,
    metadata: { fingerprint, length: values.length },
    execute: () => {
      const copy = cloneVector(values)
      copy.sort((a, b) => a - b)
      return copy
    }
  }
}

function createMixedWorkload () {
  const tasks = []
  const vectorMap = new Map()
  const lengths = []
  for (let i = 0; i < MIXED_TASKS; i++) {
    const length = randomInt(MIXED_VECTOR_MIN, MIXED_VECTOR_MAX)
    const values = new Array(length)
    for (let j = 0; j < length; j++) {
      values[j] = randomInt(1, 100)
    }
    const id = `mixed-${String(i + 1).padStart(4, '0')}`
    const fingerprint = fingerprintVector(values)
    vectorMap.set(id, { values, fingerprint, length })
    lengths.push(length)
    tasks.push(id)
  }
  return {
    name: 'Mixed vectors (500-2000 random)',
    totalTasks: tasks.length,
    tasks,
    metadata: {
      lengths,
      sample: tasks.slice(0, 5).map((id) => {
        const vector = vectorMap.get(id)
        return `${id}@${vector.length}:${vector.fingerprint}`
      })
    },
    execute: (label) => {
      const vector = vectorMap.get(label)
      if (!vector) throw new Error(`Unknown vector: ${label}`)
      const copy = cloneVector(vector.values)
      copy.sort((a, b) => a - b)
      return copy
    }
  }
}

function cloneVector(values) {
  const clone = new Array(values.length)
  for (let i = 0; i < values.length; i++) {
    clone[i] = values[i]
  }
  return clone
}

const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.disable()

const gcStats = { count: 0, duration: 0 }
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcStats.count++
    gcStats.duration += entry.duration
  }
})
gcObserver.observe({ entryTypes: ['gc'], buffered: false })

async function captureDiagnostics(fn) {
  if (global.gc) {
    global.gc()
  }
  const memBefore = process.memoryUsage()
  const gcBefore = { count: gcStats.count, duration: gcStats.duration }
  loopDelay.reset()
  loopDelay.enable()

  await fn()

  loopDelay.disable()
  const memAfter = process.memoryUsage()
  const gcAfter = { count: gcStats.count, duration: gcStats.duration }

  return {
    heapDeltaMB: (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024),
    gcCount: gcAfter.count - gcBefore.count,
    gcDurationMs: gcAfter.duration - gcBefore.duration,
    loopP95Ms: loopDelay.percentile(95) / 1e6,
    loopMaxMs: loopDelay.max / 1e6
  }
}

function summarize(label, duration, monitorReport, diagnostics, totalTasks) {
  const throughput = Math.round((totalTasks / duration) * 1000)
  const avgLatency = duration / totalTasks
  const peakMemory = monitorReport?.system?.peakMemoryMB ?? 0
  const avgMemory = monitorReport?.system?.avgMemoryMB ?? 0

  return {
    label,
    duration,
    throughput,
    avgLatency,
    peakMemory,
    avgMemory,
    heapDelta: diagnostics?.heapDeltaMB ?? 0,
    gcCount: diagnostics?.gcCount ?? 0,
    gcDurationMs: diagnostics?.gcDurationMs ?? 0,
    loopP95Ms: diagnostics?.loopP95Ms ?? 0,
    loopMaxMs: diagnostics?.loopMaxMs ?? 0
  }
}

function roundUp (value, decimals = 0) {
  if (!Number.isFinite(value)) {
    return 0
  }
  const factor = Math.pow(10, decimals)
  return Math.ceil(value * factor) / factor
}

function aggregateRuns (label, runs) {
  const avg = (key) => runs.reduce((sum, run) => sum + (run[key] ?? 0), 0) / runs.length
  return {
    label,
    duration: roundUp(avg('duration')),
    throughput: roundUp(avg('throughput')),
    avgLatency: roundUp(avg('avgLatency'), 2),
    peakMemory: roundUp(avg('peakMemory'), 1),
    avgMemory: roundUp(avg('avgMemory'), 1),
    heapDelta: roundUp(avg('heapDelta'), 2),
    gcCount: roundUp(avg('gcCount')),
    gcDurationMs: roundUp(avg('gcDurationMs'), 1),
    loopP95Ms: roundUp(avg('loopP95Ms'), 2),
    loopMaxMs: roundUp(avg('loopMaxMs'), 2)
  }
}

async function runScenarioMultiple (label, fn, workload) {
  const runs = []
  const scenarioLabel = `${label}__${workload.name}`
  for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
    const runExecutor = () => fn(workload)
    if (shouldProfileScenario(scenarioLabel, i)) {
      runs.push(await withCpuProfile(scenarioLabel, i, runExecutor))
    } else {
      runs.push(await runExecutor())
    }
  }
  const aggregated = aggregateRuns(label, runs)
  console.log(
    `📈 ${label} (avg of ${RUNS_PER_SCENARIO} runs) → duration=${aggregated.duration}ms, throughput=${aggregated.throughput} ops/s, avgLatency=${aggregated.avgLatency.toFixed(
      2
    )}ms`
  )
  return aggregated
}

function createMonitor(executor) {
  if (!executor) {
    return new PerformanceMonitor()
  }
  const client = {
    getQueueStats: executor.getStats ? () => executor.getStats() : undefined,
    getAggregateMetrics: executor.getAggregateMetrics
      ? (since) => executor.getAggregateMetrics(since)
      : undefined
  }
  return new PerformanceMonitor({ client })
}

async function runTasksRunner(label, createRunner, workload) {
  const runner = createRunner()

  const monitor = createMonitor(runner)
  monitor.start(2000)

  const bench = new Benchmark(label)
  const diagnostics = await captureDiagnostics(async () => {
    await bench.measure(async () => {
      await runner.process(workload.tasks, async (taskLabel) => {
        await workload.execute(taskLabel)
      })
    })
  })

  monitor.takeSnapshot()
  monitor.stop()
  runner.destroy()

  const result = summarize(label, bench.elapsed(), monitor.getReport(), diagnostics, workload.totalTasks)

  console.log(
    `✅ ${label} → duration=${result.duration}ms, throughput=${result.throughput} ops/s, avgLatency=${result.avgLatency.toFixed(
      2
    )}ms, heapΔ=${result.heapDelta.toFixed(2)}MB, gc=${result.gcCount} (${result.gcDurationMs.toFixed(
      1
    )}ms), loop p95=${result.loopP95Ms.toFixed(2)}ms`
  )

  return result
}

async function runPromisePool(workload) {
  const monitor = createMonitor()
  monitor.start(2000)

  const bench = new Benchmark('@supercharge/promise-pool')
  const diagnostics = await captureDiagnostics(async () => {
    await bench.measure(async () => {
      await PromisePool.withConcurrency(CONCURRENCY)
        .for(workload.tasks)
        .process(async (taskLabel) => {
          await workload.execute(taskLabel)
        })
    })
  })

  monitor.takeSnapshot()
  monitor.stop()

  const result = summarize('@supercharge/promise-pool', bench.elapsed(), monitor.getReport(), diagnostics, workload.totalTasks)

  console.log(
    `✅ @supercharge/promise-pool → duration=${result.duration}ms, throughput=${result.throughput} ops/s, avgLatency=${result.avgLatency.toFixed(
      2
    )}ms, heapΔ=${result.heapDelta.toFixed(2)}MB, gc=${result.gcCount} (${result.gcDurationMs.toFixed(
      1
    )}ms), loop p95=${result.loopP95Ms.toFixed(2)}ms`
  )

  return result
}

async function runTasksPool(label, config, workload) {
  const pool = new TasksPool(config)

  const monitor = createMonitor(pool)
  monitor.start(2000)

  const bench = new Benchmark(label)
  const diagnostics = await captureDiagnostics(async () => {
    await bench.measure(async () => {
      const promises = workload.tasks.map((taskLabel) =>
        pool.enqueue(async () => {
          await workload.execute(taskLabel)
        })
      )
      await Promise.all(promises)
    })
  })

  monitor.takeSnapshot()
  monitor.stop()
  await pool.drain()

  const result = summarize(label, bench.elapsed(), monitor.getReport(), diagnostics, workload.totalTasks)

  console.log(
    `✅ ${label} → duration=${result.duration}ms, throughput=${result.throughput} ops/s, avgLatency=${result.avgLatency.toFixed(
      2
    )}ms, heapΔ=${result.heapDelta.toFixed(2)}MB, gc=${result.gcCount} (${result.gcDurationMs.toFixed(
      1
    )}ms), loop p95=${result.loopP95Ms.toFixed(2)}ms`
  )

  return result
}

async function runPromiseAll(workload) {
  const monitor = createMonitor()
  monitor.start(2000)

  const bench = new Benchmark('Promise.all')
  const diagnostics = await captureDiagnostics(async () => {
    await bench.measure(async () => {
      await Promise.all(
        workload.tasks.map(async (taskLabel) => {
          await workload.execute(taskLabel)
        })
      )
    })
  })

  monitor.takeSnapshot()
  monitor.stop()

  const result = summarize('Promise.all', bench.elapsed(), monitor.getReport(), diagnostics, workload.totalTasks)

  console.log(
    `✅ Promise.all → duration=${result.duration}ms, throughput=${result.throughput} ops/s, avgLatency=${result.avgLatency.toFixed(
      2
    )}ms, heapΔ=${result.heapDelta.toFixed(2)}MB, gc=${result.gcCount} (${result.gcDurationMs.toFixed(
      1
    )}ms), loop p95=${result.loopP95Ms.toFixed(2)}ms`
  )

  return result
}

async function main() {
  const workloads = [createUniformWorkload(), createMixedWorkload()]

  const summaries = []

  for (const workload of workloads) {
    console.log('\n================================================================')
    console.log(`🧪 Workload: ${workload.name}`)
    if (workload.metadata?.length) {
      console.log(`   • Vector length: ${workload.metadata.length}`)
      console.log(`   • Fingerprint: ${workload.metadata.fingerprint}`)
    } else if (workload.metadata?.lengths) {
      const lengths = workload.metadata.lengths
      const minLength = Math.min(...lengths)
      const maxLength = Math.max(...lengths)
      const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
      console.log(
        `   • Vector lengths: min=${minLength} max=${maxLength} avg=${avgLength.toFixed(1)}`
      )
      console.log(`   • Sample fingerprints: ${workload.metadata.sample.join(', ')}`)
    }
    console.log(`   • Total tasks: ${workload.totalTasks}`)
    console.log(`   • Runs per scenario: ${RUNS_PER_SCENARIO}`)

    console.log('\n🔥 Warmup run (priming V8 and caches)...')
    for (const label of workload.tasks) {
      workload.execute(label)
    }

    const results = []

    results.push(
      await runScenarioMultiple(
        'TasksRunner (default)',
        (wl) =>
          runTasksRunner(
            'TasksRunner (default)',
            () =>
              new TasksRunner({
                concurrency: CONCURRENCY,
                retries: 0,
                timeout: 60000
              }),
            wl
          ),
        workload
      )
    )

    results.push(
      await runScenarioMultiple(
        'TasksRunner (bare profile)',
        (wl) =>
          runTasksRunner(
            'TasksRunner (bare profile)',
            () =>
              new TasksRunner({
                concurrency: CONCURRENCY,
                retries: 0,
                timeout: 0,
                features: {
                  profile: 'bare',
                  emitEvents: false,
                  trackProcessedItems: false
                }
              }),
            wl
          ),
        workload
      )
    )

    results.push(
      await runScenarioMultiple(
        'TasksRunner (monitoring enabled)',
        (wl) =>
          runTasksRunner(
            'TasksRunner (monitoring enabled)',
            () =>
              new TasksRunner({
                concurrency: CONCURRENCY,
                retries: 0,
                timeout: 60000,
                monitoring: {
                  enabled: true,
                  collectMetrics: true,
                  sampleRate: 1
                }
              }),
            wl
          ),
        workload
      )
    )

    results.push(
      await runScenarioMultiple(
        'TasksPool (default)',
        (wl) =>
          runTasksPool(
            'TasksPool (default)',
            {
              concurrency: CONCURRENCY,
              retries: 0,
              timeout: 60000,
              monitoring: { enabled: false }
            },
            wl
          ),
        workload
      )
    )

    results.push(
      await runScenarioMultiple(
        'TasksPool (bare profile)',
        (wl) =>
          runTasksPool(
            'TasksPool (bare profile)',
            {
              concurrency: CONCURRENCY,
              retries: 0,
              timeout: 0,
              monitoring: { enabled: false },
              features: {
                profile: 'bare',
                emitEvents: false
              }
            },
            wl
          ),
        workload
      )
    )

    results.push(
      await runScenarioMultiple(
        'TasksPool (monitoring enabled)',
        (wl) =>
          runTasksPool(
            'TasksPool (monitoring enabled)',
            {
              concurrency: CONCURRENCY,
              retries: 0,
              timeout: 60000,
              monitoring: {
                enabled: true,
                collectMetrics: true,
                sampleRate: 1
              }
            },
            wl
          ),
        workload
      )
    )

    results.push(await runScenarioMultiple('@supercharge/promise-pool', (wl) => runPromisePool(wl), workload))
    results.push(await runScenarioMultiple('Promise.all', (wl) => runPromiseAll(wl), workload))

    summaries.push({ name: workload.name, results })
  }

  console.log('\n\n════════════════════════════════════════════════════')
  console.log('📊 Consolidated Summaries')
  console.log('════════════════════════════════════════════════════\n')

  for (const summary of summaries) {
    printSummaryTable(summary.name, summary.results)
  }
}

function printSummaryTable (workloadName, results) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 Summary — ${workloadName}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const header = [
    'Runner',
    'Duration',
    'Throughput',
    'Avg Latency',
    'Peak Memory',
    'Avg Memory',
    'Heap Δ',
    'GC (count/ms)',
    'Loop p95'
  ]
  const sortedResults = [...results].sort((a, b) => {
    if (b.throughput !== a.throughput) {
      return b.throughput - a.throughput
    }
    return a.duration - b.duration
  })
  const rows = sortedResults.map((res) => [
    res.label,
    `${res.duration} ms`,
    `${res.throughput} ops/s`,
    `${res.avgLatency.toFixed(2)} ms`,
    `${res.peakMemory.toFixed(1)} MB`,
    `${res.avgMemory.toFixed(1)} MB`,
    `${res.heapDelta.toFixed(2)} MB`,
    `${res.gcCount}/${res.gcDurationMs.toFixed(1)} ms`,
    `${res.loopP95Ms.toFixed(2)} ms`
  ])
  const widths = header.map((_, index) => Math.max(header[index].length, ...rows.map((row) => row[index].length)))
  const formatRow = (cols) =>
    cols
      .map((col, idx) => col.padEnd(widths[idx], ' '))
      .join('  | ')
  console.log(formatRow(header))
  console.log(widths.map((w) => '-'.repeat(w)).join('--+--'))
  for (const row of rows) {
    console.log(formatRow(row))
  }
  console.log()
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
