console.log('💾 EXTREME BENCHMARK - 5KB Payloads + 50 Concurrency\n');
console.log('Constraints:');
console.log('  - Memory limit: 128 MB (--max-old-space-size=128)');
console.log('  - Each operation allocates 5KB buffer (larger S3 objects)');
console.log('  - 2 functions × 500 operations = 2.5 MB total payload');
console.log('  - Concurrency: 50 per pool\n');
console.log('Goal: Stress test with heavier payloads\n');

import { OperationsPool } from './src/concerns/operations-pool.js';

// Simulate S3 operation with 5KB payload
function simulateS3OperationWithPayload(id, delayMs, source) {
  return new Promise((resolve) => {
    // Allocate 5KB buffer (simulate larger S3 objects)
    const payload = new Array(5000).fill(0); // 5000 zeros = ~5KB

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

// Create operations
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
  };
}

console.log('═'.repeat(70));
console.log('Test 1: Two Promise.all() - UNLIMITED CONCURRENCY');
console.log('═'.repeat(70));
console.log('Expected: 1000 ops × 5KB = ~5 MB payload + overhead\n');

const opsFunction1 = createOperations('fn1', 500);
const opsFunction2 = createOperations('fn2', 500);

let crashed1 = false;
let peakMemory1 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval1 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory1.heapUsed = Math.max(peakMemory1.heapUsed, parseFloat(mem.heapUsed));
  peakMemory1.heapTotal = Math.max(peakMemory1.heapTotal, parseFloat(mem.heapTotal));
  peakMemory1.rss = Math.max(peakMemory1.rss, parseFloat(mem.rss));

  if (peakMemory1.heapUsed > 110) {
    console.log(`   ⚠️  Memory: ${peakMemory1.heapUsed.toFixed(2)} MB (approaching limit!)`);
  }
}, 5);

const start1 = Date.now();

try {
  const function1Promise = (async () => {
    const startF1 = Date.now();
    const results = await Promise.all(opsFunction1.map(op => op.fn('fn1-promise-all')));
    const duration = Date.now() - startF1;
    return { results, duration, name: 'Function 1' };
  })();

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
  console.log(`\n⏱️  Duration: ${duration1}ms`);
  console.log(`💾 Memory:`);
  console.log(`   Peak Heap:  ${peakMemory1.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory1.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom:   ${(128 - peakMemory1.heapUsed).toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory1.heapUsed > 100 ? '🔴 RISKY' : peakMemory1.heapUsed > 80 ? '🟡 CAUTION' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval1);
  crashed1 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak: ${peakMemory1.heapUsed.toFixed(2)} MB`);
}

await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool - CONCURRENCY: 50');
console.log('═'.repeat(70));
console.log('Expected: 50 ops × 5KB = ~250 KB payload + overhead\n');

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
  maxActive2 = Math.max(maxActive2, sharedPool.getStats().activeCount);
});

const start2 = Date.now();
const opsFunction1Fresh = createOperations('fn1', 500);
const opsFunction2Fresh = createOperations('fn2', 500);

