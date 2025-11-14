console.log('💾 MEMORY PRESSURE Benchmark - HIGH CONCURRENCY\n');
console.log('Constraints:');
console.log('  - Concurrency: 50 (production-level)');
console.log('  - Each operation allocates 1KB buffer (1000 zeros)');
console.log('  - 2 functions × 500 operations = 1000 KB total payload\n');
console.log('Goal: Test realistic S3 production concurrency\n');

import { OperationsPool } from './src/concerns/operations-pool.js';

// Simulate S3 operation with memory allocation
function simulateS3OperationWithPayload(id, delayMs, source) {
  return new Promise((resolve) => {
    // Allocate 1KB buffer (simulate S3 object data)
    const payload = new Array(1000).fill(0); // 1000 zeros

    setTimeout(() => {
      resolve({
        id,
        source,
        success: true,
        delay: delayMs,
        payloadSize: payload.length,
        timestamp: Date.now()
      });
      // payload goes out of scope here
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
      fn: (source) => simulateS3OperationWithPayload(`${prefix}-${i}`, delay, source)
    };
  });
}

// Monitor memory
function getMemoryMB() {
  const mem = process.memoryUsage();
  return {
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2),
    external: (mem.external / 1024 / 1024).toFixed(2)
  };
}

console.log('═'.repeat(70));
console.log('Test 1: Two Promise.all() running in parallel');
console.log('═'.repeat(70));
console.log('Unlimited concurrency (~1000 concurrent operations)\n');

const opsFunction1 = createOperations('fn1', 500);
const opsFunction2 = createOperations('fn2', 500);

let peakMemory1 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval1 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory1.heapUsed = Math.max(peakMemory1.heapUsed, parseFloat(mem.heapUsed));
  peakMemory1.heapTotal = Math.max(peakMemory1.heapTotal, parseFloat(mem.heapTotal));
  peakMemory1.rss = Math.max(peakMemory1.rss, parseFloat(mem.rss));
}, 5);

const start1 = Date.now();

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

const [result1, result2] = await Promise.all([function1Promise, function2Promise]);
clearInterval(memInterval1);
const duration1 = Date.now() - start1;

console.log(`✅ ${result1.name}: ${result1.results.length}/500 ops in ${result1.duration}ms`);
console.log(`✅ ${result2.name}: ${result2.results.length}/500 ops in ${result2.duration}ms`);
console.log(`\n⏱️  Total Duration: ${duration1}ms`);
console.log(`💾 Peak Memory:`);
console.log(`   - Heap Used:  ${peakMemory1.heapUsed.toFixed(2)} MB`);
console.log(`   - Heap Total: ${peakMemory1.heapTotal.toFixed(2)} MB`);
console.log(`   - RSS:        ${peakMemory1.rss.toFixed(2)} MB`);
console.log(`📊 Throughput: ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔥 Concurrency: ~1000 operations`);

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool (concurrency: 50)');
console.log('═'.repeat(70));
console.log('Max 50 operations executing at once (both functions compete)\n');

let peakMemory2 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval2 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory2.heapUsed = Math.max(peakMemory2.heapUsed, parseFloat(mem.heapUsed));
  peakMemory2.heapTotal = Math.max(peakMemory2.heapTotal, parseFloat(mem.heapTotal));
  peakMemory2.rss = Math.max(peakMemory2.rss, parseFloat(mem.rss));
}, 5);

const sharedPool = new OperationsPool({
  concurrency: 50,
  monitoring: { collectMetrics: true }
});

let maxActive2 = 0;
sharedPool.on('pool:taskStarted', () => {
  const active = sharedPool.getStats().activeCount;
  maxActive2 = Math.max(maxActive2, active);
});

const start2 = Date.now();

const opsFunction1Fresh = createOperations('fn1', 500);
const opsFunction2Fresh = createOperations('fn2', 500);

// Function 1: Enqueue to shared pool
const function1PoolPromise = (async () => {
  const startF1 = Date.now();
  const promises = opsFunction1Fresh.map(op =>
    sharedPool.enqueue(() => op.fn('fn1-shared-pool'))
  );
  const results = await Promise.all(promises);
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

// Function 2: Enqueue to shared pool
const function2PoolPromise = (async () => {
  const startF2 = Date.now();
  const promises = opsFunction2Fresh.map(op =>
    sharedPool.enqueue(() => op.fn('fn2-shared-pool'))
  );
  const results = await Promise.all(promises);
  const duration = Date.now() - startF2;
  return { results, duration, name: 'Function 2' };
})();

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
console.log(`💾 Peak Memory:`);
console.log(`   - Heap Used:  ${peakMemory2.heapUsed.toFixed(2)} MB`);
console.log(`   - Heap Total: ${peakMemory2.heapTotal.toFixed(2)} MB`);
console.log(`   - RSS:        ${peakMemory2.rss.toFixed(2)} MB`);
console.log(`📊 Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔧 Pool Stats: Processed ${stats2.processedCount}, Errors ${stats2.errorCount}`);
console.log(`🔥 Peak Concurrency: ${maxActive2}/50`);

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools (50 each = 100 total)');
console.log('═'.repeat(70));
console.log('Max 100 operations executing at once (50 per pool)\n');

let peakMemory3 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval3 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory3.heapUsed = Math.max(peakMemory3.heapUsed, parseFloat(mem.heapUsed));
  peakMemory3.heapTotal = Math.max(peakMemory3.heapTotal, parseFloat(mem.heapTotal));
  peakMemory3.rss = Math.max(peakMemory3.rss, parseFloat(mem.rss));
}, 5);

