/**
 * Benchmark: OperationPool vs Current Implementation
 *
 * Compares 10,000 write operations using:
 * 1. Current s3db.js implementation (no global concurrency control)
 * 2. New OperationPool implementation (global concurrency control)
 *
 * Usage:
 *   node benchmarks/operation-pool-comparison.js
 */

import { Database } from '../src/database.class.js'
import { OperationPool } from '../src/concerns/operation-pool.js'
import { Benchmark } from '../src/concerns/benchmark.js'
import { PerformanceMonitor } from '../src/concerns/performance-monitor.js'

// Configuration
const TOTAL_OPERATIONS = 10000
const CONCURRENCY = 50 // OperationPool concurrency
const BATCH_SIZE = 100 // Process in batches for better progress tracking

// Helper: Generate test data
function generateTestData(index) {
  return {
    id: `user-${index}`,
    name: `User ${index}`,
    email: `user${index}@example.com`,
    age: 20 + (index % 60),
    status: index % 2 === 0 ? 'active' : 'inactive',
    tags: ['tag1', 'tag2', 'tag3'],
    metadata: {
      createdBy: 'benchmark',
      source: 'operation-pool-test',
      timestamp: new Date().toISOString()
    }
  }
}

// Helper: Progress reporter
function reportProgress(label, current, total, startTime) {
  const elapsed = Date.now() - startTime
  const percentage = ((current / total) * 100).toFixed(1)
  const opsPerSec = Math.round((current / elapsed) * 1000)

  process.stdout.write(`\r${label}: ${current}/${total} (${percentage}%) - ${opsPerSec} ops/sec`)

  if (current === total) {
    console.log() // New line when complete
  }
}

// Benchmark 1: Current Implementation (without OperationPool)
async function benchmarkCurrent() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Benchmark 1: Current Implementation (No OperationPool)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Create database with MemoryClient
  const db = new Database({
    connectionString: 'memory://benchmark-current/test'
  })

  await db.connect()

  // Create resource
  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      age: 'number',
      status: 'string',
      tags: 'array',
      metadata: {
        createdBy: 'string',
        source: 'string',
        timestamp: 'string'
      }
    }
  })

  const resource = await db.getResource('users')

  // Start monitoring
  const monitor = new PerformanceMonitor(db)
  monitor.start(5000) // Snapshot every 5s

  // Benchmark
  const bench = new Benchmark('Current Implementation')
  const startTime = Date.now()
  let completed = 0

  await bench.measure(async () => {
    // Process in batches to avoid overwhelming the system
    for (let batch = 0; batch < TOTAL_OPERATIONS / BATCH_SIZE; batch++) {
      const batchPromises = []

      for (let i = 0; i < BATCH_SIZE; i++) {
        const index = batch * BATCH_SIZE + i
        const data = generateTestData(index)

        batchPromises.push(
          resource.insert(data).then(() => {
            completed++
            if (completed % 500 === 0) {
              reportProgress('Current', completed, TOTAL_OPERATIONS, startTime)
            }
          })
        )
      }

      await Promise.all(batchPromises)
    }

    reportProgress('Current', completed, TOTAL_OPERATIONS, startTime)
  })

  monitor.stop()

  // Results
  const duration = bench.elapsed()
  const opsPerSec = Math.round((TOTAL_OPERATIONS / duration) * 1000)
  const avgLatency = duration / TOTAL_OPERATIONS

  console.log('\n📈 Results:')
  console.log(`   Duration: ${duration}ms`)
  console.log(`   Operations: ${TOTAL_OPERATIONS}`)
  console.log(`   Throughput: ${opsPerSec} ops/sec`)
  console.log(`   Avg Latency: ${avgLatency.toFixed(2)}ms per operation`)

  const report = monitor.getReport()
  if (report && report.system) {
    console.log(`   Peak Memory: ${report.system.peakMemoryMB.toFixed(0)}MB`)
    console.log(`   Avg Memory: ${report.system.avgMemoryMB.toFixed(0)}MB`)
  }

  await db.disconnect()

  return {
    duration,
    throughput: opsPerSec,
    avgLatency,
    peakMemory: report?.system?.peakMemoryMB || 0,
    avgMemory: report?.system?.avgMemoryMB || 0
  }
}

