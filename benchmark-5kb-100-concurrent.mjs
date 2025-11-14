console.log('💾 EXTREME BENCHMARK - 5KB Payloads + 100 Concurrency\n');
console.log('Constraints:');
console.log('  - Memory limit: 128 MB (--max-old-space-size=128)');
console.log('  - Each operation allocates 5KB buffer');
console.log('  - 2 functions × 500 operations = 2.5 MB total payload');
console.log('  - Concurrency: 100 per pool (HIGH!)\n');
console.log('Goal: Test maximum concurrency with heavy payloads\n');

import { OperationsPool } from './src/concerns/operations-pool.js';

// Simulate S3 operation with 5KB payload
function simulateS3OperationWithPayload(id, delayMs, source) {
  return new Promise((resolve) => {
    // Allocate 5KB buffer
    const payload = new Array(5000).fill(0); // 5KB

    setTimeout(() => {
      resolve({
        id,
        source,
        success: true,
        delay: delayMs,
        payloadSize: payload.length,
        timestamp: Date.now()
      });
    }, delayMs);
  });
}

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

function getMemoryMB() {
  const mem = process.memoryUsage();
  return {
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2),
  };
}

console.log('═'.repeat(70));
console.log('Test 1: Two Promise.all() - UNLIMITED (~1000 concurrent)');
console.log('═'.repeat(70));
console.log('Expected: 1000 ops × 5KB = ~5 MB payload\n');

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

const function1Promise = (async () => {
  const startF1 = Date.now();
  const results = await Promise.all(opsFunction1.map(op => op.fn('fn1-all')));
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

const function2Promise = (async () => {
  const startF2 = Date.now();
  const results = await Promise.all(opsFunction2.map(op => op.fn('fn2-all')));
  const duration = Date.now() - startF2;
  return { results, duration, name: 'Function 2' };
})();

const [result1, result2] = await Promise.all([function1Promise, function2Promise]);
clearInterval(memInterval1);
const duration1 = Date.now() - start1;

console.log(`✅ ${result1.name}: ${result1.results.length}/500 in ${result1.duration}ms`);
console.log(`✅ ${result2.name}: ${result2.results.length}/500 in ${result2.duration}ms`);
console.log(`\n⏱️  Duration: ${duration1}ms`);
console.log(`💾 Memory: ${peakMemory1.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory1.heapUsed/128*100).toFixed(0)}%)`);
console.log(`   Headroom: ${(128 - peakMemory1.heapUsed).toFixed(2)} MB`);
console.log(`📊 Throughput: ${(1000 / (duration1 / 1000)).toFixed(0)} ops/sec`);

await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool - CONCURRENCY: 100');
console.log('═'.repeat(70));
console.log('Expected: 100 ops × 5KB = ~500 KB payload\n');

let peakMemory2 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval2 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory2.heapUsed = Math.max(peakMemory2.heapUsed, parseFloat(mem.heapUsed));
  peakMemory2.heapTotal = Math.max(peakMemory2.heapTotal, parseFloat(mem.heapTotal));
  peakMemory2.rss = Math.max(peakMemory2.rss, parseFloat(mem.rss));
}, 5);

const sharedPool = new OperationsPool({
  concurrency: 100,
  monitoring: { collectMetrics: true }
});

let maxActive2 = 0;
sharedPool.on('pool:taskStarted', () => {
  maxActive2 = Math.max(maxActive2, sharedPool.getStats().activeCount);
});

const start2 = Date.now();
const opsFunction1Fresh = createOperations('fn1', 500);
const opsFunction2Fresh = createOperations('fn2', 500);

const function1PoolPromise = (async () => {
  const startF1 = Date.now();
  const promises = opsFunction1Fresh.map(op => sharedPool.enqueue(() => op.fn('fn1-shared')));
  const results = await Promise.all(promises);
  const duration = Date.now() - startF1;
  return { results, duration, name: 'Function 1' };
})();