const pool1 = new OperationsPool({ concurrency: 50 });
const pool2 = new OperationsPool({ concurrency: 50 });

const start3 = Date.now();

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

const [sepResult1, sepResult2] = await Promise.all([
  function1SeparatePromise,
  function2SeparatePromise
]);
clearInterval(memInterval3);
const duration3 = Date.now() - start3;

console.log(`✅ ${sepResult1.name}: ${sepResult1.results.length}/500 ops in ${sepResult1.duration}ms`);
console.log(`✅ ${sepResult2.name}: ${sepResult2.results.length}/500 ops in ${sepResult2.duration}ms`);
console.log(`\n⏱️  Total Duration: ${duration3}ms`);
console.log(`💾 Peak Memory:`);
console.log(`   - Heap Used:  ${peakMemory3.heapUsed.toFixed(2)} MB`);
console.log(`   - Heap Total: ${peakMemory3.heapTotal.toFixed(2)} MB`);
console.log(`   - RSS:        ${peakMemory3.rss.toFixed(2)} MB`);
console.log(`📊 Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
console.log(`🔥 Effective Concurrency: 100 operations (50+50)`);

console.log('\n═'.repeat(70));
console.log('📊 COMPARISON - CONCURRENCY: 50');
console.log('═'.repeat(70));

console.log(`\n🏁 Performance Results:\n`);

console.log(`1. Promise.all (~1000 concurrent):`);
console.log(`   Duration:     ${duration1}ms 🏆 FASTEST`);
console.log(`   Memory:       ${peakMemory1.heapUsed.toFixed(2)} MB`);
console.log(`   Throughput:   ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Fn1 / Fn2:    ${result1.duration}ms / ${result2.duration}ms`);

console.log(`\n2. Shared Pool (50 concurrent):`);
console.log(`   Duration:     ${duration2}ms (${((duration2/duration1)*100).toFixed(0)}% of Promise.all)`);
console.log(`   Memory:       ${peakMemory2.heapUsed.toFixed(2)} MB`);
console.log(`   Throughput:   ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Fn1 / Fn2:    ${poolResult1.duration}ms / ${poolResult2.duration}ms`);
console.log(`   Peak Active:  ${maxActive2}/50`);

console.log(`\n3. Separate Pools (50 each = 100 total):`);
console.log(`   Duration:     ${duration3}ms (${((duration3/duration1)*100).toFixed(0)}% of Promise.all)`);
console.log(`   Memory:       ${peakMemory3.heapUsed.toFixed(2)} MB`);
console.log(`   Throughput:   ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
console.log(`   Fn1 / Fn2:    ${sepResult1.duration}ms / ${sepResult2.duration}ms`);

console.log(`\n💡 Key Insights:\n`);

const speedup32 = ((duration2 - duration3) / duration2 * 100).toFixed(1);
console.log(`✅ Separate vs Shared Pool:`);
console.log(`   - ${speedup32}% ${duration3 < duration2 ? 'FASTER' : 'SLOWER'} (${Math.abs(duration3 - duration2)}ms)`);
console.log(`   - Shared:   Fn2 waits ${poolResult2.duration}ms (${((poolResult2.duration/poolResult1.duration)*100).toFixed(0)}% of Fn1)`);
console.log(`   - Separate: Both finish ~${Math.max(sepResult1.duration, sepResult2.duration)}ms (parallel)`);

const memDiff = ((peakMemory3.heapUsed - peakMemory2.heapUsed) / peakMemory2.heapUsed * 100).toFixed(0);
console.log(`\n✅ Memory Trade-off:`);
console.log(`   - Shared Pool:    ${peakMemory2.heapUsed.toFixed(2)} MB (50 concurrent)`);
console.log(`   - Separate Pools: ${peakMemory3.heapUsed.toFixed(2)} MB (100 concurrent)`);
console.log(`   - Difference:     ${memDiff}% more for ${duration2 > duration3 ? ((duration2/duration3)).toFixed(1) : '1'}x speedup`);

console.log(`\n✅ vs Promise.all:`);
console.log(`   - Shared saves:   ${((peakMemory1.heapUsed - peakMemory2.heapUsed) / peakMemory1.heapUsed * 100).toFixed(0)}% memory`);
console.log(`   - Separate saves: ${((peakMemory1.heapUsed - peakMemory3.heapUsed) / peakMemory1.heapUsed * 100).toFixed(0)}% memory`);
console.log(`   - Speed cost:     ${((duration2/duration1)).toFixed(1)}x slower (Shared), ${((duration3/duration1)).toFixed(1)}x slower (Separate)`);

console.log(`\n🎯 Production S3 Recommendation:\n`);
console.log(`With concurrency: 50 (realistic S3 limit):`);
console.log(`  ✅ Shared Pool:    Best for memory efficiency (${peakMemory2.heapUsed.toFixed(0)} MB)`);
console.log(`  ✅ Separate Pools: Best for throughput (${(1000 / (duration3 / 1000)).toFixed(0)} ops/s)`);
console.log(`  ❌ Promise.all:    Fastest but risky (${peakMemory1.heapUsed.toFixed(0)} MB, OOM at scale)`);

console.log(`\n🏆 Winner: ${duration3 < duration2 ? 'Separate Pools' : 'Shared Pool'}`);
console.log(`   Best balance: ${duration3 < duration2 ?
  `${(1000 / (duration3 / 1000)).toFixed(0)} ops/s with ${peakMemory3.heapUsed.toFixed(0)} MB` :
  `${(1000 / (duration2 / 1000)).toFixed(0)} ops/s with ${peakMemory2.heapUsed.toFixed(0)} MB`
}`);
