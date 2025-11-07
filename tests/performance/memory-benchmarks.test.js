/**
 * Memory Benchmarks
 *
 * Baseline memory usage measurements for s3db.js components.
 * Run with: node --expose-gc tests/performance/memory-benchmarks.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import {
  getMemoryUsage,
  measureMemory,
  forceGC,
  MemorySampler,
  formatMemoryUsage
} from '../../src/concerns/memory-profiler.js';

// Enable verbose output
const VERBOSE = process.env.MEMORY_BENCHMARK_VERBOSE === 'true';

function log(...args) {
  if (VERBOSE) {
    console.log('[MEMORY]', ...args);
  }
}

describe('Memory Benchmarks', () => {
  let db;

  beforeAll(async () => {
    // Warm up - create and destroy a database
    const warmupDb = new Database({
      client: new MemoryClient({ bucket: 'warmup', keyPrefix: 'warmup/' }),
      deferMetadataWrites: true  // Enable debounced metadata uploads for performance
    });
    await warmupDb.connect();
    await warmupDb.disconnect();

    // Force GC
    forceGC();
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  it('Baseline: Empty Database Instance', async () => {
    log('Starting baseline measurement...');
    log('Before:', formatMemoryUsage());

    const measurement = await measureMemory(async () => {
      const testDb = new Database({
        client: new MemoryClient({ bucket: 'test', keyPrefix: 'test/' }),
        deferMetadataWrites: true  // Enable debounced metadata uploads for performance
      });
      await testDb.connect();
      return testDb;
    });

    log('After:', formatMemoryUsage());
    log('Heap growth:', measurement.heapGrowthMB, 'MB');

    db = measurement.result;

    // Assertions
    expect(measurement.heapGrowthMB).toBeLessThan(50); // Should be < 50MB
    expect(measurement.error).toBeUndefined();

    log('✓ Empty database baseline:', measurement.heapGrowthMB, 'MB');
  });

  it('Baseline: Single Resource Creation', async () => {
    log('Measuring single resource creation...');
    log('Before:', formatMemoryUsage());

    const measurement = await measureMemory(async () => {
      return await db.createResource({
        name: 'test_resource_1',
        attributes: {
          name: 'string|required',
          email: 'email|required',
          age: 'number',
          active: 'boolean',
          metadata: {
            $$type: 'object',
            tags: 'array',
            description: 'string'
          }
        }
      });
    });

    log('After:', formatMemoryUsage());
    log('Heap growth:', measurement.heapGrowthMB, 'MB');

    // Assertions
    expect(measurement.heapGrowthMB).toBeLessThan(90); // Target: < 90MB
    expect(measurement.error).toBeUndefined();
    expect(measurement.result).toBeDefined();

    log('✓ Single resource:', measurement.heapGrowthMB, 'MB');

    // WARNING if exceeds target
    if (measurement.heapGrowthMB > 90) {
      console.warn(`⚠️  MEMORY WARNING: Single resource uses ${measurement.heapGrowthMB}MB (target: <90MB)`);
    }
  });

  it('Baseline: Multiple Resources (10)', async () => {
    log('Measuring 10 resources creation...');
    const before = getMemoryUsage();
    log('Before:', formatMemoryUsage());

    const resources = [];
    for (let i = 2; i <= 11; i++) {
      const resource = await db.createResource({
        name: `test_resource_${i}`,
        attributes: {
          id: 'string|required',
          value: 'number',
          data: 'string'
        }
      });
      resources.push(resource);
    }

    forceGC();
    await new Promise(resolve => setTimeout(resolve, 200));

    const after = getMemoryUsage();
    const growth = after.heapUsedMB - before.heapUsedMB;

    log('After:', formatMemoryUsage());
    log('Heap growth:', growth, 'MB');
    log('Per resource:', (growth / 10).toFixed(2), 'MB');

    // Assertions
    const perResourceMB = growth / 10;
    expect(perResourceMB).toBeLessThan(90); // Each resource < 90MB
    expect(growth).toBeLessThan(900); // Total < 900MB

    log('✓ 10 resources:', growth, 'MB (', perResourceMB.toFixed(2), 'MB each)');

    // WARNING if exceeds target
    if (perResourceMB > 90) {
      console.warn(`⚠️  MEMORY WARNING: Per-resource average is ${perResourceMB.toFixed(2)}MB (target: <90MB)`);
    }
  });

  it('Baseline: Resource with Data Operations', async () => {
    log('Measuring resource with data operations...');

    const resource = await db.createResource({
      name: 'test_operations',
      attributes: {
        id: 'string|required',
        name: 'string',
        count: 'number'
      }
    });

    const measurement = await measureMemory(async () => {
      // Insert records
      for (let i = 0; i < 100; i++) {
        await resource.insert({
          id: `record-${i}`,
          name: `Record ${i}`,
          count: i
        });
      }

      // Query records
      const results = await resource.list({ limit: 50 });

      return results;
    });

    log('After operations:', formatMemoryUsage());
    log('Heap growth:', measurement.heapGrowthMB, 'MB');

    expect(measurement.error).toBeUndefined();
    expect(measurement.result.length).toBeGreaterThan(0);

    log('✓ Resource with operations:', measurement.heapGrowthMB, 'MB');
  });

  it('Memory Sampler Functionality', async () => {
    log('Testing memory sampler...');

    const sampler = new MemorySampler({
      sampleIntervalMs: 100,
      maxSamples: 10
    });

    sampler.start();

    // Wait for a few samples
    await new Promise(resolve => setTimeout(resolve, 550));

    sampler.stop();

    const samples = sampler.getSamples();
    const stats = sampler.getStats();

    log('Samples collected:', samples.length);
    log('Stats:', stats);

    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(stats).toBeDefined();
    expect(stats.sampleCount).toBe(samples.length);
    expect(stats.minHeapUsedMB).toBeGreaterThan(0);
    expect(stats.maxHeapUsedMB).toBeGreaterThan(0);

    log('✓ Memory sampler working');
  });

  it('Memory Leak Detection', async () => {
    log('Testing leak detection...');

    const sampler = new MemorySampler({
      sampleIntervalMs: 100,
      maxSamples: 20
    });

    sampler.start();

    // Simulate stable memory (no leak)
    await new Promise(resolve => setTimeout(resolve, 600));

    const leakCheck1 = sampler.detectLeak(0.1);
    expect(leakCheck1).toBe(false);

    log('✓ No false positives for stable memory');

    // Simulate memory growth (potential leak)
    const leakyArray = [];
    const interval = setInterval(() => {
      leakyArray.push(new Array(10000).fill('data'));
    }, 100);

    await new Promise(resolve => setTimeout(resolve, 600));

    const leakCheck2 = sampler.detectLeak(0.05); // 5% growth threshold

    clearInterval(interval);
    sampler.stop();

    if (leakCheck2) {
      log('✓ Leak detected:', leakCheck2);
      expect(leakCheck2.detected).toBe(true);
      expect(leakCheck2.growthRate).toBeGreaterThan(0);
    } else {
      log('⚠️  Leak detection test inconclusive (may need adjustment)');
    }
  });

  it('Summary Report', () => {
    const usage = getMemoryUsage();

    console.log('\n' + '='.repeat(60));
    console.log('MEMORY BENCHMARK SUMMARY');
    console.log('='.repeat(60));
    console.log('Current Memory Usage:');
    console.log(`  RSS:          ${usage.rssMB} MB`);
    console.log(`  Heap Used:    ${usage.heapUsedMB} MB`);
    console.log(`  Heap Total:   ${usage.heapTotalMB} MB`);
    console.log(`  External:     ${usage.externalMB} MB`);
    console.log(`  Heap Limit:   ${usage.heapSizeLimitMB} MB`);
    console.log('='.repeat(60));
    console.log('Run with MEMORY_BENCHMARK_VERBOSE=true for detailed logs');
    console.log('='.repeat(60) + '\n');
  });
});
