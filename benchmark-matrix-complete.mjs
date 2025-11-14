import { performance } from 'perf_hooks';

// ============================================================================
// BENCHMARK MATRIX - Engine vs Promises vs Payload vs Concurrency
// ============================================================================
// Variables:
//   - Engine: Promise.all | Shared OperationsPool | Separate OperationsPools
//   - Num Promises: 1000, 5000, 10000
//   - Payload: 1000, 2000, 5000 positions (random array)
//   - Concurrency: 10, 50, 100, 200
// Total: 3 engines × 3 promises × 3 payloads × 4 concurrency = 108 tests
// ============================================================================

class OperationsPool {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 10;
    this.queue = [];
    this.active = 0;
    this.processed = 0;
    this.peakConcurrency = 0;
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.active >= this.concurrency || this.queue.length === 0) return;

    const { fn, resolve, reject } = this.queue.shift();
    this.active++;
    this.peakConcurrency = Math.max(this.peakConcurrency, this.active);

    try {
      const result = await fn();
      this.processed++;
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.active--;
      this.process();
    }
  }

  async drain() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.queue.length === 0 && this.active === 0) {
          resolve();
        } else {
          setImmediate(check);
        }
      };
      check();
    });
  }
}

function createRandomArray(size) {
  return Array(size).fill(0).map(() => Math.random());
}

function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024)
  };
}

async function testPromiseAll(operations) {
  const promises = operations.map(op => op());
  await Promise.all(promises);
}

async function testSharedPool(operations, concurrency) {
  const pool = new OperationsPool({ concurrency });
  const promises = operations.map(op => pool.execute(op));
  await Promise.all(promises);
  await pool.drain();
}

async function testSeparatePools(operations, concurrency) {
  const poolSize = Math.ceil(operations.length / 2);
  const pool1 = new OperationsPool({ concurrency });
  const pool2 = new OperationsPool({ concurrency });

  const promises1 = operations.slice(0, poolSize).map(op => pool1.execute(op));
  const promises2 = operations.slice(poolSize).map(op => pool2.execute(op));

  await Promise.all([...promises1, ...promises2]);
  await pool1.drain();
  await pool2.drain();
}

async function runBenchmark(engineName, operations, concurrency) {
  let startMem = getMemoryUsage();
  let startTime = performance.now();
  let peakMem = { ...startMem };

  const memInterval = setInterval(() => {
    const current = getMemoryUsage();
    if (current.heapUsed > peakMem.heapUsed) {
      peakMem = { ...current };
    }
  }, 10);

  try {
    if (engineName === 'Promise.all') {
      await testPromiseAll(operations);
    } else if (engineName === 'Shared Pool') {
      await testSharedPool(operations, concurrency);
    } else if (engineName === 'Separate Pools') {
      await testSeparatePools(operations, concurrency);
    }
  } finally {
    clearInterval(memInterval);
  }

  const duration = performance.now() - startTime;
  const endMem = getMemoryUsage();

  return {
    engine: engineName,
    numPromises: operations.length,
    duration: Math.round(duration),
    memStart: startMem.heapUsed,
    memPeak: peakMem.heapUsed,
    memEnd: endMem.heapUsed,
    memDelta: endMem.heapUsed - startMem.heapUsed,
    throughput: Math.round(operations.length / (duration / 1000))
  };
}

