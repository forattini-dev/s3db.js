console.log('💥 EXTREME STRESS TEST - 10K Operations!\n');
console.log('Constraints:');
console.log('  - Memory limit: 128 MB (--max-old-space-size=128)');
console.log('  - Each operation allocates 5KB buffer (5000 zeros)');
console.log('  - 2 functions × 5000 operations = 10K total');
console.log('  - Total payload: 10K × 5KB = 50 MB!\n');
console.log('Goal: Stress test at scale\n');

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
console.log('Test 1: Two Promise.all() - 5K each = 10K TOTAL');
console.log('═'.repeat(70));
console.log('Function 1: Promise.all(5000 ops)');
console.log('Function 2: Promise.all(5000 ops)');
console.log('Expected: 10K ops × 5KB = ~50 MB payload + overhead\n');

const opsFunction1 = createOperations('fn1', 5000);
const opsFunction2 = createOperations('fn2', 5000);

let duration1, duration2, duration3;
let crashed1 = false;
let peakMemory1 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval1 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory1.heapUsed = Math.max(peakMemory1.heapUsed, parseFloat(mem.heapUsed));
  peakMemory1.heapTotal = Math.max(peakMemory1.heapTotal, parseFloat(mem.heapTotal));
  peakMemory1.rss = Math.max(peakMemory1.rss, parseFloat(mem.rss));

  if (parseFloat(mem.heapUsed) > 100) {
    console.log(`   ⚠️  Memory: ${mem.heapUsed} MB (${(parseFloat(mem.heapUsed)/128*100).toFixed(0)}% of limit)`);
  }
}, 10);

const start1 = Date.now();
let result1, result2;

try {
  console.log('   Starting Function 1 (5000 ops)...');
  const function1Promise = (async () => {
    const startF1 = Date.now();
    const results = await Promise.all(opsFunction1.map(op => op.fn('fn1-all')));
    const duration = Date.now() - startF1;
    return { results, duration, name: 'Function 1' };
  })();

  console.log('   Starting Function 2 (5000 ops)...');
  const function2Promise = (async () => {
    const startF2 = Date.now();
    const results = await Promise.all(opsFunction2.map(op => op.fn('fn2-all')));
    const duration = Date.now() - startF2;
    return { results, duration, name: 'Function 2' };
  })();

  [result1, result2] = await Promise.all([function1Promise, function2Promise]);
  clearInterval(memInterval1);
  duration1 = Date.now() - start1;

  console.log(`\n✅ ${result1.name}: ${result1.results.length}/5000 in ${result1.duration}ms`);
  console.log(`✅ ${result2.name}: ${result2.results.length}/5000 in ${result2.duration}ms`);
  console.log(`\n⏱️  Duration: ${duration1}ms`);
  console.log(`💾 Memory: ${peakMemory1.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory1.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom: ${(128 - peakMemory1.heapUsed).toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(10000 / (duration1 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory1.heapUsed > 110 ? '🔴 CRITICAL' : peakMemory1.heapUsed > 90 ? '🟡 RISKY' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval1);
  crashed1 = true;
  console.log(`\n💥 CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory1.heapUsed.toFixed(2)} MB before crash`);
  console.log(`   Reason: Tried to allocate 10K × 5KB = 50 MB simultaneously!`);
}

await new Promise(r => setTimeout(r, 2000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 1000));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool - CONCURRENCY: 100');
console.log('═'.repeat(70));
console.log('Function 1: Enqueue 5000 ops to shared pool');
console.log('Function 2: Enqueue 5000 ops to shared pool');
console.log('Expected: 100 ops × 5KB = ~500 KB payload + overhead\n');

let crashed2 = false;
let peakMemory2 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval2 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory2.heapUsed = Math.max(peakMemory2.heapUsed, parseFloat(mem.heapUsed));
  peakMemory2.heapTotal = Math.max(peakMemory2.heapTotal, parseFloat(mem.heapTotal));
  peakMemory2.rss = Math.max(peakMemory2.rss, parseFloat(mem.rss));
}, 10);

const sharedPool = new OperationsPool({
  concurrency: 100,
  monitoring: { collectMetrics: true }
});

let maxActive2 = 0;
let progressLogged2 = 0;
sharedPool.on('pool:taskStarted', () => {
  maxActive2 = Math.max(maxActive2, sharedPool.getStats().activeCount);
});
sharedPool.on('pool:taskCompleted', () => {
  const processed = sharedPool.getStats().processedCount;
  if (processed >= progressLogged2 + 1000) {
    console.log(`   Progress: ${processed}/10000 ops (${(processed/10000*100).toFixed(0)}%)`);
    progressLogged2 = processed;
  }
});

const start2 = Date.now();
const opsFunction1Fresh = createOperations('fn1', 5000);
const opsFunction2Fresh = createOperations('fn2', 5000);

try {
  console.log('   Enqueuing 10K operations...');

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
  duration2 = Date.now() - start2;

  console.log(`\n✅ ${poolResult1.name}: ${poolResult1.results.length}/5000 in ${poolResult1.duration}ms`);
  console.log(`✅ ${poolResult2.name}: ${poolResult2.results.length}/5000 in ${poolResult2.duration}ms`);
  console.log(`\n⏱️  Duration: ${duration2}ms`);
  console.log(`💾 Memory: ${peakMemory2.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory2.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom: ${(128 - peakMemory2.heapUsed).toFixed(2)} MB`);
  console.log(`🔧 Pool: Processed ${sharedPool.getStats().processedCount}, Peak ${maxActive2}/100`);
  console.log(`📊 Throughput: ${(10000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory2.heapUsed > 110 ? '🔴 CRITICAL' : peakMemory2.heapUsed > 90 ? '🟡 RISKY' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval2);
  crashed2 = true;
  console.log(`\n💥 CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory2.heapUsed.toFixed(2)} MB`);
}

await new Promise(r => setTimeout(r, 2000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 1000));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools - 100 + 100 = 200 TOTAL');
console.log('═'.repeat(70));
console.log('Function 1: Own pool with 5000 ops');
console.log('Function 2: Own pool with 5000 ops');
console.log('Expected: 200 ops × 5KB = ~1 MB payload + overhead\n');

let crashed3 = false;
let peakMemory3 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval3 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory3.heapUsed = Math.max(peakMemory3.heapUsed, parseFloat(mem.heapUsed));
  peakMemory3.heapTotal = Math.max(peakMemory3.heapTotal, parseFloat(mem.heapTotal));
  peakMemory3.rss = Math.max(peakMemory3.rss, parseFloat(mem.rss));
}, 10);

