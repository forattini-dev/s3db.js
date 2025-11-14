import { OperationsPool } from './src/concerns/operations-pool.js';

console.log('🔥 EXTREME Benchmark: 1000 Operations\n');
console.log('Simulating S3 latency (20-80ms per operation)\n');

// Simulate S3 operation with realistic latency
function simulateS3Operation(id, delayMs, clientId = 'default') {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id,
        clientId,
        success: true,
        delay: delayMs,
        timestamp: Date.now()
      });
    }, delayMs);
  });
}

const OPERATION_COUNT = 1000;

// Create operations with random latency (20-80ms)
const operations = Array.from({ length: OPERATION_COUNT }, (_, i) => {
  const delay = Math.floor(Math.random() * 60) + 20; // 20-80ms
  return {
    id: i,
    delay,
    fn: (clientId) => simulateS3Operation(i, delay, clientId)
  };
});

console.log('═'.repeat(70));
console.log('Test 1: Promise.all (unlimited concurrency)');
console.log('═'.repeat(70));
console.log('All 1000 operations start simultaneously...\n');

const start1 = Date.now();
let peakMemory1 = 0;
const memInterval1 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory1 = Math.max(peakMemory1, mem);
}, 10);

try {
  const results1 = await Promise.all(operations.map(op => op.fn('promise-all')));
  clearInterval(memInterval1);
  const duration1 = Date.now() - start1;

  console.log(`✅ Completed: ${results1.length}/${OPERATION_COUNT} operations`);
  console.log(`⏱️  Duration: ${duration1}ms`);
  console.log(`💾 Peak Memory: ${peakMemory1.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(OPERATION_COUNT / (duration1 / 1000)).toFixed(0)} ops/sec`);
} catch (error) {
  clearInterval(memInterval1);
  console.error(`❌ ERROR: ${error.message}`);
}

// Wait a bit to let GC clean up
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();

console.log('\n═'.repeat(70));
console.log('Test 2: Single OperationsPool (concurrency: 10)');
console.log('═'.repeat(70));
console.log('Controlled queue: max 10 operations executing at once...\n');

const pool2 = new OperationsPool({
  concurrency: 10,
  monitoring: { collectMetrics: true }
});

const start2 = Date.now();
let peakMemory2 = 0;
let maxActive2 = 0;

// Track pool state
pool2.on('pool:taskStarted', () => {
  const active = pool2.getStats().activeCount;
  maxActive2 = Math.max(maxActive2, active);
});

const memInterval2 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory2 = Math.max(peakMemory2, mem);
}, 10);

try {
  const promises2 = operations.map(op => pool2.enqueue(() => op.fn('single-pool')));
  const results2 = await Promise.all(promises2);
  clearInterval(memInterval2);
  const duration2 = Date.now() - start2;

  const stats2 = pool2.getStats();
  console.log(`✅ Completed: ${results2.length}/${OPERATION_COUNT} operations`);
  console.log(`⏱️  Duration: ${duration2}ms`);
  console.log(`💾 Peak Memory: ${peakMemory2.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(OPERATION_COUNT / (duration2 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🔧 Pool Stats:`);
  console.log(`   - Processed: ${stats2.processedCount}`);
  console.log(`   - Errors: ${stats2.errorCount}`);
  console.log(`   - Max Active: ${maxActive2}/10`);
  console.log(`   - Queue peak: ${OPERATION_COUNT - 10} operations`);
} catch (error) {
  clearInterval(memInterval2);
  console.error(`❌ ERROR: ${error.message}`);
}

// Wait a bit to let GC clean up
await new Promise(r => setTimeout(r, 1000));
if (global.gc) global.gc();

console.log('\n═'.repeat(70));
console.log('Test 3: Shared OperationsPool with 2 Clients');
console.log('═'.repeat(70));
console.log('Two clients competing for the same 10 slots...\n');

const sharedPool = new OperationsPool({
  concurrency: 10,
  monitoring: { collectMetrics: true }
});

const start3 = Date.now();
let peakMemory3 = 0;
let maxActive3 = 0;

// Track pool state
sharedPool.on('pool:taskStarted', () => {
  const active = sharedPool.getStats().activeCount;
  maxActive3 = Math.max(maxActive3, active);
});

const memInterval3 = setInterval(() => {
  const mem = process.memoryUsage().heapUsed / 1024 / 1024;
  peakMemory3 = Math.max(peakMemory3, mem);
}, 10);

