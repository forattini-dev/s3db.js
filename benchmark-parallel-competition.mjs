import { OperationsPool } from './src/concerns/operations-pool.js';

console.log('⚔️  PARALLEL COMPETITION Benchmark\n');
console.log('Scenario: 2 functions running in parallel, each with 500 operations\n');
console.log('Simulating S3 latency (20-80ms per operation)\n');

// Simulate S3 operation with realistic latency
function simulateS3Operation(id, delayMs, source) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id,
        source,
        success: true,
        delay: delayMs,
        timestamp: Date.now()
      });
    }, delayMs);
  });
}

// Create operations for both functions
function createOperations(prefix, count) {
  return Array.from({ length: count }, (_, i) => {
    const delay = Math.floor(Math.random() * 60) + 20; // 20-80ms
    return {
      id: `${prefix}-${i}`,
      delay,
      fn: (source) => simulateS3Operation(`${prefix}-${i}`, delay, source)
    };
  });
}

const opsFunction1 = createOperations('fn1', 500);
const opsFunction2 = createOperations('fn2', 500);

console.log('═'.repeat(70));
console.log('Test 1: Two Promise.all() running in parallel');
console.log('═'.repeat(70));
console.log('Function 1: Promise.all(500 ops)');
console.log('Function 2: Promise.all(500 ops)');
console.log('Both start simultaneously, unlimited concurrency...\n');

const start1 = Date.now();
let peakMemory1 = 0;
const memInterval1 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory1 = Math.max(peakMemory1, mem);
}, 10);

// Function 1: Promise.all with 500 operations
const function1Promise = (async () => {
  const startF1 = Date.now();
  const results = await Promise.all(opsFunction1.map(op => op.fn('fn1-promise-all')));
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

// Function 2: Promise.all with 500 operations
const function2Promise = (async () => {
  const startF2 = Date.now();
  const results = await Promise.all(opsFunction2.map(op => op.fn('fn2-promise-all')));
  const duration = Date.now() - startF2;
  return { results, duration, name: 'Function 2' };
})();

// Wait for both to complete
const [result1, result2] = await Promise.all([function1Promise, function2Promise]);
clearInterval(memInterval1);
const duration1 = Date.now() - start1;

console.log(`✅ ${result1.name}: ${result1.results.length}/500 ops in ${result1.duration}ms`);
console.log(`✅ ${result2.name}: ${result2.results.length}/500 ops in ${result2.duration}ms`);
console.log(`\n⏱️  Total Duration: ${duration1}ms`);
console.log(`💾 Peak Memory: ${peakMemory1.toFixed(2)} MB`);
console.log(`📊 Total Throughput: ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔥 Peak Concurrency: ~1000 operations (both functions at once)`);

// Wait for GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();

console.log('\n═'.repeat(70));
console.log('Test 2: Two functions sharing a single OperationsPool');
console.log('═'.repeat(70));
console.log('Function 1: Enqueue 500 ops to shared pool');
console.log('Function 2: Enqueue 500 ops to shared pool');
console.log('Pool concurrency: 10 (both functions compete for slots)...\n');

const sharedPool = new OperationsPool({
  concurrency: 10,
  monitoring: { collectMetrics: true }
});

const start2 = Date.now();
let peakMemory2 = 0;
let maxActive2 = 0;
let fn1Count = 0;
let fn2Count = 0;

// Track pool state
sharedPool.on('pool:taskStarted', (task) => {
  const active = sharedPool.getStats().activeCount;
  maxActive2 = Math.max(maxActive2, active);

  if (task.metadata?.source?.includes('fn1')) fn1Count++;
  if (task.metadata?.source?.includes('fn2')) fn2Count++;
});

const memInterval2 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory2 = Math.max(peakMemory2, mem);
}, 10);

// Recreate operations (fresh delays)
const opsFunction1Fresh = createOperations('fn1', 500);
const opsFunction2Fresh = createOperations('fn2', 500);

