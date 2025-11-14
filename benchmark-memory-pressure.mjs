console.log('💾 MEMORY PRESSURE Benchmark\n');
console.log('Constraints:');
console.log('  - Memory limit: 10 MB (via --max-old-space-size=10)');
console.log('  - Each operation allocates 1KB buffer (1000 zeros)');
console.log('  - 2 functions × 500 operations = 1000 KB total payload\n');
console.log('Goal: See which approach handles memory pressure better\n');

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

const opsFunction1 = createOperations('fn1', 500);
const opsFunction2 = createOperations('fn2', 500);

console.log('═'.repeat(70));
console.log('Test 1: Two Promise.all() running in parallel');
console.log('═'.repeat(70));
console.log('All 1000 operations start immediately...');
console.log('Expected memory: ~1 MB payload + overhead\n');

let crashed1 = false;
let peakMemory1 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval1 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory1.heapUsed = Math.max(peakMemory1.heapUsed, parseFloat(mem.heapUsed));
  peakMemory1.heapTotal = Math.max(peakMemory1.heapTotal, parseFloat(mem.heapTotal));
  peakMemory1.rss = Math.max(peakMemory1.rss, parseFloat(mem.rss));
}, 5);

process.on('uncaughtException', (err) => {
  if (err.message.includes('heap') || err.message.includes('memory')) {
    crashed1 = true;
    clearInterval(memInterval1);
    console.log('\n❌ CRASHED: Out of memory!');
    console.log(`   Error: ${err.message}`);
    console.log(`   Peak Memory: ${peakMemory1.heapUsed.toFixed(2)} MB heap used`);
    console.log('\n⚠️  Promise.all tried to allocate 1000 buffers simultaneously');
    console.log('   Result: Memory exhaustion\n');
  }
});

const start1 = Date.now();
let result1, result2;

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

  [result1, result2] = await Promise.all([function1Promise, function2Promise]);
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
  console.log(`🎯 Memory efficiency: ${crashed1 ? '❌ CRASHED' : '✅ SURVIVED'}`);
} catch (error) {
  clearInterval(memInterval1);
  crashed1 = true;
  console.log(`\n❌ ERROR: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory1.heapUsed.toFixed(2)} MB heap used`);
}

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 2: Shared OperationsPool (concurrency: 10)');
console.log('═'.repeat(70));
console.log('Max 10 operations executing at once...');
console.log('Expected memory: ~10 KB payload + overhead\n');

let crashed2 = false;
let peakMemory2 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval2 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory2.heapUsed = Math.max(peakMemory2.heapUsed, parseFloat(mem.heapUsed));
  peakMemory2.heapTotal = Math.max(peakMemory2.heapTotal, parseFloat(mem.heapTotal));
  peakMemory2.rss = Math.max(peakMemory2.rss, parseFloat(mem.rss));
}, 5);

const sharedPool = new OperationsPool({
  concurrency: 10,
  monitoring: { collectMetrics: true }
});

const start2 = Date.now();

// Recreate operations
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
  console.log(`   - Heap Used:  ${peakMemory2.heapUsed.toFixed(2)} MB`);
  console.log(`   - Heap Total: ${peakMemory2.heapTotal.toFixed(2)} MB`);
  console.log(`   - RSS:        ${peakMemory2.rss.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration2 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🔧 Pool Stats: Processed ${stats2.processedCount}, Errors ${stats2.errorCount}`);
  console.log(`🎯 Memory efficiency: ${crashed2 ? '❌ CRASHED' : '✅ SURVIVED'}`);
} catch (error) {
  clearInterval(memInterval2);
  crashed2 = true;
  console.log(`\n❌ ERROR: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory2.heapUsed.toFixed(2)} MB heap used`);
}

// Force GC
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();
await new Promise(r => setTimeout(r, 500));

console.log('\n═'.repeat(70));
console.log('Test 3: Separate OperationsPools (10 each)');
console.log('═'.repeat(70));
console.log('Max 20 operations executing at once (10 per pool)...');
console.log('Expected memory: ~20 KB payload + overhead\n');

let crashed3 = false;
let peakMemory3 = { heapUsed: 0, heapTotal: 0, rss: 0 };
const memInterval3 = setInterval(() => {
  const mem = getMemoryMB();
  peakMemory3.heapUsed = Math.max(peakMemory3.heapUsed, parseFloat(mem.heapUsed));
  peakMemory3.heapTotal = Math.max(peakMemory3.heapTotal, parseFloat(mem.heapTotal));
  peakMemory3.rss = Math.max(peakMemory3.rss, parseFloat(mem.rss));
}, 5);

const pool1 = new OperationsPool({ concurrency: 10 });
const pool2 = new OperationsPool({ concurrency: 10 });

const start3 = Date.now();