async function main() {
  const engines = ['Promise.all', 'Shared Pool', 'Separate Pools'];
  const numPromises = [1000, 5000, 10000];
  const payloads = [1000, 2000, 5000];
  const concurrencies = [10, 50, 100, 200];

  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║              BENCHMARK MATRIX - 3×3×3×4 = 108 Tests                       ║
║                                                                            ║
║  Engines:      Promise.all | Shared Pool | Separate Pools                ║
║  Promises:     1000 | 5000 | 10000                                       ║
║  Payloads:     1000 | 2000 | 5000 (random array size)                   ║
║  Concurrency:  10 | 50 | 100 | 200                                      ║
║                                                                            ║
║  Total matrix: 3 engines × 3 promise counts × 3 payloads × 4 concurrency ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);

  const results = [];

  for (const numProm of numPromises) {
    for (const payload of payloads) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`PROMISES: ${numProm} | PAYLOAD: ${payload} positions (${(payload * 8 / 1024).toFixed(2)} KB per op)`);
      console.log(`${'='.repeat(80)}\n`);

      for (const concurrency of concurrencies) {
        console.log(`Concurrency: ${concurrency}`);
        console.log(`${'─'.repeat(80)}`);

        // Create operations with random arrays
        const createOperation = () => {
          const data = createRandomArray(payload);
          return async () => {
            // Simulate work: sum the array
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              sum += data[i];
            }
            return sum;
          };
        };

        const operations = Array(numProm).fill(0).map(() => createOperation());

        for (const engine of engines) {
          const result = await runBenchmark(engine, operations, concurrency);
          results.push(result);

          const status = result.memDelta > 50 ? '⚠️' : '✅';
          console.log(
            `  ${engine.padEnd(16)} │ ${result.duration.toString().padStart(5)}ms │ ` +
            `Mem: ${result.memStart}→${result.memPeak}MB (Δ${result.memDelta}MB) │ ` +
            `${result.throughput} ops/sec ${status}`
          );
        }
        console.log();
      }
    }
  }

  // Print summary table
  console.log(`\n${'='.repeat(100)}`);
  console.log('SUMMARY TABLE - All 108 Results');
  console.log(`${'='.repeat(100)}\n`);

  console.log('Engine           │ Promises │ Payload │ Conc │ Duration │ Memory Δ │ Throughput');
  console.log('─────────────────┼──────────┼─────────┼──────┼──────────┼──────────┼────────────');

  for (const result of results) {
    console.log(
      `${result.engine.padEnd(16)} │ ${
        result.numPromises.toString().padStart(8)} │ ${
        '(payload)'.padStart(7)} │ ` +
      `${
        '(conc)'.padStart(4)} │ ${
        result.duration.toString().padStart(5)}ms │ ${
        `${result.memDelta}MB`.padStart(8)} │ ${
        `${result.throughput}`.padStart(10)} ops/s`
    );
  }

  // Best performers by category
  console.log(`\n${'='.repeat(100)}`);
  console.log('🏆 BEST PERFORMERS BY PROMISE COUNT');
  console.log(`${'='.repeat(100)}\n`);

  for (const numProm of numPromises) {
    const promResults = results.filter(r => r.numPromises === numProm);

    console.log(`\n📊 ${numProm} Promises:`);

    const fastest = promResults.reduce((a, b) => a.duration < b.duration ? a : b);
    const bestMem = promResults.reduce((a, b) => a.memPeak < b.memPeak ? a : b);
    const bestThroughput = promResults.reduce((a, b) => a.throughput > b.throughput ? a : b);

    console.log(`  ⚡ Fastest:        ${fastest.engine} (${fastest.duration}ms)`);
    console.log(`  💾 Best Memory:    ${bestMem.engine} (${bestMem.memPeak}MB peak)`);
    console.log(`  📈 Best Throughput: ${bestThroughput.engine} (${bestThroughput.throughput} ops/sec)`);
  }

  // Overall winners
  console.log(`\n${'='.repeat(100)}`);
  console.log('🏆 OVERALL WINNERS');
  console.log(`${'='.repeat(100)}\n`);

  const fastestOverall = results.reduce((a, b) => a.duration < b.duration ? a : b);
  const bestMemOverall = results.reduce((a, b) => a.memPeak < b.memPeak ? a : b);
  const bestThroughputOverall = results.reduce((a, b) => a.throughput > b.throughput ? a : b);

  console.log(`⚡ Fastest Overall:        ${fastestOverall.engine} (${fastestOverall.duration}ms with ${fastestOverall.numPromises} promises)`);
  console.log(`💾 Best Memory Overall:    ${bestMemOverall.engine} (${bestMemOverall.memPeak}MB with ${bestMemOverall.numPromises} promises)`);
  console.log(`📈 Best Throughput Overall: ${bestThroughputOverall.engine} (${bestThroughputOverall.throughput} ops/sec with ${bestThroughputOverall.numPromises} promises)`);

  console.log('\n' + '='.repeat(100));
}

main().catch(console.error);