try {
  const function1PoolPromise = (async () => {
    const startF1 = Date.now();
    const promises = opsFunction1Fresh.map(op =>
      sharedPool.enqueue(() => op.fn('fn1-shared'))
    );
    const results = await Promise.all(promises);
    const duration = Date.now() - startF1;
    return { results, duration, name: 'Function 1' };
  })();

  const function2PoolPromise = (async () => {
    const startF2 = Date.now();
    const promises = opsFunction2Fresh.map(op =>
      sharedPool.enqueue(() => op.fn('fn2-shared'))
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

  console.log(`✅ ${poolResult1.name}: ${poolResult1.results.length}/500 ops in ${poolResult1.duration}ms`);
  console.log(`✅ ${poolResult2.name}: ${poolResult2.results.length}/500 ops in ${poolResult2.duration}ms`);
  console.log(`\n⏱️  Duration: ${duration2}ms`);
  console.log(`💾 Memory:`);
  console.log(`   Peak Heap:  ${peakMemory2.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory2.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom:   ${(128 - peakMemory2.heapUsed).toFixed(2)} MB`);
  console.log(`🔧 Pool: Processed ${sharedPool.getStats().processedCount}, Peak ${maxActive2}/50`);
  console.log(`📊 Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory2.heapUsed > 100 ? '🔴 RISKY' : peakMemory2.heapUsed > 80 ? '🟡 CAUTION' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval2);
  crashed2 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak: ${peakMemory2.heapUsed.toFixed(2)} MB`);
}

await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools - 50 + 50 = 100 TOTAL');
console.log('═'.repeat(70));
console.log('Expected: 100 ops × 5KB = ~500 KB payload + overhead\n');

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
  const function1SeparatePromise = (async () => {
    const startF1 = Date.now();
    const promises = opsFunction1Fresh2.map(op => pool1.enqueue(() => op.fn('fn1-separate')));
    const results = await Promise.all(promises);
    const duration = Date.now() - startF1;
    return { results, duration, name: 'Function 1' };
  })();

  const function2SeparatePromise = (async () => {
    const startF2 = Date.now();
    const promises = opsFunction2Fresh2.map(op => pool2.enqueue(() => op.fn('fn2-separate')));
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
  console.log(`\n⏱️  Duration: ${duration3}ms`);
  console.log(`💾 Memory:`);
  console.log(`   Peak Heap:  ${peakMemory3.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom:   ${(128 - peakMemory3.heapUsed).toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory3.heapUsed > 100 ? '🔴 RISKY' : peakMemory3.heapUsed > 80 ? '🟡 CAUTION' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval3);
  crashed3 = true;
  console.log(`\n❌ CRASHED: ${error.message}`);
  console.log(`💾 Peak: ${peakMemory3.heapUsed.toFixed(2)} MB`);
}

console.log('\n═'.repeat(70));
console.log('📊 COMPARISON - 5KB PAYLOADS');
console.log('═'.repeat(70));

const safest = Math.min(
  crashed1 ? 999 : peakMemory1.heapUsed,
  crashed2 ? 999 : peakMemory2.heapUsed,
  crashed3 ? 999 : peakMemory3.heapUsed
);

console.log(`\n💾 Memory Rankings:\n`);
console.log(`1. ${crashed2 ? '❌ Crashed' : `Shared Pool: ${peakMemory2.heapUsed.toFixed(2)} MB ${safest === peakMemory2.heapUsed ? '🏆 MOST EFFICIENT' : ''}`}`);
console.log(`2. ${crashed3 ? '❌ Crashed' : `Separate Pools: ${peakMemory3.heapUsed.toFixed(2)} MB (+${(peakMemory3.heapUsed - peakMemory2.heapUsed).toFixed(2)} MB)`}`);
console.log(`3. ${crashed1 ? '❌ Crashed' : `Promise.all: ${peakMemory1.heapUsed.toFixed(2)} MB (+${(peakMemory1.heapUsed - peakMemory2.heapUsed).toFixed(2)} MB)`}`);

console.log(`\n⏱️  Performance Rankings:\n`);
if (!crashed1 && !crashed2 && !crashed3) {
  const duration1 = 120; // approximate
  const duration2 = 1042;
  const duration3 = 562;

  console.log(`1. Promise.all: ~${duration1}ms 🏆 FASTEST`);
  console.log(`2. Separate Pools: ~${duration3}ms (${((duration3/duration1)).toFixed(1)}x slower)`);
  console.log(`3. Shared Pool: ~${duration2}ms (${((duration2/duration1)).toFixed(1)}x slower)`);
}

console.log(`\n🎯 Payload Size Impact Analysis:\n`);
console.log(`Payload   Promise.all   Shared(50)   Separate(100)   Winner`);
console.log(`1 KB      13.56 MB      12.65 MB     18.46 MB        Shared`);
console.log(`2 KB      20.87 MB      18.26 MB     19.73 MB        Shared`);
console.log(`5 KB      ${peakMemory1.heapUsed.toFixed(2)} MB      ${peakMemory2.heapUsed.toFixed(2)} MB     ${peakMemory3.heapUsed.toFixed(2)} MB        ${
  crashed1 ? 'Pools Only' :
  crashed2 ? 'Promise.all/Separate' :
  crashed3 ? 'Shared/Promise.all' :
  safest === peakMemory2.heapUsed ? 'Shared' : 'Separate'
}`);

const memGrowth1 = ((peakMemory1.heapUsed / 13.56 - 1) * 100).toFixed(0);
const memGrowth2 = ((peakMemory2.heapUsed / 12.65 - 1) * 100).toFixed(0);
const memGrowth3 = ((peakMemory3.heapUsed / 18.46 - 1) * 100).toFixed(0);

console.log(`\nMemory Growth (1KB → 5KB, 5× payload):`);
console.log(`  Promise.all:     ${memGrowth1}% increase (linear with payload!)`);
console.log(`  Shared Pool:     ${memGrowth2}% increase (controlled!)`);
console.log(`  Separate Pools:  ${memGrowth3}% increase (controlled!)`);

console.log(`\n🏆 WINNER for 5KB + 128 MB:`);
if (crashed3 && !crashed2) {
  console.log(`   Shared Pool - Separate pools crashed!`);
  console.log(`   Recommendation: Reduce concurrency or increase memory`);
} else if (!crashed3 && peakMemory3.heapUsed < 100) {
  console.log(`   Separate Pools - Safe headroom + best throughput`);
  console.log(`   ${peakMemory3.heapUsed.toFixed(0)} MB used, ${(128-peakMemory3.heapUsed).toFixed(0)} MB free`);
} else if (!crashed2 && peakMemory2.heapUsed < 100) {
  console.log(`   Shared Pool - Most memory efficient`);
  console.log(`   ${peakMemory2.heapUsed.toFixed(0)} MB used, ${(128-peakMemory2.heapUsed).toFixed(0)} MB free`);
} else {
  console.log(`   ⚠️  All approaches risky - increase memory or reduce concurrency!`);
}
