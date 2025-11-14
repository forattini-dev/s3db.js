import { Database } from './src/database.class.js';

console.log('🏁 Benchmark: OperationsPool vs Promise.all()\n');
console.log('Scenario: insertMany() with 100 items\n');

// Setup database
const db = new Database({
  connectionString: 'memory://test/benchmark'
});

await db.connect();

// Test 1: WITH OperationsPool (default)
console.log('═══════════════════════════════════════════════════════════');
console.log('Test 1: WITH OperationsPool (concurrency: 10)');
console.log('═══════════════════════════════════════════════════════════\n');

const resourceWithPool = await db.createResource({
  name: 'items_with_pool',
  attributes: {
    name: 'string|required',
    value: 'number'
  }
});

console.log(`OperationsPool enabled: ${resourceWithPool.client.operationsPool ? 'YES' : 'NO'}`);
if (resourceWithPool.client.operationsPool) {
  console.log(`Concurrency limit: ${resourceWithPool.client.operationsPool.concurrency}`);
}

const items1 = Array.from({ length: 100 }, (_, i) => ({
  name: `Item ${i}`,
  value: i * 100
}));

const start1 = Date.now();
const results1 = await resourceWithPool.insertMany(items1);
const duration1 = Date.now() - start1;

console.log(`\n✅ Inserted ${results1.length} items in ${duration1}ms`);
console.log(`   Average: ${(duration1 / results1.length).toFixed(2)}ms per item`);

// Get pool stats
if (resourceWithPool.client.operationsPool) {
  const stats = resourceWithPool.client.operationsPool.getStats();
  console.log(`\n📊 Pool Stats:`);
  console.log(`   - Processed: ${stats.processedCount}`);
  console.log(`   - Errors: ${stats.errorCount}`);
  console.log(`   - Active: ${stats.activeCount}`);
  console.log(`   - Queue size: ${stats.queueSize}`);
}

// Test 2: WITHOUT OperationsPool (bypassed)
console.log('\n═══════════════════════════════════════════════════════════');
console.log('Test 2: WITHOUT OperationsPool (Promise.all - unlimited concurrency)');
console.log('═══════════════════════════════════════════════════════════\n');

const resourceNoPool = await db.createResource({
  name: 'items_no_pool',
  attributes: {
    name: 'string|required',
    value: 'number'
  }
});

// Bypass pool by using _executeBatchHelper with bypassPool flag
const items2 = Array.from({ length: 100 }, (_, i) => ({
  name: `Item ${i}`,
  value: i * 100
}));

// Create operations manually
const operations = items2.map(attributes => async () => {
  return await resourceNoPool.insert(attributes);
});

const start2 = Date.now();
// Use Promise.all directly (simulate what happens when pool is bypassed)
const settled = await Promise.allSettled(operations.map(op => op()));
const results2 = settled
  .filter(s => s.status === 'fulfilled')
  .map(s => s.value);
const duration2 = Date.now() - start2;

console.log(`✅ Inserted ${results2.length} items in ${duration2}ms`);
console.log(`   Average: ${(duration2 / results2.length).toFixed(2)}ms per item`);

// Test 3: MemoryClient (no pool, uses @supercharge/promise-pool internally)
console.log('\n═══════════════════════════════════════════════════════════');
console.log('Test 3: MemoryClient (uses @supercharge/promise-pool)');
console.log('═══════════════════════════════════════════════════════════\n');

const dbMemory = new Database({
  connectionString: 'memory://test/benchmark2'
});
await dbMemory.connect();

const resourceMemory = await dbMemory.createResource({
  name: 'items_memory',
  attributes: {
    name: 'string|required',
    value: 'number'
  }
});

console.log(`Client type: ${resourceMemory.client.constructor.name}`);
console.log(`OperationsPool: ${resourceMemory.client.operationsPool ? 'YES' : 'NO (uses @supercharge/promise-pool)'}`);

const items3 = Array.from({ length: 100 }, (_, i) => ({
  name: `Item ${i}`,
  value: i * 100
}));

const start3 = Date.now();
const results3 = await resourceMemory.insertMany(items3);
const duration3 = Date.now() - start3;

console.log(`\n✅ Inserted ${results3.length} items in ${duration3}ms`);
console.log(`   Average: ${(duration3 / results3.length).toFixed(2)}ms per item`);

// Comparison
console.log('\n═══════════════════════════════════════════════════════════');
console.log('📊 COMPARISON');
console.log('═══════════════════════════════════════════════════════════\n');

const fastest = Math.min(duration1, duration2, duration3);
const overhead1 = duration1 - fastest;
const overhead2 = duration2 - fastest;
const overhead3 = duration3 - fastest;

console.log(`1. OperationsPool (concurrency: 10):     ${duration1}ms ${overhead1 === 0 ? '🏆 FASTEST' : `(+${overhead1}ms, ${((overhead1/fastest)*100).toFixed(1)}% slower)`}`);
console.log(`2. Promise.all (unlimited):              ${duration2}ms ${overhead2 === 0 ? '🏆 FASTEST' : `(+${overhead2}ms, ${((overhead2/fastest)*100).toFixed(1)}% slower)`}`);
console.log(`3. @supercharge/promise-pool (default):  ${duration3}ms ${overhead3 === 0 ? '🏆 FASTEST' : `(+${overhead3}ms, ${((overhead3/fastest)*100).toFixed(1)}% slower)`}`);

console.log('\n💡 Analysis:\n');

if (duration1 < duration2) {
  console.log('✅ OperationsPool is FASTER than Promise.all');
  console.log('   Why? Controlled concurrency reduces memory pressure and context switching');
} else if (duration2 < duration1) {
  console.log('⚠️  Promise.all is FASTER than OperationsPool');
  const diff = duration1 - duration2;
  const pct = ((diff / duration2) * 100).toFixed(1);
  console.log(`   Overhead: ${diff}ms (${pct}% slower)`);
  if (diff < 10) {
    console.log('   Verdict: Overhead is MINIMAL (<10ms) - worth it for:');
    console.log('            - Retry logic');
    console.log('            - Timeout control');
    console.log('            - Metrics collection');
    console.log('            - Backpressure management');
  } else {
    console.log('   Verdict: Overhead is SIGNIFICANT - reevaluate for fast operations');
  }
} else {
  console.log('🤝 OperationsPool and Promise.all are EQUAL');
}

console.log('\n🎯 Conclusion:\n');
console.log('   OperationsPool is valuable when you need:');
console.log('   - Controlled concurrency (prevent overwhelming S3)');
console.log('   - Automatic retry with exponential backoff');
console.log('   - Per-operation timeout');
console.log('   - Metrics and monitoring');
console.log('   - Priority queue');
console.log('   - Adaptive tuning');
console.log('\n   For simple, fast, in-memory operations: Promise.all is simpler');
console.log('   For production S3 operations: OperationsPool is essential');