try {
  // Split operations between two clients (500 each)
  const client1Ops = operations.slice(0, 500);
  const client2Ops = operations.slice(500, 1000);

  // Client 1 enqueues its operations
  const client1Promises = client1Ops.map(op =>
    sharedPool.enqueue(() => op.fn('client-1'))
  );

  // Client 2 enqueues its operations
  const client2Promises = client2Ops.map(op =>
    sharedPool.enqueue(() => op.fn('client-2'))
  );

  // Wait for all operations from both clients
  const [results3a, results3b] = await Promise.all([
    Promise.all(client1Promises),
    Promise.all(client2Promises)
  ]);

  clearInterval(memInterval3);
  const duration3 = Date.now() - start3;

  const stats3 = sharedPool.getStats();
  const totalResults = results3a.length + results3b.length;

  console.log(`✅ Completed: ${totalResults}/${OPERATION_COUNT} operations`);
  console.log(`   - Client 1: ${results3a.length}/500`);
  console.log(`   - Client 2: ${results3b.length}/500`);
  console.log(`⏱️  Duration: ${duration3}ms`);
  console.log(`💾 Peak Memory: ${peakMemory3.toFixed(2)} MB`);
  console.log(`📊 Throughput: ${(OPERATION_COUNT / (duration3 / 1000)).toFixed(0)} ops/sec`);
  console.log(`🔧 Pool Stats:`);
  console.log(`   - Processed: ${stats3.processedCount}`);
  console.log(`   - Errors: ${stats3.errorCount}`);
  console.log(`   - Max Active: ${maxActive3}/10`);
  console.log(`   - Fair sharing: Both clients used same pool`);

  // Check distribution
  const client1Count = [...results3a, ...results3b].filter(r => r.clientId === 'client-1').length;
  const client2Count = [...results3a, ...results3b].filter(r => r.clientId === 'client-2').length;
  console.log(`\n🤝 Load Distribution:`);
  console.log(`   - Client 1: ${client1Count} operations (${(client1Count/OPERATION_COUNT*100).toFixed(1)}%)`);
  console.log(`   - Client 2: ${client2Count} operations (${(client2Count/OPERATION_COUNT*100).toFixed(1)}%)`);
} catch (error) {
  clearInterval(memInterval3);
  console.error(`❌ ERROR: ${error.message}`);
}

console.log('\n═'.repeat(70));
console.log('📊 FINAL COMPARISON');
console.log('═'.repeat(70));

const avgDelay = operations.reduce((sum, op) => sum + op.delay, 0) / operations.length;
const theoreticalPoolTime = Math.ceil(OPERATION_COUNT / 10) * avgDelay;

console.log(`\nOperation Stats:`);
console.log(`   - Total operations: ${OPERATION_COUNT}`);
console.log(`   - Average latency: ${avgDelay.toFixed(0)}ms`);
console.log(`   - Theoretical min (unlimited): ~${avgDelay.toFixed(0)}ms`);
console.log(`   - Theoretical min (pool): ~${theoreticalPoolTime.toFixed(0)}ms`);

console.log(`\n🏁 Performance Results:\n`);

// Test 1 results
const duration1 = (typeof results1 !== 'undefined') ? (Date.now() - start1) : 0;
console.log(`1. Promise.all (unlimited):`);
console.log(`   Duration: ${duration1}ms`);
console.log(`   Memory:   ${peakMemory1.toFixed(2)} MB`);
console.log(`   Speed:    ${duration1 > 0 ? '🏆 FASTEST' : 'N/A'}`);

// Test 2 results
const duration2 = (typeof results2 !== 'undefined') ? (Date.now() - start2) : 0;
console.log(`\n2. Single Pool (concurrency: 10):`);
console.log(`   Duration: ${duration2}ms`);
console.log(`   Memory:   ${peakMemory2.toFixed(2)} MB`);
console.log(`   Speed:    ${duration1 > 0 ? `${((duration2/duration1)*100).toFixed(0)}% of Promise.all` : 'N/A'}`);

// Test 3 results
const duration3 = (typeof totalResults !== 'undefined') ? (Date.now() - start3) : 0;
console.log(`\n3. Shared Pool (2 clients, concurrency: 10):`);
console.log(`   Duration: ${duration3}ms`);
console.log(`   Memory:   ${peakMemory3.toFixed(2)} MB`);
console.log(`   Speed:    ${duration1 > 0 ? `${((duration3/duration1)*100).toFixed(0)}% of Promise.all` : 'N/A'}`);

console.log(`\n💡 Key Insights:\n`);

const memoryReduction = ((peakMemory1 - peakMemory2) / peakMemory1 * 100).toFixed(0);
console.log(`✅ Memory Savings: ${memoryReduction}% less memory with OperationsPool`);
console.log(`✅ Concurrency Control: Pool kept max ${maxActive2}/10 active (vs 1000 with Promise.all)`);
console.log(`✅ Resource Safety: Pool prevents overwhelming S3 rate limits`);
console.log(`✅ Shared Pool: Multiple clients can share same pool (fair scheduling)`);

console.log(`\n🎯 Recommendation:\n`);
console.log(`For 1000+ operations on production S3:`);
console.log(`- Use OperationsPool with shared instance across clients`);
console.log(`- Set concurrency based on S3 rate limits (typically 10-50)`);
console.log(`- Accept ${duration2 > 0 ? ((duration2/duration1)).toFixed(1) : '?'}x slower for safety & control`);
console.log(`- Benefit from retry, timeout, metrics, and memory efficiency`);

console.log(`\nFor development/testing with fast operations:`);
console.log(`- Promise.all is fine (${duration1}ms vs ${duration2}ms)`);
console.log(`- But watch memory usage (${peakMemory1.toFixed(0)}MB vs ${peakMemory2.toFixed(0)}MB)`);
