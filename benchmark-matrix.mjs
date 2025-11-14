import { performance } from 'perf_hooks';

// ============================================================================
// BENCHMARK MATRIX - Engine vs Payload vs Concurrency
// ============================================================================
// Variables:
//   - Engine: Promise.all | Shared OperationsPool | Separate OperationsPools
//   - Payload: 1000, 2000, 5000 positions (random array)
//   - Concurrency: 10, 50, 100, 200
// Total: 3 engines × 3 payloads × 4 concurrency levels = 36 tests
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
  const payloads = [1000, 2000, 5000];
  const concurrencies = [10, 50, 100, 200];

  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    BENCHMARK MATRIX - 3×3×4 = 36 Tests                    ║
║                                                                            ║
║  Engines:      Promise.all | Shared Pool | Separate Pools                ║
║  Payloads:     1000 | 2000 | 5000 (random array size)                   ║
║  Concurrency:  10 | 50 | 100 | 200                                      ║
║  Total Ops:    1000 per test (100 operations × payload size bytes)        ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);

  const results = [];

  for (const payload of payloads) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`PAYLOAD: ${payload} positions (${(payload * 8 / 1024).toFixed(2)} KB per operation)`);
    console.log(`${'='.repeat(80)}\n`);

    for (const concurrency of concurrencies) {
      console.log(`Concurrency: ${concurrency}`);
      console.log(`${'─'.repeat(80)}`);

      // Create 100 operations with random arrays
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

      const operations = Array(100).fill(0).map(() => createOperation());

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

  // Print summary table
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY TABLE - All 36 Results');
  console.log(`${'='.repeat(80)}\n`);

  console.log('Engine           │ Payload │ Conc │ Duration │ Memory Δ │ Throughput');
  console.log('─────────────────┼─────────┼──────┼──────────┼──────────┼────────────');

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const payloadIndex = Math.floor(i / 12);
    const concIndex = Math.floor((i % 12) / 3);
    const payload = payloads[payloadIndex];
    const concurrency = concurrencies[concIndex];

    console.log(
      `${result.engine.padEnd(16)} │ ${
        payload.toString().padStart(5)} │ ${
        concurrency.toString().padStart(3)} │ ${
        result.duration.toString().padStart(5)}ms │ ${
        `${result.memDelta}MB`.padStart(8)} │ ${
        `${result.throughput}`.padStart(10)} ops/s`
    );
  }

  // Best performers
  console.log(`\n${'='.repeat(80)}`);
  console.log('🏆 BEST PERFORMERS');
  console.log(`${'='.repeat(80)}\n`);

  const fastestByPayload = {};
  const bestMemoryByPayload = {};

  payloads.forEach(payload => {
    const payloadResults = results.filter((_, i) => {
      const payloadIndex = payloads.indexOf(payload);
      return Math.floor((i / 3) % 4) === 0 && Math.floor(i / 12) === payloadIndex;
    });

    if (payloadResults.length > 0) {
      const fastest = payloadResults.reduce((a, b) => a.duration < b.duration ? a : b);
      const bestMem = payloadResults.reduce((a, b) => a.memDelta < b.memDelta ? a : b);

      console.log(`\nPayload ${payload}:`);
      console.log(`  Fastest:        ${fastest.engine} (${fastest.duration}ms)`);
      console.log(`  Best Memory:    ${bestMem.engine} (Δ${bestMem.memDelta}MB)`);
    }
  });

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