// Function 1: Enqueue to shared pool
const function1PoolPromise = (async () => {
  const startF1 = Date.now();
  const promises = opsFunction1Fresh.map(op =>
    sharedPool.enqueue(() => op.fn('fn1-shared-pool'), {
      metadata: { source: 'fn1' }
    })
  );
  const results = await Promise.all(promises);
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

// Function 2: Enqueue to shared pool
const function2PoolPromise = (async () => {
  const startF2 = Date.now();
  const promises = opsFunction2Fresh.map(op =>
    sharedPool.enqueue(() => op.fn('fn2-shared-pool'), {
      metadata: { source: 'fn2' }
    })
  );
  const results = await Promise.all(promises);
  const duration = Date.now() - startF2;
  return { results, duration, name: 'Function 2' };
})();

// Wait for both to complete
const [poolResult1, poolResult2] = await Promise.all([
  function1PoolPromise,
  function2PoolPromise
]);
clearInterval(memInterval2);
const duration2 = Date.now() - start2;

const stats2 = sharedPool.getStats();

console.log(`✅ ${poolResult1.name}: ${poolResult1.results.length}/500 ops in ${poolResult1.duration}ms`);
console.log(`✅ ${poolResult2.name}: ${poolResult2.results.length}/500 ops in ${poolResult2.duration}ms`);
console.log(`\n⏱️  Total Duration: ${duration2}ms`);
console.log(`💾 Peak Memory: ${peakMemory2.toFixed(2)} MB`);
console.log(`📊 Total Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔧 Pool Stats:`);
console.log(`   - Processed: ${stats2.processedCount}/1000`);
console.log(`   - Errors: ${stats2.errorCount}`);
console.log(`   - Max Active: ${maxActive2}/10`);
console.log(`   - Peak Concurrency: ${maxActive2} operations`);

// Calculate distribution
const fn1Results = [...poolResult1.results, ...poolResult2.results].filter(r => r.source === 'fn1-shared-pool').length;
const fn2Results = [...poolResult1.results, ...poolResult2.results].filter(r => r.source === 'fn2-shared-pool').length;

console.log(`\n🤝 Load Distribution:`);
console.log(`   - Function 1: ${fn1Results} operations (${(fn1Results/1000*100).toFixed(1)}%)`);
console.log(`   - Function 2: ${fn2Results} operations (${(fn2Results/1000*100).toFixed(1)}%)`);

// Wait for GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();

console.log('\n═'.repeat(70));
console.log('Test 3: Two separate OperationsPools (10 each = 20 total concurrency)');
console.log('═'.repeat(70));
console.log('Function 1: Own pool with 10 concurrency');
console.log('Function 2: Own pool with 10 concurrency');
console.log('Both pools run independently in parallel...\n');

const pool1 = new OperationsPool({ concurrency: 10 });
const pool2 = new OperationsPool({ concurrency: 10 });

const start3 = Date.now();
let peakMemory3 = 0;
const memInterval3 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory3 = Math.max(peakMemory3, mem);
}, 10);

// Recreate operations (fresh delays)
const opsFunction1Fresh2 = createOperations('fn1', 500);
const opsFunction2Fresh2 = createOperations('fn2', 500);