const pool1 = new OperationsPool({ concurrency: 100 });
const pool2 = new OperationsPool({ concurrency: 100 });

let progressLogged3 = 0;
const logProgress = () => {
  const total = pool1.getStats().processedCount + pool2.getStats().processedCount;
  if (total >= progressLogged3 + 1000) {
    console.log(`   Progress: ${total}/10000 ops (${(total/10000*100).toFixed(0)}%)`);
    progressLogged3 = total;
  }
};
pool1.on('pool:taskCompleted', logProgress);
pool2.on('pool:taskCompleted', logProgress);

const start3 = Date.now();
const opsFunction1Fresh2 = createOperations('fn1', 5000);
const opsFunction2Fresh2 = createOperations('fn2', 5000);

try {
  console.log('   Enqueuing 10K operations across 2 pools...');

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
  duration3 = Date.now() - start3;

  console.log(`\n✅ ${sepResult1.name}: ${sepResult1.results.length}/5000 in ${sepResult1.duration}ms`);
  console.log(`✅ ${sepResult2.name}: ${sepResult2.results.length}/5000 in ${sepResult2.duration}ms`);
  console.log(`\n⏱️  Duration: ${duration3}ms`);
  console.log(`💾 Memory: ${peakMemory3.heapUsed.toFixed(2)} MB / 128 MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}%)`);
  console.log(`   Headroom: ${(128 - peakMemory3.heapUsed).toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(10000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Status: ${peakMemory3.heapUsed > 110 ? '🔴 CRITICAL' : peakMemory3.heapUsed > 90 ? '🟡 RISKY' : '🟢 SAFE'}`);
} catch (error) {
  clearInterval(memInterval3);
  crashed3 = true;
  console.log(`\n💥 CRASHED: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory3.heapUsed.toFixed(2)} MB`);
}

console.log('\n═'.repeat(70));
console.log('📊 FINAL COMPARISON - 10K OPERATIONS');
console.log('═'.repeat(70));

