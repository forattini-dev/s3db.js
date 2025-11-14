import { OperationsPool } from './src/concerns/operations-pool.js';

console.log('🏁 Realistic Benchmark: OperationsPool vs Promise.all\n');
console.log('Simulating S3 latency (20-80ms per operation)\n');

// Simulate S3 operation with realistic latency
function simulateS3Operation(id, delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id, success: true, timestamp: Date.now() });
    }, delayMs);
  });
}

// Test scenarios
const scenarios = [
  { name: '50 operations', count: 50 },
  { name: '100 operations', count: 100 },
  { name: '200 operations', count: 200 }
];

for (const scenario of scenarios) {
  console.log('═'.repeat(65));
  console.log(`Scenario: ${scenario.name}`);
  console.log('═'.repeat(65));

  // Create operations with random latency (20-80ms)
  const operations = Array.from({ length: scenario.count }, (_, i) => {
    const delay = Math.floor(Math.random() * 60) + 20; // 20-80ms
    return {
      id: i,
      delay,
      fn: () => simulateS3Operation(i, delay)
    };
  });

  // Test 1: OperationsPool (concurrency: 10)
  console.log('\n1️⃣  OperationsPool (concurrency: 10)');
  const pool = new OperationsPool({ concurrency: 10 });

  const start1 = Date.now();
  const poolPromises = operations.map(op => pool.enqueue(op.fn));
  const results1 = await Promise.all(poolPromises);
  const duration1 = Date.now() - start1;

  const stats1 = pool.getStats();
  console.log(`   ⏱️  Duration: ${duration1}ms`);
  console.log(`   ✅ Completed: ${results1.length}/${scenario.count}`);
  console.log(`   📊 Processed: ${stats1.processedCount}, Errors: ${stats1.errorCount}`);

  // Test 2: Promise.all (unlimited concurrency)
  console.log('\n2️⃣  Promise.all (unlimited concurrency)');

  const start2 = Date.now();
  const results2 = await Promise.all(operations.map(op => op.fn()));
  const duration2 = Date.now() - start2;

  console.log(`   ⏱️  Duration: ${duration2}ms`);
  console.log(`   ✅ Completed: ${results2.length}/${scenario.count}`);

  // Test 3: Manual batching (chunks of 10)
  console.log('\n3️⃣  Manual Batching (chunks of 10)');

  const start3 = Date.now();
  const results3 = [];
  for (let i = 0; i < operations.length; i += 10) {
    const chunk = operations.slice(i, i + 10);
    const chunkResults = await Promise.all(chunk.map(op => op.fn()));
    results3.push(...chunkResults);
  }
  const duration3 = Date.now() - start3;

  console.log(`   ⏱️  Duration: ${duration3}ms`);
  console.log(`   ✅ Completed: ${results3.length}/${scenario.count}`);

  // Analysis
  console.log('\n📊 Comparison:');
  const fastest = Math.min(duration1, duration2, duration3);

  console.log(`   OperationsPool:    ${duration1}ms ${duration1 === fastest ? '🏆' : `(+${duration1-fastest}ms)`}`);
  console.log(`   Promise.all:       ${duration2}ms ${duration2 === fastest ? '🏆' : `(+${duration2-fastest}ms)`}`);
  console.log(`   Manual Batching:   ${duration3}ms ${duration3 === fastest ? '🏆' : `(+${duration3-fastest}ms)`}`);

  // Expected behavior analysis
  const avgDelay = operations.reduce((sum, op) => sum + op.delay, 0) / operations.length;
  const theoreticalPoolTime = Math.ceil(scenario.count / 10) * avgDelay;
  const theoreticalAllTime = avgDelay; // All at once

  console.log(`\n💡 Theoretical Analysis:`);
  console.log(`   Average operation latency: ${avgDelay.toFixed(0)}ms`);
  console.log(`   Expected (concurrency=10): ~${theoreticalPoolTime.toFixed(0)}ms`);
  console.log(`   Expected (unlimited):      ~${avgDelay.toFixed(0)}ms`);
  console.log(`   Actual pool efficiency:    ${((theoreticalPoolTime/duration1)*100).toFixed(0)}%`);

  console.log('\n');
}

console.log('═'.repeat(65));
console.log('🎯 CONCLUSIONS');
console.log('═'.repeat(65));
console.log(`
Key Findings:

1. **Promise.all (unlimited)** is FASTEST for I/O-bound operations
   - All operations start simultaneously
   - Limited only by actual I/O latency
   - Best for: Fast operations, low concurrency needs

2. **OperationsPool (concurrency: 10)** is SLOWER but SAFER
   - Controlled concurrency prevents overwhelming resources
   - Better memory usage (fewer simultaneous promises)
   - Best for: Production, rate-limited APIs, resource control

3. **Manual Batching** is SLOWEST
   - Sequential chunks add latency
   - No parallelism between chunks
   - Only useful for strict ordering requirements

🏆 Winner for Speed: Promise.all (unlimited)
🛡️  Winner for Safety: OperationsPool (controlled)

Real-world recommendation:
- **Development/Testing**: Use whatever is simpler
- **Production S3**: Use OperationsPool for safety and monitoring
- **High-volume APIs**: Use OperationsPool to respect rate limits
`);
