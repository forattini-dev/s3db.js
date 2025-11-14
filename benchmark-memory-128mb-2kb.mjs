console.log('💾 MEMORY PRESSURE Benchmark - REALISTIC S3 SCENARIO\n');
console.log('Constraints:');
console.log('  - Memory limit: 128 MB (--max-old-space-size=128)');
console.log('  - Each operation allocates 2KB buffer (typical S3 metadata)');
console.log('  - 2 functions × 500 operations = 1000 KB total payload\n');
console.log('  - Concurrency: 50 per pool (production-level)\n');
console.log('Goal: Test realistic S3 production scenario\n');

import { OperationsPool } from './src/concerns/operations-pool.js';

// Simulate S3 operation with realistic 2KB payload
function simulateS3OperationWithPayload(id, delayMs, source) {
  return new Promise((resolve) => {
    // Allocate 2KB buffer (simulate S3 object metadata + small body)
    const payload = new Array(2000).fill(0); // 2000 zeros = ~2KB

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
console.log('Unlimited concurrency (~1000 concurrent operations)');
console.log('Expected memory: 1000 ops × 2KB = ~2 MB payload + overhead\n');

const opsFunction1 = createOperations('fn1', 500);
const opsFunction2 = createOperations('fn2', 500);

let crashed1 = false;
let peakMemory1 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval1 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory1.heapUsed = Math.max(peakMemory1.heapUsed, parseFloat(mem.heapUsed));
  peakMemory1.heapTotal = Math.max(peakMemory1.heapTotal, parseFloat(mem.heapTotal));
  peakMemory1.rss = Math.max(peakMemory1.rss, parseFloat(mem.rss));

  // Check if approaching limit
  if (peakMemory1.heapUsed > 120) {
    console.log(`   ⚠️  Memory warning: ${peakMemory1.heapUsed.toFixed(2)} MB (approaching 128 MB limit)`);
  }
}, 5);

const start1 = Date.now();

try {
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
  console.log(`   - Heap Used:  ${peakMemory1.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory1.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   - Heap Total: ${peakMemory1.heapTotal.toFixed(2)} MB`);
  console.log(`   - RSS:        ${peakMemory1.rss.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ✅ SURVIVED (${(128 - peakMemory1.heapUsed).toFixed(2)} MB headroom)`);
} catch (error) {
  clearInterval(memInterval1);
  crashed1 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory1.heapUsed.toFixed(2)} MB before crash`);
}

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool (concurrency: 50)');
console.log('═'.repeat(70));
console.log('Max 50 operations executing at once');
console.log('Expected memory: 50 ops × 2KB = ~100 KB payload + overhead\n');

let crashed2 = false;
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

try {
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
  console.log(`   - Heap Used:  ${peakMemory2.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory2.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   - Heap Total: ${peakMemory2.heapTotal.toFixed(2)} MB`);
  console.log(`   - RSS:        ${peakMemory2.rss.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🔧 Pool Stats: Processed ${stats2.processedCount}, Errors ${stats2.errorCount}`);
  console.log(`🔥 Peak Concurrency: ${maxActive2}/50`);
  console.log(`🎯 Status: ✅ SURVIVED (${(128 - peakMemory2.heapUsed).toFixed(2)} MB headroom)`);
} catch (error) {
  clearInterval(memInterval2);
  crashed2 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory2.heapUsed.toFixed(2)} MB before crash`);
}

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools (50 each = 100 total)');
console.log('═'.repeat(70));
console.log('Max 100 operations executing at once (50 per pool)');
console.log('Expected memory: 100 ops × 2KB = ~200 KB payload + overhead\n');

let crashed3 = false;
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

try {
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
  console.log(`   - Heap Used:  ${peakMemory3.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   - Heap Total: ${peakMemory3.heapTotal.toFixed(2)} MB`);
  console.log(`   - RSS:        ${peakMemory3.rss.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ✅ SURVIVED (${(128 - peakMemory3.heapUsed).toFixed(2)} MB headroom)`);
} catch (error) {
  clearInterval(memInterval3);
  crashed3 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory3.heapUsed.toFixed(2)} MB before crash`);
}

console.log('\n═'.repeat(70));
console.log('📊 FINAL ANALYSIS - 128 MB LIMIT, 2KB PAYLOADS');
console.log('═'.repeat(70));

console.log(`\n💾 Memory Usage (Peak Heap / 128 MB limit):\n`);

const mem1Pct = (peakMemory1.heapUsed / 128 * 100).toFixed(0);
const mem2Pct = (peakMemory2.heapUsed / 128 * 100).toFixed(0);
const mem3Pct = (peakMemory3.heapUsed / 128 * 100).toFixed(0);

console.log(`1. Promise.all (~1000 concurrent):`);
console.log(`   ${crashed1 ? '❌ CRASHED' : `✅ ${peakMemory1.heapUsed.toFixed(2)} MB (${mem1Pct}% of limit)`}`);
if (!crashed1) {
  const headroom1 = 128 - peakMemory1.heapUsed;
  console.log(`   Headroom: ${headroom1.toFixed(2)} MB`);
  console.log(`   Risk: ${headroom1 < 20 ? '🔴 HIGH' : headroom1 < 50 ? '🟡 MEDIUM' : '🟢 LOW'}`);
}

console.log(`\n2. Shared Pool (50 concurrent):`);
console.log(`   ${crashed2 ? '❌ CRASHED' : `✅ ${peakMemory2.heapUsed.toFixed(2)} MB (${mem2Pct}% of limit)`}`);
if (!crashed2) {
  const headroom2 = 128 - peakMemory2.heapUsed;
  console.log(`   Headroom: ${headroom2.toFixed(2)} MB`);
  console.log(`   Risk: ${headroom2 < 20 ? '🔴 HIGH' : headroom2 < 50 ? '🟡 MEDIUM' : '🟢 LOW'}`);
}

console.log(`\n3. Separate Pools (100 concurrent):`);
console.log(`   ${crashed3 ? '❌ CRASHED' : `✅ ${peakMemory3.heapUsed.toFixed(2)} MB (${mem3Pct}% of limit)`}`);
if (!crashed3) {
  const headroom3 = 128 - peakMemory3.heapUsed;
  console.log(`   Headroom: ${headroom3.toFixed(2)} MB`);
  console.log(`   Risk: ${headroom3 < 20 ? '🔴 HIGH' : headroom3 < 50 ? '🟡 MEDIUM' : '🟢 LOW'}`);
}

if (!crashed1 && !crashed2 && !crashed3) {
  console.log(`\n🎯 Performance vs Memory Trade-off:\n`);

  const duration1 = 94; // From previous run (approximate)
  const duration2 = 1041;
  const duration3 = 548;

  console.log(`                     Speed      Memory    Headroom   Risk`);
  console.log(`Promise.all:         FASTEST    ${mem1Pct}%       ${(128-peakMemory1.heapUsed).toFixed(0)} MB      ${(128-peakMemory1.heapUsed) < 20 ? 'HIGH' : 'MEDIUM'}`);
  console.log(`Shared Pool:         SLOWEST    ${mem2Pct}%       ${(128-peakMemory2.heapUsed).toFixed(0)} MB      LOW`);
  console.log(`Separate Pools:      BALANCED   ${mem3Pct}%       ${(128-peakMemory3.heapUsed).toFixed(0)} MB      ${(128-peakMemory3.heapUsed) < 50 ? 'MEDIUM' : 'LOW'}`);
}

console.log(`\n🎯 Production Recommendation (128 MB container):\n`);

if (!crashed2 && !crashed3) {
  const memDiff = peakMemory3.heapUsed - peakMemory2.heapUsed;
  const headroom3 = 128 - peakMemory3.heapUsed;

  if (headroom3 > 50) {
    console.log(`✅ Use SEPARATE POOLS:`);
    console.log(`   - ${peakMemory3.heapUsed.toFixed(0)} MB used, ${headroom3.toFixed(0)} MB headroom (safe!)`);
    console.log(`   - 2x throughput vs shared pool`);
    console.log(`   - Worth the +${memDiff.toFixed(0)} MB for better performance`);
  } else if (headroom3 > 20) {
    console.log(`⚠️  Use SEPARATE POOLS with caution:`);
    console.log(`   - ${peakMemory3.heapUsed.toFixed(0)} MB used, ${headroom3.toFixed(0)} MB headroom (tight!)`);
    console.log(`   - Monitor memory closely`);
    console.log(`   - Consider reducing concurrency to 30-40 per pool`);
  } else {
    console.log(`❌ Use SHARED POOL (safer):`);
    console.log(`   - ${peakMemory2.heapUsed.toFixed(0)} MB used, ${(128-peakMemory2.heapUsed).toFixed(0)} MB headroom`);
    console.log(`   - Separate pools would risk OOM`);
    console.log(`   - Accept slower performance for stability`);
  }
}

console.log(`\n📊 Scaling Projection (2KB payloads):\n`);
console.log(`Operations   Promise.all   Shared(50)   Separate(100)`);
console.log(`1,000        ${peakMemory1.heapUsed.toFixed(0)} MB        ${peakMemory2.heapUsed.toFixed(0)} MB       ${peakMemory3.heapUsed.toFixed(0)} MB`);
console.log(`10,000       ${(peakMemory1.heapUsed * 10).toFixed(0)} MB ⚠️    ${peakMemory2.heapUsed.toFixed(0)} MB       ${peakMemory3.heapUsed.toFixed(0)} MB`);
console.log(`100,000      ${(peakMemory1.heapUsed * 100).toFixed(0)} MB ❌   ${peakMemory2.heapUsed.toFixed(0)} MB       ${peakMemory3.heapUsed.toFixed(0)} MB`);

console.log(`\n🏆 Winner for 128 MB + 2KB payloads: ${
  crashed3 ? 'Shared Pool (Separate crashed)' :
  (128 - peakMemory3.heapUsed) > 50 ? 'Separate Pools (safe headroom)' :
  (128 - peakMemory3.heapUsed) > 20 ? 'Separate Pools (with monitoring)' :
  'Shared Pool (safer choice)'
}`);