// Benchmark 2: With OperationPool
async function benchmarkWithPool() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Benchmark 2: With OperationPool (Concurrency: ' + CONCURRENCY + ')')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Create database with MemoryClient
  const db = new Database({
    connectionString: 'memory://benchmark-pool/test'
  })

  await db.connect()

  // Create resource
  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      age: 'number',
      status: 'string',
      tags: 'array',
      metadata: {
        createdBy: 'string',
        source: 'string',
        timestamp: 'string'
      }
    }
  })

  const resource = await db.getResource('users')

  // Create OperationPool
  const pool = new OperationPool({
    concurrency: CONCURRENCY,
    retries: 2,
    retryDelay: 100,
    timeout: 5000
  })

  // Start monitoring
  const monitor = new PerformanceMonitor(db)
  monitor.start(5000) // Snapshot every 5s

  // Benchmark
  const bench = new Benchmark('With OperationPool')
  const startTime = Date.now()
  let completed = 0

  await bench.measure(async () => {
    const promises = []

    for (let i = 0; i < TOTAL_OPERATIONS; i++) {
      const data = generateTestData(i)

      // Enqueue operation through pool
      const promise = pool.enqueue(
        async () => {
          return await resource.insert(data)
        },
        {
          priority: 0,
          metadata: { index: i }
        }
      ).then(() => {
        completed++
        if (completed % 500 === 0) {
          reportProgress('With Pool', completed, TOTAL_OPERATIONS, startTime)
        }
      })

      promises.push(promise)
    }

    await Promise.all(promises)
    reportProgress('With Pool', completed, TOTAL_OPERATIONS, startTime)
  })

  monitor.stop()
  pool.stop()

  // Results
  const duration = bench.elapsed()
  const opsPerSec = Math.round((TOTAL_OPERATIONS / duration) * 1000)
  const avgLatency = duration / TOTAL_OPERATIONS

  console.log('\n📈 Results:')
  console.log(`   Duration: ${duration}ms`)
  console.log(`   Operations: ${TOTAL_OPERATIONS}`)
  console.log(`   Throughput: ${opsPerSec} ops/sec`)
  console.log(`   Avg Latency: ${avgLatency.toFixed(2)}ms per operation`)

  const poolStats = pool.getStats()
  console.log(`   Pool Stats:`)
  console.log(`     Processed: ${poolStats.processedCount}`)
  console.log(`     Errors: ${poolStats.errorCount}`)
  console.log(`     Retries: ${poolStats.retryCount}`)

  const report = monitor.getReport()
  if (report && report.system) {
    console.log(`   Peak Memory: ${report.system.peakMemoryMB.toFixed(0)}MB`)
    console.log(`   Avg Memory: ${report.system.avgMemoryMB.toFixed(0)}MB`)
  }

  await db.disconnect()

  return {
    duration,
    throughput: opsPerSec,
    avgLatency,
    peakMemory: report?.system?.peakMemoryMB || 0,
    avgMemory: report?.system?.avgMemoryMB || 0,
    poolStats
  }
}

// Comparison Summary
function printComparison(current, withPool) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Comparison Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('⏱️  Duration:')
  console.log(`   Current:    ${current.duration}ms`)
  console.log(`   With Pool:  ${withPool.duration}ms`)
  const durationImprovement = ((current.duration - withPool.duration) / current.duration * 100).toFixed(1)
  console.log(`   Improvement: ${durationImprovement}% ${durationImprovement > 0 ? '✅ faster' : '❌ slower'}`)

  console.log('\n🚀 Throughput:')
  console.log(`   Current:    ${current.throughput} ops/sec`)
  console.log(`   With Pool:  ${withPool.throughput} ops/sec`)
  const throughputImprovement = ((withPool.throughput - current.throughput) / current.throughput * 100).toFixed(1)
  console.log(`   Improvement: ${throughputImprovement}% ${throughputImprovement > 0 ? '✅ higher' : '❌ lower'}`)

  console.log('\n⚡ Latency:')
  console.log(`   Current:    ${current.avgLatency.toFixed(2)}ms per op`)
  console.log(`   With Pool:  ${withPool.avgLatency.toFixed(2)}ms per op`)
  const latencyImprovement = ((current.avgLatency - withPool.avgLatency) / current.avgLatency * 100).toFixed(1)
  console.log(`   Improvement: ${latencyImprovement}% ${latencyImprovement > 0 ? '✅ faster' : '❌ slower'}`)

  console.log('\n💾 Memory:')
  console.log(`   Current Peak:    ${current.peakMemory.toFixed(0)}MB`)
  console.log(`   With Pool Peak:  ${withPool.peakMemory.toFixed(0)}MB`)
  const memoryReduction = ((current.peakMemory - withPool.peakMemory) / current.peakMemory * 100).toFixed(1)
  console.log(`   Reduction: ${memoryReduction}% ${memoryReduction > 0 ? '✅ lower' : '❌ higher'}`)

  console.log('\n🎯 Pool Statistics:')
  if (withPool.poolStats) {
    console.log(`   Processed: ${withPool.poolStats.processedCount}`)
    console.log(`   Errors: ${withPool.poolStats.errorCount}`)
    console.log(`   Retries: ${withPool.poolStats.retryCount}`)
    console.log(`   Error Rate: ${((withPool.poolStats.errorCount / withPool.poolStats.processedCount) * 100).toFixed(2)}%`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Overall verdict
  const improvements = [
    durationImprovement > 0,
    throughputImprovement > 0,
    latencyImprovement > 0,
    memoryReduction > 0
  ].filter(Boolean).length

  if (improvements >= 3) {
    console.log('✅ OperationPool shows significant improvements!')
  } else if (improvements >= 2) {
    console.log('⚠️  OperationPool shows mixed results')
  } else {
    console.log('❌ Current implementation performs better')
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

// Main execution
async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🔬 s3db.js OperationPool Benchmark')
  console.log('='.repeat(60))
  console.log(`\nConfiguration:`)
  console.log(`  Operations: ${TOTAL_OPERATIONS}`)
  console.log(`  Pool Concurrency: ${CONCURRENCY}`)
  console.log(`  Batch Size: ${BATCH_SIZE}`)
  console.log(`  Client: MemoryClient (in-memory, no network overhead)`)
  console.log('='.repeat(60))

  try {
    // Run benchmarks
    const currentResults = await benchmarkCurrent()

    // Wait a bit between benchmarks
    console.log('\n⏸️  Waiting 2 seconds before next benchmark...\n')
    await new Promise(resolve => setTimeout(resolve, 2000))

    const poolResults = await benchmarkWithPool()

    // Print comparison
    printComparison(currentResults, poolResults)

    // Exit successfully
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