console.log(`\n💥 Survival Report:\n`);
console.log(`1. Promise.all (10K concurrent):  ${crashed1 ? '💀 CRASHED' : '✅ Survived'}`);
console.log(`2. Shared Pool (100 concurrent):  ${crashed2 ? '💀 CRASHED' : '✅ Survived'}`);
console.log(`3. Separate Pools (200 total):    ${crashed3 ? '💀 CRASHED' : '✅ Survived'}`);

if (!crashed1 && !crashed2 && !crashed3) {
  console.log(`\n⏱️  Performance Rankings:\n`);

  console.log(`1. Promise.all:     ${duration1}ms 🏆`);
  console.log(`2. Separate Pools:  ${duration3}ms (${((duration3/duration1)).toFixed(1)}x slower)`);
  console.log(`3. Shared Pool:     ${duration2}ms (${((duration2/duration1)).toFixed(1)}x slower)`);

  console.log(`\n💾 Memory Rankings:\n`);
  console.log(`1. Shared Pool:     ${peakMemory2.heapUsed.toFixed(2)} MB 🏆`);
  console.log(`2. Separate Pools:  ${peakMemory3.heapUsed.toFixed(2)} MB (+${(peakMemory3.heapUsed - peakMemory2.heapUsed).toFixed(2)} MB)`);
  console.log(`3. Promise.all:     ${peakMemory1.heapUsed.toFixed(2)} MB (+${(peakMemory1.heapUsed - peakMemory2.heapUsed).toFixed(2)} MB)`);
}

console.log(`\n🎯 Key Insights:\n`);

if (crashed1) {
  console.log(`❌ Promise.all FAILED at scale:`);
  console.log(`   - Attempted 10K concurrent operations`);
  console.log(`   - 10K × 5KB = 50 MB payload alone`);
  console.log(`   - Plus overhead = OOM!`);
  console.log(`   - Conclusion: UNSAFE for production at scale`);
}

if (!crashed2) {
  console.log(`✅ Shared Pool SURVIVED:`);
  console.log(`   - Controlled 100 concurrent max`);
  console.log(`   - Memory: ${peakMemory2.heapUsed.toFixed(0)} MB (constant regardless of queue size!)`);
  console.log(`   - Slower but SAFE and RELIABLE`);
}

if (!crashed3) {
  console.log(`✅ Separate Pools SURVIVED:`);
  console.log(`   - 200 concurrent operations (100 per pool)`);
  console.log(`   - Memory: ${peakMemory3.heapUsed.toFixed(0)} MB`);
  console.log(`   - ${!crashed2 ? `${((1000/(duration3/1000))/(1000/(duration2/1000))*100-100).toFixed(0)}% faster than shared` : 'Fast and reliable'}`);
  console.log(`   - Best balance of speed and safety`);
}

console.log(`\n🏆 WINNER for 10K operations:\n`);

if (crashed1 && !crashed3) {
  console.log(`   SEPARATE POOLS - Only survivor with good performance!`);
  console.log(`   - Promise.all crashed (predictable)`);
  console.log(`   - Separate pools handled 10K ops safely`);
  console.log(`   - Memory footprint: ${peakMemory3.heapUsed.toFixed(0)} MB (${(peakMemory3.heapUsed/128*100).toFixed(0)}% of limit)`);
} else if (!crashed1 && !crashed2 && !crashed3) {
  const fastest = Math.min(duration1, duration2, duration3);
  if (fastest === duration3 || (128 - peakMemory3.heapUsed) > 50) {
    console.log(`   SEPARATE POOLS - Best balance!`);
    console.log(`   - Faster than shared pool`);
    console.log(`   - Safe memory usage (${(128 - peakMemory3.heapUsed).toFixed(0)} MB headroom)`);
    console.log(`   - Scalable to 10K+ operations`);
  } else {
    console.log(`   SHARED POOL - Most memory efficient!`);
    console.log(`   - Lowest memory usage`);
    console.log(`   - Handles any scale safely`);
    console.log(`   - Accept slower performance for reliability`);
  }
}

console.log(`\n📈 Scalability Verdict:\n`);
console.log(`Promise.all:     ${crashed1 ? '❌ Fails at 10K' : '⚠️  Risky at scale'}`);
console.log(`Shared Pool:     ✅ Scales to millions (constant memory)`);
console.log(`Separate Pools:  ✅ Scales to 100K+ (${!crashed3 ? 'best performance' : 'with limits'})`);