// Function 1: Own pool
const function1SeparatePromise = (async () => {
  const startF1 = Date.now();
  const promises = opsFunction1Fresh2.map(op => pool1.enqueue(() => op.fn('fn1-separate-pool')));
  const results = await Promise.all(promises);
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

// Function 2: Own pool
const function2SeparatePromise = (async () => {
  const startF2 = Date.now();
  const promises = opsFunction2Fresh2.map(op => pool2.enqueue(() => op.fn('fn2-separate-pool')));
  const results = await Promise.all(promises);
  const duration = Date.now() - startF2;
  return { results, duration, name: 'Function 2' };
})();

// Wait for both to complete
const [sepResult1, sepResult2] = await Promise.all([
  function1SeparatePromise,
  function2SeparatePromise
]);
clearInterval(memInterval3);
const duration3 = Date.now() - start3;

const stats3a = pool1.getStats();
const stats3b = pool2.getStats();

console.log(`✅ ${sepResult1.name}: ${sepResult1.results.length}/500 ops in ${sepResult1.duration}ms`);
console.log(`   Pool 1: Processed ${stats3a.processedCount}, Errors ${stats3a.errorCount}`);
console.log(`✅ ${sepResult2.name}: ${sepResult2.results.length}/500 ops in ${sepResult2.duration}ms`);
console.log(`   Pool 2: Processed ${stats3b.processedCount}, Errors ${stats3b.errorCount}`);
console.log(`\n⏱️  Total Duration: ${duration3}ms`);
console.log(`💾 Peak Memory: ${peakMemory3.toFixed(2)} MB`);
console.log(`📊 Total Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔥 Effective Concurrency: 20 operations (10 per pool)`);

console.log('\n═'.repeat(70));
console.log('📊 FINAL COMPARISON');
console.log('═'.repeat(70));

console.log(`\n🏁 Performance Results:\n`);

console.log(`1. Two Promise.all() (unlimited, ~1000 concurrent):`);
console.log(`   Duration:        ${duration1}ms 🏆 FASTEST`);
console.log(`   Memory:          ${peakMemory1.toFixed(2)} MB`);
console.log(`   Throughput:      ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Function 1:      ${result1.duration}ms`);
console.log(`   Function 2:      ${result2.duration}ms`);
console.log(`   Peak Concurrent: ~1000 operations`);

console.log(`\n2. Shared OperationsPool (10 concurrent, functions compete):`);
console.log(`   Duration:        ${duration2}ms (${((duration2/duration1)*100).toFixed(0)}% of Promise.all)`);
console.log(`   Memory:          ${peakMemory2.toFixed(2)} MB`);
console.log(`   Throughput:      ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Function 1:      ${poolResult1.duration}ms`);
console.log(`   Function 2:      ${poolResult2.duration}ms`);
console.log(`   Peak Concurrent: ${maxActive2} operations`);
console.log(`   Distribution:    ${(fn1Results/1000*100).toFixed(0)}% / ${(fn2Results/1000*100).toFixed(0)}%`);

console.log(`\n3. Two Separate Pools (10 each = 20 concurrent total):`);
console.log(`   Duration:        ${duration3}ms (${((duration3/duration1)*100).toFixed(0)}% of Promise.all)`);
console.log(`   Memory:          ${peakMemory3.toFixed(2)} MB`);
console.log(`   Throughput:      ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Function 1:      ${sepResult1.duration}ms`);
console.log(`   Function 2:      ${sepResult2.duration}ms`);
console.log(`   Peak Concurrent: 20 operations (10+10)`);

console.log(`\n💡 Key Insights:\n`);

const speedup32 = ((duration2 - duration3) / duration2 * 100).toFixed(1);
console.log(`✅ Separate Pools vs Shared Pool:`);
console.log(`   - ${speedup32}% ${duration3 < duration2 ? 'FASTER' : 'SLOWER'} (${Math.abs(duration3 - duration2)}ms difference)`);
console.log(`   - Separate: ${sepResult1.duration}ms + ${sepResult2.duration}ms in parallel`);
console.log(`   - Shared: ${poolResult1.duration}ms + ${poolResult2.duration}ms competing`);
console.log(`   - Why: ${duration3 < duration2 ? '2x concurrency (20 vs 10)' : 'Contention overhead'}`);

const memoryDiff = ((peakMemory2 - peakMemory1) / peakMemory1 * 100).toFixed(0);
console.log(`\n✅ Memory Comparison:`);
console.log(`   - Promise.all:      ${peakMemory1.toFixed(2)} MB (baseline)`);
console.log(`   - Shared Pool:      ${peakMemory2.toFixed(2)} MB (${memoryDiff > 0 ? '+' : ''}${memoryDiff}%)`);
console.log(`   - Separate Pools:   ${peakMemory3.toFixed(2)} MB (${((peakMemory3 - peakMemory1) / peakMemory1 * 100).toFixed(0)}%)`);

console.log(`\n🎯 Recommendations:\n`);

console.log(`📌 Use SHARED POOL when:`);
console.log(`   - You want strict global concurrency limit (e.g., S3 rate limit)`);
console.log(`   - Fair scheduling between functions is important`);
console.log(`   - Single bottleneck resource (one S3 bucket with rate limit)`);
console.log(`   - Example: ${duration2}ms for 1000 ops with ${maxActive2} max concurrent`);

console.log(`\n📌 Use SEPARATE POOLS when:`);
console.log(`   - Functions need independent concurrency control`);
console.log(`   - Different priority/timeout/retry per function`);
console.log(`   - Isolated resources (different S3 buckets/regions)`);
console.log(`   - Want 2x throughput: ${duration3}ms vs ${duration2}ms`);

console.log(`\n📌 Use PROMISE.ALL when:`);
console.log(`   - Development/testing only`);
console.log(`   - No rate limits to worry about`);
console.log(`   - Maximum speed needed: ${duration1}ms (${((duration2/duration1)).toFixed(1)}x faster than pools)`);
console.log(`   - But risky in production!`);

console.log(`\n🏆 Winner: ${duration3 < duration2 ? 'Separate Pools' : 'Shared Pool'} (${Math.min(duration2, duration3)}ms)`);
console.log(`   Best balance of speed, control, and resource safety`);