// Recreate operations
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
  console.log(`   - Heap Used:  ${peakMemory3.heapUsed.toFixed(2)} MB`);
  console.log(`   - Heap Total: ${peakMemory3.heapTotal.toFixed(2)} MB`);
  console.log(`   - RSS:        ${peakMemory3.rss.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(1000 / (duration3 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🎯 Memory efficiency: ${crashed3 ? '❌ CRASHED' : '✅ SURVIVED'}`);
} catch (error) {
  clearInterval(memInterval3);
  crashed3 = true;
  console.log(`\n❌ ERROR: ${error.message}`);
  console.log(`💾 Peak Memory: ${peakMemory3.heapUsed.toFixed(2)} MB heap used`);
}

console.log('\n═'.repeat(70));
console.log('📊 MEMORY PRESSURE ANALYSIS');
console.log('═'.repeat(70));

console.log(`\n💾 Memory Comparison (Peak Heap Used):\n`);

const mem1Status = crashed1 ? '❌ CRASHED' : `✅ ${peakMemory1.heapUsed.toFixed(2)} MB`;
const mem2Status = crashed2 ? '❌ CRASHED' : `✅ ${peakMemory2.heapUsed.toFixed(2)} MB`;
const mem3Status = crashed3 ? '❌ CRASHED' : `✅ ${peakMemory3.heapUsed.toFixed(2)} MB`;

console.log(`1. Promise.all (1000 concurrent):     ${mem1Status}`);
if (!crashed1) {
  console.log(`   Expected: ~1 MB payload + overhead`);
  console.log(`   Actual:   ${peakMemory1.heapUsed.toFixed(2)} MB heap`);
}

console.log(`\n2. Shared Pool (10 concurrent):       ${mem2Status}`);
if (!crashed2) {
  console.log(`   Expected: ~10 KB payload + overhead`);
  console.log(`   Actual:   ${peakMemory2.heapUsed.toFixed(2)} MB heap`);
  console.log(`   Savings:  ${((peakMemory1.heapUsed - peakMemory2.heapUsed) / peakMemory1.heapUsed * 100).toFixed(0)}% less than Promise.all`);
}

console.log(`\n3. Separate Pools (20 concurrent):    ${mem3Status}`);
if (!crashed3) {
  console.log(`   Expected: ~20 KB payload + overhead`);
  console.log(`   Actual:   ${peakMemory3.heapUsed.toFixed(2)} MB heap`);
  console.log(`   Savings:  ${((peakMemory1.heapUsed - peakMemory3.heapUsed) / peakMemory1.heapUsed * 100).toFixed(0)}% less than Promise.all`);
}

console.log(`\n🎯 Key Insights:\n`);

if (!crashed1) {
  console.log(`✅ Promise.all survived but used ${peakMemory1.heapUsed.toFixed(2)} MB`);
  console.log(`   - Risk: With 10K operations = ${(peakMemory1.heapUsed * 10).toFixed(0)} MB = OOM likely!`);
} else {
  console.log(`❌ Promise.all CRASHED with out of memory`);
  console.log(`   - 1000 concurrent operations × 1KB each = too much!`);
}

if (!crashed2 && !crashed3) {
  const poolDiff = ((peakMemory3.heapUsed - peakMemory2.heapUsed) / peakMemory2.heapUsed * 100).toFixed(0);
  console.log(`\n✅ Both pools survived:`);
  console.log(`   - Shared Pool:    ${peakMemory2.heapUsed.toFixed(2)} MB (10 concurrent)`);
  console.log(`   - Separate Pools: ${peakMemory3.heapUsed.toFixed(2)} MB (20 concurrent)`);
  console.log(`   - Difference:     ${poolDiff}% more memory for 2x throughput`);
  console.log(`   - Trade-off:      Worth it! Speed vs memory`);
}

console.log(`\n🏆 Winner for Memory Efficiency: ${
  crashed1 && !crashed2 ? 'Shared Pool (Promise.all crashed!)' :
  !crashed1 && peakMemory2.heapUsed < peakMemory1.heapUsed ? 'Shared Pool' :
  'Promise.all (but risky!)'
}`);

console.log(`\n🎯 Production Recommendation:\n`);
console.log(`Under memory pressure (limited RAM):`);
console.log(`  - Use OperationsPool with concurrency based on available memory`);
console.log(`  - Formula: concurrency = (available_MB × 1024) / payload_size_KB`);
console.log(`  - Example: 10 MB available, 1KB payload = 10 concurrent max`);
console.log(`\nFor max throughput with memory control:`);
console.log(`  - Use Separate Pools (2x throughput)`);
console.log(`  - Monitor memory: ${peakMemory3.heapUsed.toFixed(2)} MB vs ${peakMemory2.heapUsed.toFixed(2)} MB`);
console.log(`  - Accept ${poolDiff ?? '?'}% more memory for 2x speed`);