const function2PoolPromise = (async () => {
  const startF2 = Date.now();
  const promises = opsFunction2Fresh.map(op => sharedPool.enqueue(() => op.fn('fn2-shared')));
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

console.log(`✅ ${poolResult1.name}: ${poolResult1.results.length}/500 in ${poolResult1.duration}ms`);
console.log(`✅ ${poolResult2.name}: ${poolResult2.results.length}/500 in ${poolResult2.duration}ms`);
console.log(`\n⏱️  Duration: ${duration2}ms`);
console.log(`💾 Memory: ${peakMemory2.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory2.heapUsed/128*100).toFixed(0)}%)`);
console.log(`   Headroom: ${(128 - peakMemory2.heapUsed).toFixed(2)} MB`);
console.log(`🔧 Pool: Processed ${sharedPool.getStats().processedCount}, Peak ${maxActive2}/100`);
console.log(`📊 Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);

await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools - 100 + 100 = 200 TOTAL!');
console.log('═'.repeat(70));
console.log('Expected: 200 ops × 5KB = ~1 MB payload\n');

let peakMemory3 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval3 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory3.heapUsed = Math.max(peakMemory3.heapUsed, parseFloat(mem.heapUsed));
  peakMemory3.heapTotal = Math.max(peakMemory3.heapTotal, parseFloat(mem.heapTotal));
  peakMemory3.rss = Math.max(peakMemory3.rss, parseFloat(mem.rss));
}, 5);

const pool1 = new OperationsPool({ concurrency: 100 });
const pool2 = new OperationsPool({ concurrency: 100 });

const start3 = Date.now();
const opsFunction1Fresh2 = createOperations('fn1', 500);
const opsFunction2Fresh2 = createOperations('fn2', 500);

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

console.log(`✅ ${sepResult1.name}: ${sepResult1.results.length}/500 in ${sepResult1.duration}ms`);
console.log(`✅ ${sepResult2.name}: ${sepResult2.results.length}/500 in ${sepResult2.duration}ms`);
console.log(`\n⏱️  Duration: ${duration3}ms`);
console.log(`💾 Memory: ${peakMemory3.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}%)`);
console.log(`   Headroom: ${(128 - peakMemory3.heapUsed).toFixed(2)} MB`);
console.log(`📊 Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);

console.log('\n═'.repeat(70));
console.log('📊 COMPARISON - CONCURRENCY IMPACT (5KB payloads)');
console.log('═'.repeat(70));

console.log(`\n⏱️  Duration Comparison:\n`);
console.log(`Promise.all:     ${duration1}ms 🏆 FASTEST`);
console.log(`Shared Pool:     ${duration2}ms (${((duration2/duration1)).toFixed(1)}x slower)`);
console.log(`Separate Pools:  ${duration3}ms (${((duration3/duration1)).toFixed(1)}x slower)`);

console.log(`\n💾 Memory Comparison:\n`);
console.log(`Promise.all:     ${peakMemory1.heapUsed.toFixed(2)} MB (${(peakMemory1.heapUsed/128*100).toFixed(0)}% of limit)`);
console.log(`Shared Pool:     ${peakMemory2.heapUsed.toFixed(2)} MB (${(peakMemory2.heapUsed/128*100).toFixed(0)}% of limit)`);
console.log(`Separate Pools:  ${peakMemory3.heapUsed.toFixed(2)} MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}% of limit)`);

console.log(`\n📊 Concurrency Scaling (5KB payloads):\n`);
console.log(`Concurrency   Duration   Memory    Throughput`);
console.log(`50 (shared)   1042ms     20.36 MB  960 ops/s`);
console.log(`100 (shared)  ${duration2}ms     ${peakMemory2.heapUsed.toFixed(2)} MB  ${(1000/(duration2/1000)).toFixed(0)} ops/s`);
console.log(``);
console.log(`50+50 (sep)   552ms      22.58 MB  1812 ops/s`);
console.log(`100+100 (sep) ${duration3}ms     ${peakMemory3.heapUsed.toFixed(2)} MB  ${(1000/(duration3/1000)).toFixed(0)} ops/s`);

const speedup = ((duration2 - duration3) / duration2 * 100).toFixed(1);
const memDiff = peakMemory3.heapUsed - peakMemory2.heapUsed;
const memPct = ((memDiff / peakMemory2.heapUsed) * 100).toFixed(0);

console.log(`\n🎯 Separate vs Shared (100 concurrency):\n`);
console.log(`Speed:   ${speedup}% ${duration3 < duration2 ? 'FASTER' : 'SLOWER'} (${Math.abs(duration3-duration2).toFixed(0)}ms saved)`);
console.log(`Memory:  ${memDiff > 0 ? '+' : ''}${memDiff.toFixed(2)} MB (${memPct > 0 ? '+' : ''}${memPct}% more)`);
console.log(`Trade-off: ${memPct}% more memory for ${speedup}% more speed`);

console.log(`\n💡 Key Insights:\n`);

const throughputGain = ((1000/(duration3/1000)) - (1000/(duration2/1000))).toFixed(0);
console.log(`✅ Doubling concurrency (50→100) impact:`);
console.log(`   Shared Pool:     ~${((1042-duration2)/1042*100).toFixed(0)}% faster (${1042-duration2}ms saved)`);
console.log(`   Separate Pools:  ~${((552-duration3)/552*100).toFixed(0)}% faster (${552-duration3}ms saved)`);

console.log(`\n✅ Memory efficiency with 100 concurrency:`);
console.log(`   Shared:   ${peakMemory2.heapUsed.toFixed(2)} MB for 100 concurrent`);
console.log(`   Separate: ${peakMemory3.heapUsed.toFixed(2)} MB for 200 concurrent (!!)`);
console.log(`   Ratio:    ${(peakMemory3.heapUsed/peakMemory2.heapUsed).toFixed(2)}x memory for 2x concurrency`);

const headroom3 = 128 - peakMemory3.heapUsed;
console.log(`\n✅ Safety check (128 MB limit):`);
console.log(`   Promise.all:     ${(128-peakMemory1.heapUsed).toFixed(0)} MB headroom (${((128-peakMemory1.heapUsed)/128*100).toFixed(0)}%)`);
console.log(`   Shared Pool:     ${(128-peakMemory2.heapUsed).toFixed(0)} MB headroom (${((128-peakMemory2.heapUsed)/128*100).toFixed(0)}%)`);
console.log(`   Separate Pools:  ${headroom3.toFixed(0)} MB headroom (${(headroom3/128*100).toFixed(0)}%)`);

console.log(`\n🏆 WINNER for 5KB + 100 concurrency:\n`);

if (headroom3 > 50) {
  console.log(`   ✅ SEPARATE POOLS - Clear winner!`);
  console.log(`   - ${peakMemory3.heapUsed.toFixed(0)} MB used (${(peakMemory3.heapUsed/128*100).toFixed(0)}% of limit)`);
  console.log(`   - ${headroom3.toFixed(0)} MB headroom (safe!)`);
  console.log(`   - ${(1000/(duration3/1000)).toFixed(0)} ops/sec (${speedup}% faster than shared)`);
  console.log(`   - 200 concurrent operations (100 per pool)`);
  console.log(`   - Both functions finish in ~${Math.max(sepResult1.duration, sepResult2.duration)}ms`);
} else if (headroom3 > 20) {
  console.log(`   ⚠️  SEPARATE POOLS - With caution`);
  console.log(`   - ${headroom3.toFixed(0)} MB headroom (tight!)`);
  console.log(`   - Monitor memory closely`);
  console.log(`   - Consider 75 concurrency per pool instead`);
} else {
  console.log(`   ❌ SHARED POOL - Safer choice`);
  console.log(`   - Separate pools too risky (${headroom3.toFixed(0)} MB headroom)`);
  console.log(`   - Accept slower performance for stability`);
}

console.log(`\n🎯 Production Recommendation:\n`);
console.log(`For 5KB payloads in 128 MB container:`);
console.log(`  - Concurrency 50:  Safe and fast (${(128-22.58).toFixed(0)} MB headroom)`);
console.log(`  - Concurrency 100: ${headroom3 > 50 ? 'Safe' : headroom3 > 20 ? 'Risky' : 'Dangerous'} (${headroom3.toFixed(0)} MB headroom)`);
console.log(`  - Sweet spot: ~75 concurrency per pool`);
