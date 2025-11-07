/**
 * CRUD Memory Benchmark
 *
 * Measures memory impact of cloneDeep optimizations in write-heavy workloads
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';
import { getMemoryUsage, forceGC } from '../src/concerns/memory-profiler.js';

async function benchmarkCRUDMemory() {
  console.log('🔬 CRUD Memory Benchmark - Write-Heavy Workload\n');
  console.log('Testing impact of cloneDeep optimizations...\n');

  // Setup
  const db = new Database({
    client: new MemoryClient({ bucket: 'bench', keyPrefix: 'bench/' }),
    deferMetadataWrites: true
  });
  await db.connect();

  const resource = await db.createResource({
    name: 'test_writes',
    attributes: {
      id: 'string|required',
      name: 'string',
      email: 'email',
      age: 'number',
      active: 'boolean',
      metadata: {
        $$type: 'object',
        tags: 'array',
        description: 'string',
        count: 'number'
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  });

  // Warm up
  for (let i = 0; i < 10; i++) {
    await resource.insert({
      id: `warmup-${i}`,
      name: `Warmup ${i}`,
      email: `warmup${i}@test.com`,
      age: 25 + i,
      active: true,
      metadata: {
        tags: ['test', 'warmup'],
        description: 'Warmup record',
        count: i
      }
    });
  }

  forceGC();
  await new Promise(resolve => setTimeout(resolve, 200));

  // Benchmark 1: INSERT heavy
  console.log('📝 Test 1: INSERT Operations (100 records)');
  const beforeInserts = getMemoryUsage();
  const insertStart = Date.now();

  for (let i = 0; i < 100; i++) {
    await resource.insert({
      id: `insert-${i}`,
      name: `User ${i}`,
      email: `user${i}@test.com`,
      age: 20 + (i % 50),
      active: i % 2 === 0,
      metadata: {
        tags: ['user', `batch-${Math.floor(i / 10)}`],
        description: `User number ${i} in the system`,
        count: i * 10
      }
    });
  }

  const insertTime = Date.now() - insertStart;
  forceGC();
  await new Promise(resolve => setTimeout(resolve, 200));
  const afterInserts = getMemoryUsage();

  console.log(`  Time: ${insertTime}ms (${(insertTime / 100).toFixed(2)}ms per insert)`);
  console.log(`  Heap Growth: ${(afterInserts.heapUsedMB - beforeInserts.heapUsedMB).toFixed(2)} MB`);
  console.log(`  Per Operation: ${((afterInserts.heapUsedMB - beforeInserts.heapUsedMB) / 100 * 1024).toFixed(0)} KB\n`);

  // Benchmark 2: UPDATE heavy
  console.log('✏️  Test 2: UPDATE Operations (100 updates)');
  const beforeUpdates = getMemoryUsage();
  const updateStart = Date.now();

  for (let i = 0; i < 100; i++) {
    await resource.update(`insert-${i}`, {
      name: `Updated User ${i}`,
      age: 30 + (i % 40),
      'metadata.count': i * 20,
      'metadata.description': `Updated description for user ${i}`
    });
  }

  const updateTime = Date.now() - updateStart;
  forceGC();
  await new Promise(resolve => setTimeout(resolve, 200));
  const afterUpdates = getMemoryUsage();

  console.log(`  Time: ${updateTime}ms (${(updateTime / 100).toFixed(2)}ms per update)`);
  console.log(`  Heap Growth: ${(afterUpdates.heapUsedMB - beforeUpdates.heapUsedMB).toFixed(2)} MB`);
  console.log(`  Per Operation: ${((afterUpdates.heapUsedMB - beforeUpdates.heapUsedMB) / 100 * 1024).toFixed(0)} KB\n`);

  // Benchmark 3: REPLACE heavy
  console.log('🔄 Test 3: REPLACE Operations (50 replaces)');
  const beforeReplaces = getMemoryUsage();
  const replaceStart = Date.now();

  for (let i = 0; i < 50; i++) {
    await resource.replace(`insert-${i}`, {
      name: `Replaced User ${i}`,
      email: `replaced${i}@test.com`,
      age: 40 + (i % 30),
      active: false,
      metadata: {
        tags: ['replaced'],
        description: `Completely replaced user ${i}`,
        count: i * 30
      }
    });
  }

  const replaceTime = Date.now() - replaceStart;
  forceGC();
  await new Promise(resolve => setTimeout(resolve, 200));
  const afterReplaces = getMemoryUsage();

  console.log(`  Time: ${replaceTime}ms (${(replaceTime / 50).toFixed(2)}ms per replace)`);
  console.log(`  Heap Growth: ${(afterReplaces.heapUsedMB - beforeReplaces.heapUsedMB).toFixed(2)} MB`);
  console.log(`  Per Operation: ${((afterReplaces.heapUsedMB - beforeReplaces.heapUsedMB) / 50 * 1024).toFixed(0)} KB\n`);

  // Summary
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  const totalOps = 100 + 100 + 50;
  const totalTime = insertTime + updateTime + replaceTime;
  const finalMemory = getMemoryUsage();

  console.log(`  Total Operations: ${totalOps}`);
  console.log(`  Total Time: ${totalTime}ms`);
  console.log(`  Avg Time per Op: ${(totalTime / totalOps).toFixed(2)}ms`);
  console.log(`  Final Heap Used: ${finalMemory.heapUsedMB.toFixed(2)} MB`);
  console.log(`  RSS: ${finalMemory.rssMB.toFixed(2)} MB`);
  console.log('='.repeat(60));

  await db.disconnect();
  console.log('\n✅ Benchmark complete!');
}

benchmarkCRUDMemory().catch(console.error);
