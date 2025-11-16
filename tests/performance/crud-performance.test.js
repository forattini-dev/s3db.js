/**
 * CRUD Performance Benchmark
 *
 * Validates performance improvements from cloneDeep → structural sharing optimizations.
 *
 * Optimizations Applied:
 * - ba98d3c: Resource constructor (10x speedup)
 * - b27ed2f: update() + patch() (10-50x speedup, 90% fewer allocations)
 * - ad4454d: updateConditional() + replace() (10-50x speedup)
 *
 * This benchmark establishes baseline performance metrics and validates
 * that write operations scale linearly with data size (not quadratically).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { clearValidatorCache } from '../../src/concerns/validator-cache.js';

describe('CRUD Performance Benchmarks', () => {
  let db;

  beforeEach(async () => {
    if (db) {
      try {
        await db.disconnect();
      } catch (e) {
        // Ignore
      }
    }

    clearValidatorCache();

    db = new Database({
      logLevel: 'silent', client: new MemoryClient({ bucket: 'perf-test', keyPrefix: 'perf/' }),
      deferMetadataWrites: true
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) await db.disconnect();
    clearValidatorCache();
  });

  describe('Resource Creation Performance', () => {
    it('should create resources quickly with shallow clone optimization', async () => {
      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await db.createResource({
          name: `resource_${i}`,
          attributes: {
            name: 'string|required',
            email: 'email|required',
            age: 'number|optional',
            active: 'boolean|optional'
          },
          behavior: 'enforce-limits',
          timestamps: true
        });
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // console.log(`\n📊 Resource Creation Performance:`);
      // console.log(`   Total: ${duration}ms for ${iterations} resources`);
      // console.log(`   Average: ${avgTime.toFixed(2)}ms per resource`);
      // console.log(`   Expected: <10ms per resource (10x faster than cloneDeep)`);

      // With shallow clone optimization, should be < 20ms per resource
      // Relaxed from 10ms due to CI environment variability
      expect(avgTime).toBeLessThan(20);
    });
  });

  describe('Write Operation Performance', () => {
    let resource;
    const testData = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      metadata: {
        source: 'test',
        tags: ['benchmark', 'performance'],
        scores: { quality: 95, speed: 88 }
      }
    };

    beforeEach(async () => {
      resource = await db.createResource({
        name: 'users',
        attributes: {
          name: 'string|required',
          email: 'email|required',
          age: 'number|optional',
          active: 'boolean|optional',
          metadata: 'object|optional'
        },
        behavior: 'enforce-limits',
        timestamps: true
      });
    });

    it('should perform bulk inserts efficiently', async () => {
      const count = 1000;
      const start = Date.now();

      const insertPromises = [];
      for (let i = 0; i < count; i++) {
        insertPromises.push(
          resource.insert({
            ...testData,
            email: `user${i}@example.com`
          })
        );
      }

      await Promise.all(insertPromises);
      const duration = Date.now() - start;
      const avgTime = duration / count;

      // console.log(`\n📊 Bulk Insert Performance:`);
      // console.log(`   Total: ${duration}ms for ${count} records`);
      // console.log(`   Average: ${avgTime.toFixed(2)}ms per insert`);
      // console.log(`   Throughput: ${(count / duration * 1000).toFixed(0)} inserts/sec`);

      // Should handle 1000 inserts in reasonable time
      expect(duration).toBeLessThan(5000); // 5ms per insert average
    });

    it('should perform update() efficiently with structural sharing', async () => {
      // Insert test record
      const inserted = await resource.insert(testData);
      const id = inserted.id;

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await resource.update(id, {
          age: 30 + i,
          'metadata.scores.quality': 90 + i % 10
        });
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // console.log(`\n📊 update() Performance:`);
      // console.log(`   Total: ${duration}ms for ${iterations} updates`);
      // console.log(`   Average: ${avgTime.toFixed(2)}ms per update`);
      // console.log(`   Expected: 10-50x faster than cloneDeep (< 5ms)`);

      // With structural sharing, should be < 20ms per update (MemoryClient overhead + CI system variance)
      expect(avgTime).toBeLessThan(20);
    });

    it('should perform patch() efficiently (HEAD+COPY optimization)', async () => {
      // Insert test record
      const inserted = await resource.insert(testData);
      const id = inserted.id;

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await resource.patch(id, {
          age: 30 + i,
          active: i % 2 === 0
        });
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // console.log(`\n📊 patch() Performance:`);
      // console.log(`   Total: ${duration}ms for ${iterations} patches`);
      // console.log(`   Average: ${avgTime.toFixed(2)}ms per patch`);
      // console.log(`   Expected: 40-60% faster than update() for metadata-only`);

      // patch() with HEAD+COPY should be faster
      expect(avgTime).toBeLessThan(5);
    });

    it('should perform replace() efficiently (skip GET)', async () => {
      // Insert test record
      const inserted = await resource.insert(testData);
      const id = inserted.id;

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await resource.replace(id, {
          ...testData,
          age: 30 + i
        });
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // console.log(`\n📊 replace() Performance:`);
      // console.log(`   Total: ${duration}ms for ${iterations} replaces`);
      // console.log(`   Average: ${avgTime.toFixed(2)}ms per replace`);
      // console.log(`   Expected: 30-40% faster than update() (no GET)`);

      // replace() skips GET, should be fastest
      expect(avgTime).toBeLessThan(4);
    });
  });

  describe('Performance Comparison - update vs patch vs replace', () => {
    let resource;

    beforeEach(async () => {
      resource = await db.createResource({
        name: 'performance_test',
        attributes: {
          value: 'number|required',
          data: 'object|optional'
        },
        behavior: 'enforce-limits',
        timestamps: true
      });
    });

    it('should demonstrate performance characteristics of each method', async () => {
      // Create test record
      const record = await resource.insert({ value: 0, data: { nested: 'value' } });
      const id = record.id;

      const iterations = 50;

      // Benchmark update()
      const updateStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await resource.update(id, { value: i });
      }
      const updateDuration = Date.now() - updateStart;

      // Benchmark patch()
      const patchStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await resource.patch(id, { value: i });
      }
      const patchDuration = Date.now() - patchStart;

      // Benchmark replace()
      const replaceStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await resource.replace(id, { value: i, data: { nested: 'value' } });
      }
      const replaceDuration = Date.now() - replaceStart;

      const updateAvg = updateDuration / iterations;
      const patchAvg = patchDuration / iterations;
      const replaceAvg = replaceDuration / iterations;

      // console.log(`\n📊 Method Comparison (${iterations} operations each):`);
      // console.log(`   update():  ${updateAvg.toFixed(2)}ms avg (baseline)`);
      // console.log(`   patch():   ${patchAvg.toFixed(2)}ms avg (${((1 - patchAvg/updateAvg) * 100).toFixed(0)}% faster)`);
      // console.log(`   replace(): ${replaceAvg.toFixed(2)}ms avg (${((1 - replaceAvg/updateAvg) * 100).toFixed(0)}% faster)`);

      // console.log(`\n   💡 All methods benefit from structural sharing optimization`);
      // console.log(`   💡 patch() uses HEAD+COPY when possible (40-60% faster)`);
      // console.log(`   💡 replace() skips GET operation (30-40% faster)`);

      // All methods should be reasonably fast (allow system variance in CI)
      expect(updateAvg).toBeLessThan(20);
      expect(patchAvg).toBeLessThan(20);
      expect(replaceAvg).toBeLessThan(20);

      // patch() and replace() should be faster or equal to update()
      expect(patchAvg).toBeLessThanOrEqual(updateAvg * 1.1); // Allow 10% variance
      expect(replaceAvg).toBeLessThanOrEqual(updateAvg * 1.1);
    });
  });

  describe('Memory Efficiency', () => {
    it('should scale linearly with data size (not O(n²))', async () => {
      const resource = await db.createResource({
        name: 'scale_test',
        attributes: {
          data: 'object|required'
        },
        behavior: 'body-overflow' // Use body-overflow to allow large objects
      });

      const sizes = [10, 50, 100, 200];
      const results = [];

      for (const size of sizes) {
        const largeObject = { items: Array.from({ length: size }, (_, i) => ({ id: i, value: `item_${i}` })) };

        const start = Date.now();
        const iterations = 20;

        for (let i = 0; i < iterations; i++) {
          await resource.insert({ data: largeObject });
        }

        const duration = Date.now() - start;
        const avgTime = duration / iterations;
        results.push({ size, avgTime });
      }

      // console.log(`\n📊 Scalability Test (cloneDeep optimization):`);
      results.forEach(r => {
        // console.log(`   ${r.size} items: ${r.avgTime.toFixed(2)}ms avg`);
      });

      // With structural sharing, growth should be near-linear
      // Calculate growth rate between smallest and largest
      const growthFactor = results[results.length - 1].avgTime / results[0].avgTime;
      const dataSizeFactor = sizes[sizes.length - 1] / sizes[0]; // 200/10 = 20x

      // console.log(`\n   Data size grew ${dataSizeFactor}x`);
      // console.log(`   Time grew ${growthFactor.toFixed(2)}x`);
      // console.log(`   Expected: Near-linear growth (< ${dataSizeFactor * 1.5}x)`);
      // console.log(`   ❌ Without optimization: Would be O(n²) growth (~${dataSizeFactor * dataSizeFactor}x)`);

      // Growth should be sub-quadratic (ideally linear)
      expect(growthFactor).toBeLessThan(dataSizeFactor * 1.5);
    });
  });
});
